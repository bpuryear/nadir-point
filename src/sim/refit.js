import * as THREE from 'three';
import { EV } from '../core/events.js';
import { getModule, HARDPOINTS } from '../core/contracts.js';
import { WeaponMount } from './ship.js';
import {
  repairCost, scrapYield, grantMul, conditionLabel, clamp01, CONDITION,
} from './condition.js';
import { AMMO_SPEC } from './stores.js';
import { breakDownItem } from './meta/index.js';

/**
 * Tonnage the installed fit is measured against. Not the hull's mass, deliberately:
 * module masses are three orders of magnitude below hull mass, so wiring the handling
 * penalty to `classDef.mass` makes mass inert (a 10,020 t fit on a 620,000 t hull is
 * -1.6% acceleration, which no player can feel). The decoupled reference is the right
 * mechanism; only its constant was wrong.
 *
 * MEASURED, against the module library as it stands. The heaviest legal six-mount fit
 * is 10,020 t — bow_siege_lance 1180 + dorsal_rail_battery 1420 + ventral_hangar_deck
 * 2400 + port_broadside_battery 1560 + its starboard mirror 1560 + engine_jump_drive
 * 1900. At the old 1800 that is massLoad 6.567: -84.8% acceleration, -61.0% turn and,
 * through `stores.js:284`, a 6.57x propellant bill — "never fit anything heavy".
 * At 35500 it is massLoad 1.282: -22.0% acceleration and, at the 0.6 exponent below,
 * -13.9% turn rate FROM MASS ALONE.
 *
 * That is not what the player feels, and this comment used to stop at that number and
 * claim it matched `docs/design/controls.md:1165-1169`'s -22%/-14% target. Measured
 * through the real RefitSystem with those six modules actually installed, the hull loses
 * -22.8% acceleration and -24.2% turn rate. The turn figure is 10 points worse than the
 * mass model alone predicts because modules also carry explicit handling `grants` --
 * `ventral_hangar_deck` alone declares `{ thrust: -0.10, turnRate: -0.12 }`
 * (`art/geometry/modules/ventral.js:181`) -- and those multiply on top of massLoad.
 *
 * So mass is calibrated against the spec; the DELIVERED figure is the mass model plus
 * whatever the fitted modules grant, and only the acceleration half lands near target.
 * Quote -22.8/-24.2 when describing the fit, and -22.0/-13.9 only when describing this
 * constant in isolation.
 */
const REFERENCE_FIT_MASS = 35500;

/**
 * Turn-rate penalty exponent. `controls.md:1160` specifies 0.6; the code had 0.5
 * (`Math.sqrt`). At the heaviest fit that is the difference between -11.7% and -13.9%
 * turn rate, i.e. between missing and hitting the spec's own -14% target.
 */
const MASS_TURN_EXP = 0.6;

/**
 * The two mounts that accept each other's parts. One definition, because "port and
 * starboard are interchangeable" is asserted in three places in this file and the
 * geometry stream asserts it again in `art/geometry/hardpoints.js:406-409`.
 */
const MIRRORED_PAIR = { port: 'starboard', starboard: 'port' };

/** A hot mount cannot be worked on. Servicing waits for it to fall below this. */
const SERVICE_HEAT = 0.35;

/** What a dead sub-part currently costs you, in the triage screen's own words. */
const PART_DETAIL = {
  output: 'DESTROYED — module inert',
  feed: 'DESTROYED — rate of fire -65%',
  traverse: 'DESTROYED — arc frozen, ship must aim',
  cooling: 'DESTROYED — cooks in half the time',
  mount: 'DESTROYED — module has come off',
};

/**
 * Refit: turning salvaged parts into a different ship.
 *
 * This is where the progression fantasy actually lands. Installing a module must do
 * three things at once, or it does none of them:
 *   1. change the 3D model live, with no hitch
 *   2. change the silhouette enough to be legible at tactical zoom
 *   3. change how the ship fights, immediately
 *
 * The attachment implementation is injected rather than imported so this system can be
 * unit-tested and so the geometry stream owns the geometry half outright.
 */
export class RefitSystem {
  /**
   * @param {import('../core/world.js').World} world
   * @param {Object} attachment  { attachModule, detachModule } from art/geometry/hardpoints.js
   */
  constructor(world, attachment) {
    this.world = world;
    this.bus = world.bus;
    this.attachment = attachment;
    this.rng = world.rng.fork('refit');
    this.name = 'refit';
    this.order = 90;

    /** Repair and install both cost materials and time. */
    this.installTime = 2.5;
    this.pending = null;

    /**
     * THE REPAIR QUEUE.
     *
     * Repair is not instant and it is not free, which is what turns "fix everything"
     * into "fix what matters first". One job runs at a time; the rest wait. Materials
     * are taken when the job starts, so queuing a repair you cannot afford fails loudly
     * at the moment you ask for it rather than silently later.
     */
    this.queue = [];
    this.active = null;
    /** Condition restored per second of work. A full rebuild is about half a minute. */
    this.repairRate = 0.035;
    this._planRows = [];

    // The engine is the only clock this system can trust. `game.js` registers the
    // refit system with `world.register` but not with the engine, so it ticks itself.
    // Guarded so a later integration pass that adds `engine.add(refit)` cannot make
    // repairs run at double speed.
    const engine = world.engine;
    if (engine && !engine.systems.includes(this)) engine.add(this);
  }

  get player() { return this.world.player; }

  /** Materials pool, with the three tiers this economy actually uses. */
  get materials() { return this.world.materials; }

  /** Can this stored part go on this mount right now, and if not, why not. */
  canInstall(hardpointId, moduleId) {
    const p = this.player;
    if (!p) return { ok: false, reason: 'no ship' };
    const hp = p.hardpoints.get(hardpointId);
    if (!hp) return { ok: false, reason: `unknown hardpoint "${hardpointId}"` };
    if (hp.breached) return { ok: false, reason: 'hardpoint breached - repair the structure first' };

    const def = getModule(moduleId);
    if (!def) return { ok: false, reason: `unknown module "${moduleId}"` };

    // Port and starboard accept the same parts; the attachment system mirrors them.
    const accepts = def.hardpoint === hardpointId || MIRRORED_PAIR[hardpointId] === def.hardpoint;
    if (!accepts) return { ok: false, reason: `${def.name} does not mount on ${hardpointId}` };

    const hpDef = this._hardpointDef(hardpointId);
    if (hpDef && def.tier > hpDef.maxTier) {
      return { ok: false, reason: `mount is tier ${hpDef.maxTier}, module is tier ${def.tier}` };
    }
    if (hp.module) return { ok: false, reason: 'mount occupied', occupied: hp.module };
    return { ok: true };
  }

  _hardpointDef(id) {
    return this.world.hullResult?.hardpoints?.get(id)?.def ?? null;
  }

  /**
   * Where a mount actually sits and which way it actually points.
   *
   * THE RULE: the TARGET hardpoint's definition is used verbatim. Port and starboard
   * accept each other's parts, and `art/geometry/hardpoints.js:406-424` mirrors the
   * module's GEOMETRY — but it mirrors it inside the target socket, and that socket is
   * parented at the target hardpoint's own anchor with identity rotation and unit
   * scale (`hardpoints.js:267-274`). The mount's position and arc are therefore the
   * target's already, and negating them is not a correction, it is a second mirror.
   *
   * THE BUG THIS REPLACES. `mirrored = hpId === 'starboard' && def.hardpoint ===
   * 'port'` gated `anchor[0] * -1` and `-hpDef.yawCentre`, where `anchor` and `hpDef`
   * BOTH came from `_hardpointDef(hpId)` — the target. A port-authored cannon bank
   * fitted to starboard resolved to x -158 (`CRUISER_ANCHORS.port`) with yawCentre
   * +PI/2 (the port arc) while its geometry sat on the starboard sponson. Both flanks
   * simulated as the port flank, which makes a two-broadside fit — one of the two
   * archetypes the armament spec exists to differentiate — unbuildable.
   *
   * Mirroring is correct only when the anchor in hand is the AUTHORED side's and the
   * authored side is not the target side, which is the fallback below. With all six
   * cruiser hardpoints registered together (`CRUISER_HARDPOINTS`) that fallback never
   * fires on the live path; it is here so the rule is stated in code rather than
   * inferred from the absence of a branch.
   *
   * @returns {{hpDef: Object|null, mirror: 1|-1}}
   */
  _mountFrame(hardpointId, def) {
    const target = this._hardpointDef(hardpointId);
    if (target) return { hpDef: target, mirror: 1 };

    const authoredId = def?.hardpoint;
    const authored = authoredId && authoredId !== hardpointId ? this._hardpointDef(authoredId) : null;
    if (!authored) return { hpDef: null, mirror: 1 };
    return { hpDef: authored, mirror: MIRRORED_PAIR[hardpointId] === authoredId ? -1 : 1 };
  }

  /**
   * Install a stored part. Returns the removed part's inventory entry if it swapped.
   * The model updates in the same call - a refit screen that shows the change a frame
   * later than the click reads as broken.
   */
  install(hardpointId, inventoryUid) {
    const p = this.player;
    const w = this.world;
    const idx = w.inventory.findIndex((i) => i.uid === inventoryUid);
    if (idx < 0) return { ok: false, reason: 'not in inventory' };
    const item = w.inventory[idx];

    let check = this.canInstall(hardpointId, item.moduleId);
    if (!check.ok && check.occupied) {
      this.uninstall(hardpointId);
      check = this.canInstall(hardpointId, item.moduleId);
    }
    if (!check.ok) return check;

    const def = getModule(item.moduleId);
    const hp = p.hardpoints.get(hardpointId);

    const attached = this.attachment.attachModule(w.hullResult, hardpointId, def, {
      rng: this.rng.fork(`${hardpointId}:${def.id}`),
      materials: w.systems.materials,
      palette: w.systems.palette,
      faction: def.faction,
      lod: 0,
    });

    hp.module = { ...item, def };
    hp.object = attached.object;
    hp.warned = false;
    hp.structureHP = hp.maxStructureHP;

    w.inventory.splice(idx, 1);
    this._applyModuleEffects(p);
    this.bus.emit(EV.MODULE_INSTALLED, { hardpoint: hardpointId, module: def, ship: p });
    return { ok: true, module: def };
  }

  /** Remove a module back into the hold. Fails if the hold is full. */
  uninstall(hardpointId) {
    const p = this.player;
    const hp = p?.hardpoints.get(hardpointId);
    if (!hp?.module) return { ok: false, reason: 'nothing installed' };

    // The hold is measured in cubic metres when the economy layer is installed, and a
    // slot count otherwise. Pulling a hangar deck off into a hold that is already full
    // of scrap is exactly the decision volume exists to create.
    const hold = this.world.systems.cargo;
    let volume;
    if (hold) {
      const room = hold.canTakeModule(hp.module.def);
      if (!room.ok) return { ok: false, reason: room.reason, volume: room.volume, free: room.free };
      volume = room.volume;
    } else {
      const cargo = this.world.systems.salvage?.cargoCapacity ?? 6;
      if (this.world.inventory.length >= cargo) return { ok: false, reason: 'hold is full' };
    }

    this._captureMountState(p);
    this.attachment.detachModule(this.world.hullResult, hardpointId);
    const item = hp.module;
    hp.module = null;
    hp.object = null;
    // fireMode and excluded ride the part into the hold and back out again: `install`
    // spreads the inventory entry onto the new instance record, so a battery you set
    // to SALVO stays SALVO across a swap instead of quietly reverting.
    this.world.inventory.push({
      moduleId: item.def.id, condition: item.condition ?? 1, uid: item.uid, volume,
      fireMode: item.fireMode, excluded: item.excluded,
    });
    this._applyModuleEffects(p);
    this.bus.emit(EV.MODULE_REMOVED, { hardpoint: hardpointId, module: item.def, ship: p });
    return { ok: true };
  }

  /**
   * Write the player's per-mount choices back onto the module instance records.
   *
   * Every WeaponMount on the hull is rebuilt from scratch by `_applyModuleEffects`,
   * which runs on every install, every uninstall and every completed repair job. The
   * instance record is the only thing that survives that rebuild, so `fireMode` and
   * `excluded` have to be parked on it first or finishing a bow repair would quietly
   * un-exclude a cooked starboard barrel and reset both flanks to their defaults.
   *
   * Called before the rebuild, and again from `uninstall` before the record is
   * detached - `uninstall` nulls `hp.module` before it reaches `_applyModuleEffects`,
   * so by then there is nothing left to write to.
   */
  _captureMountState(ship) {
    for (const m of ship?.weapons ?? []) {
      const rec = m.hardpoint ? ship.hardpoints.get(m.hardpoint)?.module : null;
      if (!rec || rec.def !== m.moduleDef) continue;
      rec.fireMode = m.fireMode;
      rec.excluded = m.excluded;
    }
  }

  /**
   * Recompute everything the hull's fit contributes: weapon mounts, power output,
   * thrust, hangar bays, cargo, sensors, shields. Called after every change so there
   * is exactly one place where a loadout turns into statistics.
   */
  _applyModuleEffects(ship) {
    const w = this.world;

    this._captureMountState(ship);
    ship.weapons.length = 0;
    let installedMass = 0;
    let powerBonus = 0;
    let thrustMul = 1;
    let turnMul = 1;
    let hangarBays = 0;
    let cargo = 6;
    let sensorRange = 0;
    let shieldCapacity = 0;
    let salvageRate = 0;

    for (const [hpId, hp] of ship.hardpoints) {
      const def = hp.module?.def;
      if (!def) continue;

      // The instance's condition, not the definition's. This is the number that came
      // off the wreck and it follows the part onto the hull.
      const condition = hp.module.condition ?? 1;
      installedMass += def.mass ?? 0;

      if (def.weapon) {
        const { hpDef, mirror } = this._mountFrame(hpId, def);
        const anchor = hpDef?.anchor ?? [0, 0, 0];
        const localPosition = new THREE.Vector3(anchor[0] * mirror, anchor[1], anchor[2]);
        const yawCentre = (hpDef?.yawCentre ?? 0) * mirror;
        ship.weapons.push(new WeaponMount(def.weapon, {
          localPosition,
          yawCentre,
          yawWidth: def.weapon.yawWidth ?? hpDef?.yawWidth ?? Math.PI * 0.5,
          hardpoint: hpId,
          condition,
          moduleDef: def,
          containerHP: hp.maxStructureHP,
          // Restored from the instance record, so a mode the player set survives a
          // repair, an uninstall into the hold and the reinstall that follows it.
          fireMode: hp.module.fireMode,
          excluded: hp.module.excluded,
        }));
      }

      // Passive grants scale with condition too. A 0.4 reactor is a worse reactor, so
      // "install it now and repair it later" is a real, costed choice rather than free.
      const cg = grantMul(condition);
      const g = def.grants ?? {};
      powerBonus += (g.powerOutput ?? 0) * cg;
      thrustMul *= 1 + (g.thrust ?? 0) * cg;
      turnMul *= 1 + (g.turnRate ?? 0) * cg;
      hangarBays += g.hangarBays ?? 0;
      cargo += g.cargo ?? 0;
      sensorRange = Math.max(sensorRange, g.sensorRange ?? 0);
      shieldCapacity += (g.shieldCapacity ?? 0) * cg;
      salvageRate += (g.salvageRate ?? 0) * cg;
    }

    // Installed mass over a reference fit. It slows the hull down and, through
    // stores.js, it makes every burn cost more propellant - so filling all six mounts
    // with the heaviest thing that fits is a decision with a bill attached.
    ship.massLoad = 1 + installedMass / REFERENCE_FIT_MASS;

    ship.power.bonusOutput = powerBonus;
    ship.body.accel = ship.classDef.accel * thrustMul / ship.massLoad;
    ship.body.turnRate = ship.classDef.turnRate * turnMul / Math.pow(ship.massLoad, MASS_TURN_EXP);
    ship.shields.max = shieldCapacity;
    ship.shields.regen = shieldCapacity * 0.06;
    if (ship.shields.current > ship.shields.max) ship.shields.current = ship.shields.max;

    if (w.systems.salvage) {
      // `grants.cargo` is authored as 600, which reads as +600 m3 to the volume-based
      // hold. When that hold exists it is the binding constraint and this slot count is
      // only a sanity ceiling, so it must not fall back to six.
      w.systems.salvage.cargoCapacity = w.systems.cargo ? Math.max(12, cargo) : cargo;
      w.systems.salvage.tractorRating = salvageRate;
    }

    // The two systems that gate themselves behind hardware. Power routing stays out of
    // the player's hands until they have a reactor to route, and the RTS command layer
    // does not exist until there is a hangar to launch from. Introducing both at once
    // is how a good system reads as homework.
    const hadPower = w.unlocked.powerRouting;
    w.unlocked.powerRouting = powerBonus > 0;
    ship.power.unlocked = w.unlocked.powerRouting;
    if (!hadPower && w.unlocked.powerRouting) {
      this.bus.emit(EV.NOTIFY, { text: 'REACTOR ONLINE — power routing available', important: true });
    }

    const hadHangar = w.unlocked.hangar;
    w.unlocked.hangar = hangarBays > 0;
    w.hangarBays = hangarBays;
    if (!hadHangar && w.unlocked.hangar) {
      this.bus.emit(EV.NOTIFY, { text: `HANGAR DECK ONLINE — ${hangarBays} strike craft available`, important: true });
    }

    ship._refreshEfficiency();
  }

  /** Structural repair of a breached mount, paid for in materials. */
  repairHardpoint(hardpointId) {
    const p = this.player;
    const hp = p?.hardpoints.get(hardpointId);
    if (!hp) return { ok: false, reason: 'unknown hardpoint' };
    if (hp.structureHP >= hp.maxStructureHP) return { ok: false, reason: 'no damage' };

    const missing = hp.maxStructureHP - hp.structureHP;
    const cost = Math.ceil(missing * 0.25);
    if (this.world.materials.alloy < cost) {
      return { ok: false, reason: `needs ${cost} alloy, have ${this.world.materials.alloy}` };
    }
    this.world.materials.alloy -= cost;
    hp.structureHP = hp.maxStructureHP;
    hp.breached = false;
    hp.warned = false;
    return { ok: true, cost };
  }

  /** Hull repair. Slower and more expensive than structure, deliberately. */
  repairHull(amount) {
    const p = this.player;
    if (!p) return { ok: false, reason: 'no ship' };
    const missing = Math.min(amount, p.maxHullHP - p.hullHP);
    if (missing <= 0) return { ok: false, reason: 'no damage' };
    const cost = Math.ceil(missing * 0.5);
    if (this.world.materials.alloy < cost) {
      return { ok: false, reason: `needs ${cost} alloy, have ${this.world.materials.alloy}` };
    }
    this.world.materials.alloy -= cost;
    p.hullHP += missing;
    return { ok: true, cost, repaired: missing };
  }

  // -------------------------------------------------------------------------
  // CONDITION-AWARE REPAIR. Scarcity is the point: alloy spent here is alloy not
  // spent on ammunition, and a part too far gone is cheaper to scrap than to save.
  // -------------------------------------------------------------------------

  /** The module instance on a mount, wherever it lives. */
  _installed(hardpointId) {
    const hp = this.player?.hardpoints.get(hardpointId);
    if (!hp?.module) return null;
    const mount = this.player.weapons.find((m) => m.hardpoint === hardpointId) ?? null;
    return { hp, item: hp.module, def: hp.module.def, mount };
  }

  /** Can we take materials for this job right now? */
  _afford(cost) {
    const m = this.materials;
    if ((m.alloy ?? 0) < cost.alloy) return { ok: false, reason: `needs ${cost.alloy} alloy, have ${Math.floor(m.alloy ?? 0)}` };
    if ((m.composite ?? 0) < cost.composite) return { ok: false, reason: `needs ${cost.composite} composite, have ${Math.floor(m.composite ?? 0)}` };
    if ((m.exotic ?? 0) < cost.exotic) return { ok: false, reason: `needs ${cost.exotic} exotic, have ${Math.floor(m.exotic ?? 0)}` };
    return { ok: true };
  }

  _spend(cost) {
    const m = this.materials;
    m.alloy -= cost.alloy;
    m.composite -= cost.composite;
    m.exotic -= cost.exotic;
  }

  /**
   * Queue a module repair.
   *
   * `to` lets the player buy a partial repair, which matters enormously under scarcity:
   * lifting a cannon bank from 0.35 to 0.55 costs a fraction of a full rebuild and
   * clears the misfeed band, which is often the only thing that actually mattered.
   */
  repairModule(hardpointId, to = 1) {
    const found = this._installed(hardpointId);
    if (!found) return { ok: false, reason: 'nothing installed' };
    const from = found.item.condition ?? 1;
    if (from >= to) return { ok: false, reason: 'no wear' };

    const cost = repairCost(found.def.mass ?? 200, from, to);
    const afford = this._afford(cost);
    if (!afford.ok) return { ok: false, reason: afford.reason, cost };

    this._spend(cost);
    const job = {
      kind: 'module', hardpointId, from, to, cost,
      remaining: (to - from) / this.repairRate, total: (to - from) / this.repairRate,
      label: `${found.def.name} → ${Math.round(to * 100)}%`,
    };
    this.queue.push(job);
    return { ok: true, job, cost };
  }

  /**
   * Queue a sub-part rebuild.
   *
   * Cheaper than replacing the module and it is usually the correct call: a dead
   * traverse ring costs a fraction of a new cannon bank and restores the thing that was
   * actually lost. Servos are the one place this economy asks for exotics.
   */
  repairPart(hardpointId, partId) {
    const found = this._installed(hardpointId);
    if (!found?.mount) return { ok: false, reason: 'no mount there' };
    const part = found.mount.parts.get(partId);
    if (!part) return { ok: false, reason: `unknown part "${partId}"` };
    if (!part.destroyed && part.hp >= part.maxHP) return { ok: false, reason: 'no damage' };

    const cost = this._partCost(found.def, part);
    const afford = this._afford(cost);
    if (!afford.ok) return { ok: false, reason: afford.reason, cost };

    this._spend(cost);
    const seconds = part.destroyed ? 14 : 6;
    const job = {
      kind: 'part', hardpointId, partId, cost,
      remaining: seconds, total: seconds,
      label: `${found.def.name} · ${part.label}`,
    };
    this.queue.push(job);
    return { ok: true, job, cost };
  }

  _partCost(def, part) {
    const mass = def.mass ?? 200;
    const share = part.def.hpShare ?? 0.25;
    const wrecked = part.destroyed ? 1 : 1 - part.health;
    const base = mass * 0.06 * share * (0.4 + wrecked);
    return {
      alloy: Math.ceil(base),
      composite: Math.ceil(base * (part.kind === 'cooling' ? 0.9 : 0.3)),
      // Fire control and servos need something you cannot beat out of hull plate.
      exotic: part.destroyed && (part.kind === 'traverse' || part.kind === 'feed') ? 1 : 0,
    };
  }

  /**
   * Scrap what is on a mount for materials instead of saving it. The other half.
   *
   * ONE BREAKDOWN PATH. When the economy layer is installed this routes through
   * `meta/index.js#breakDownItem`, exactly as `salvage.scrapInventoryItem` does for a
   * stored part, so an installed module and the same module sitting in the hold pay
   * the same tier-0 scrap for the same mass and condition. Two arithmetics for one
   * player action is how the two numbers drift apart and how the refit screen starts
   * lying about which choice is better.
   *
   * `breakDownItem(world, item)` takes an INVENTORY-SHAPED RECORD - `{moduleId,
   * condition, uid}`, from which it resolves the def itself (`meta/index.js:235-247`)
   * - not a ModuleDef. The installed record already has that shape; it is normalised
   * here only so a hand-built record with a `def` and no `moduleId` still resolves.
   *
   * The direct `world.materials` write survives as the no-economy path, because
   * `breakDownItem` returns null without `world.systems.economy` and a scrap action
   * that silently pays nothing is worse than either economy.
   *
   * @returns {{ok: boolean, scrap: Object|null, yield: Object|null, reason?: string}}
   *   exactly one of `scrap` (graded units through the economy) and `yield` (alloy /
   *   composite / exotic through the materials pool) is non-null on success.
   */
  scrapInstalled(hardpointId) {
    const found = this._installed(hardpointId);
    if (!found) return { ok: false, reason: 'nothing installed' };
    const w = this.world;

    const record = {
      moduleId: found.item.moduleId ?? found.def?.id,
      condition: found.item.condition ?? 1,
      uid: found.item.uid,
    };

    this.attachment?.detachModule?.(w.hullResult, hardpointId);
    found.hp.module = null;
    found.hp.object = null;

    let scrap = null;
    let out = null;
    if (w.systems.economy) scrap = breakDownItem(w, record);
    if (!scrap) {
      out = scrapYield(found.def.mass ?? 200, record.condition);
      this.materials.alloy += out.alloy;
      this.materials.composite += out.composite;
      this.materials.exotic += out.exotic;
    }

    this._applyModuleEffects(this.player);
    this.bus.emit(EV.MODULE_REMOVED, { hardpoint: hardpointId, module: found.def, ship: this.player, scrapped: true });
    return { ok: true, scrap, yield: out };
  }

  /** Manufacture rounds. Competes with repair for exactly the same alloy. */
  fabricateAmmo(ammoClass, rounds) {
    const stores = this.player?.stores;
    if (!stores) return { ok: false, reason: 'no ship' };
    return stores.fabricate(ammoClass, rounds, this.materials);
  }

  /** Refill one coolant purge. Cheap, and you will want it back before every fight. */
  refillCoolant() {
    const stores = this.player?.stores;
    if (!stores) return { ok: false, reason: 'no ship' };
    if (stores.coolant >= stores.coolantMax) return { ok: false, reason: 'coolant full' };
    const cost = { alloy: 0, composite: 12, exotic: 0 };
    const afford = this._afford(cost);
    if (!afford.ok) return { ok: false, reason: afford.reason, cost };
    this._spend(cost);
    stores.coolant += 1;
    return { ok: true, cost, coolant: stores.coolant };
  }

  cancelJob(job) {
    const i = this.queue.indexOf(job);
    if (i >= 0) { this.queue.splice(i, 1); return true; }
    if (this.active === job) { this.active = null; return true; }
    return false;
  }

  /**
   * Work the queue.
   *
   * A mount that is still hot cannot be serviced. That is one line and it does two
   * jobs: it stops repair from being a mid-broadside undo button, and it gives the
   * thermal readout a second reason to exist outside combat.
   */
  fixedUpdate(dt) {
    if (!this.active) {
      this.active = this.queue.shift() ?? null;
      if (!this.active) return;
    }
    const job = this.active;
    const found = this._installed(job.hardpointId);
    if (!found) { this.active = null; return; }

    const heat = found.mount?.thermal?.heat ?? 0;
    if (heat > SERVICE_HEAT) { job.blocked = 'MOUNT HOT'; return; }
    job.blocked = null;

    job.remaining -= dt;
    if (job.kind === 'module') {
      const t = 1 - Math.max(0, job.remaining) / job.total;
      found.item.condition = clamp01(job.from + (job.to - job.from) * t);
      if (found.mount) found.mount.condition = found.item.condition;
    }
    if (job.remaining <= 0) {
      if (job.kind === 'part') found.mount?.parts.repair(job.partId);
      if (job.kind === 'module') {
        found.item.condition = job.to;
        if (found.mount) found.mount.condition = job.to;
      }
      this.active = null;
      this._applyModuleEffects(this.player);
      this.bus.emit(EV.NOTIFY, { text: `REPAIR COMPLETE — ${job.label}` });
    }
  }

  /**
   * READ API — THE TRIAGE SCREEN.
   *
   * `refit.repairPlan()` returns a cached array of every repairable thing on the ship,
   * each with its cost, what fixing it buys, whether you can afford it, and a priority
   * score. This is the surface that makes scarcity a decision instead of a wall:
   *
   *   { id, kind, hardpoint, partId, label, detail, condition, grade, cost,
   *     affordable, blockedBy, seconds, gain, priority, scrapYield }
   *
   * `scrapYield` is on every module row on purpose - the screen must show "restoring
   * this costs 41 alloy, scrapping it PAYS 68" side by side, because that comparison is
   * the decision. Sorted worst-first by priority.
   */
  repairPlan() {
    const rows = this._planRows;
    rows.length = 0;
    const p = this.player;
    if (!p) return rows;

    for (const [hpId, hp] of p.hardpoints) {
      if (hp.structureHP < hp.maxStructureHP) {
        const cost = { alloy: Math.ceil((hp.maxStructureHP - hp.structureHP) * 0.25), composite: 0, exotic: 0 };
        rows.push({
          id: `structure:${hpId}`, kind: 'structure', hardpoint: hpId, partId: null,
          label: `${hpId.toUpperCase()} STRUCTURE`,
          detail: hp.breached ? 'BREACHED — module cannot be fitted' : 'structural damage',
          condition: hp.structureHP / hp.maxStructureHP,
          grade: conditionLabel(hp.structureHP / hp.maxStructureHP),
          cost, affordable: this._afford(cost).ok, blockedBy: null,
          seconds: 0, gain: hp.breached ? 1 : 0.4,
          priority: hp.breached ? 100 : 40 * (1 - hp.structureHP / hp.maxStructureHP),
          scrapYield: null,
        });
      }

      const found = this._installed(hpId);
      if (!found) continue;
      const condition = found.item.condition ?? 1;
      const mount = found.mount;

      if (condition < 1) {
        const cost = repairCost(found.def.mass ?? 200, condition, 1);
        const inert = condition < CONDITION.inert;
        rows.push({
          id: `module:${hpId}`, kind: 'module', hardpoint: hpId, partId: null,
          label: found.def.name,
          detail: inert ? 'INERT — will not run until repaired'
            : condition < CONDITION.worn ? 'misfeeds; rate and traverse degraded'
              : condition < CONDITION.nominal ? 'rate and traverse degraded' : 'light wear',
          condition, grade: conditionLabel(condition), cost,
          affordable: this._afford(cost).ok,
          blockedBy: (mount?.thermal?.heat ?? 0) > SERVICE_HEAT ? 'MOUNT HOT' : null,
          seconds: (1 - condition) / this.repairRate,
          gain: 1 - grantMul(condition),
          priority: (inert ? 90 : 60) * (1 - condition),
          scrapYield: scrapYield(found.def.mass ?? 200, condition),
        });
      }

      for (const part of mount?.parts.list ?? []) {
        if (!part.destroyed && part.hp >= part.maxHP) continue;
        const cost = this._partCost(found.def, part);
        rows.push({
          id: `part:${hpId}:${part.id}`, kind: 'part', hardpoint: hpId, partId: part.id,
          label: `${found.def.name} · ${part.label}`,
          detail: part.destroyed ? PART_DETAIL[part.kind] : 'damaged',
          condition: part.health, grade: conditionLabel(part.health), cost,
          affordable: this._afford(cost).ok,
          blockedBy: (mount?.thermal?.heat ?? 0) > SERVICE_HEAT ? 'MOUNT HOT' : null,
          seconds: part.destroyed ? 14 : 6,
          gain: part.destroyed ? 1 : 0.3,
          // A dead output or mount pad outranks everything: the module is not working.
          priority: part.destroyed ? (part.kind === 'output' || part.kind === 'mount' ? 95 : 70) : 25,
          scrapYield: null,
        });
      }
    }

    if (p.hullHP < p.maxHullHP) {
      const missing = p.maxHullHP - p.hullHP;
      const cost = { alloy: Math.ceil(missing * 0.5), composite: 0, exotic: 0 };
      rows.push({
        id: 'hull', kind: 'hull', hardpoint: null, partId: null,
        label: 'HULL', detail: `${Math.round(missing)} HP`,
        condition: p.hullHP / p.maxHullHP, grade: conditionLabel(p.hullHP / p.maxHullHP),
        cost, affordable: this._afford(cost).ok, blockedBy: null,
        seconds: 0, gain: 0.5, priority: 55 * (1 - p.hullHP / p.maxHullHP), scrapYield: null,
      });
    }

    const stores = p.stores;
    if (stores) {
      for (const row of stores.report().ammo) {
        if (row.rounds > row.capacity * 0.4) continue;
        const want = row.capacity - row.rounds;
        const spec = AMMO_SPEC[row.cls];
        const cost = { alloy: Math.ceil(want * spec.fabAlloy), composite: Math.ceil(want * spec.fabComposite), exotic: 0 };
        rows.push({
          id: `ammo:${row.cls}`, kind: 'ammo', hardpoint: null, partId: row.cls,
          label: `${row.label} RESUPPLY`, detail: `${row.rounds} of ${row.capacity} rounds`,
          condition: row.rounds / Math.max(1, row.capacity),
          grade: row.dry ? 'DRY' : 'LOW', cost,
          affordable: this._afford(cost).ok, blockedBy: null,
          seconds: 0, gain: 0.8,
          priority: row.dry ? 85 : 45 * (1 - row.rounds / Math.max(1, row.capacity)),
          scrapYield: null,
        });
      }
      if (stores.coolant < stores.coolantMax) {
        const cost = { alloy: 0, composite: 12, exotic: 0 };
        rows.push({
          id: 'coolant', kind: 'coolant', hardpoint: null, partId: null,
          label: 'COOLANT CHARGE', detail: `${stores.coolant} of ${stores.coolantMax}`,
          condition: stores.coolant / Math.max(1, stores.coolantMax), grade: 'LOW', cost,
          affordable: this._afford(cost).ok, blockedBy: null,
          seconds: 0, gain: 0.3, priority: 30, scrapYield: null,
        });
      }
    }

    rows.sort((a, b) => b.priority - a.priority);
    return rows;
  }

  /** Total cost of clearing the whole plan, for the "you cannot afford all of it" line. */
  repairBill() {
    let alloy = 0, composite = 0, exotic = 0;
    for (const row of this.repairPlan()) {
      alloy += row.cost.alloy; composite += row.cost.composite; exotic += row.cost.exotic;
    }
    const m = this.materials;
    return {
      alloy, composite, exotic,
      coverable: (m.alloy ?? 0) >= alloy && (m.composite ?? 0) >= composite && (m.exotic ?? 0) >= exotic,
      have: { alloy: m.alloy ?? 0, composite: m.composite ?? 0, exotic: m.exotic ?? 0 },
    };
  }

  /** For the refit screen: every mount, what is on it, and what could be. */
  describeLoadout() {
    const p = this.player;
    if (!p) return [];
    return HARDPOINTS.map((id) => {
      const hp = p.hardpoints.get(id);
      return {
        id,
        module: hp?.module?.def ?? null,
        structure: hp ? hp.structureHP / hp.maxStructureHP : 1,
        breached: !!hp?.breached,
        compatible: this.world.inventory.filter((it) => this.canInstall(id, it.moduleId).ok
          || this.canInstall(id, it.moduleId).occupied !== undefined),
      };
    });
  }
}
