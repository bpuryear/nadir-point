import * as THREE from 'three';
import { EV } from '../core/events.js';
import { getModule, HARDPOINTS } from '../core/contracts.js';
import { WeaponMount } from './ship.js';

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
  }

  get player() { return this.world.player; }

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
    const accepts = def.hardpoint === hardpointId
      || (def.hardpoint === 'port' && hardpointId === 'starboard')
      || (def.hardpoint === 'starboard' && hardpointId === 'port');
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

    const cargo = this.world.systems.salvage?.cargoCapacity ?? 6;
    if (this.world.inventory.length >= cargo) return { ok: false, reason: 'hold is full' };

    this.attachment.detachModule(this.world.hullResult, hardpointId);
    const item = hp.module;
    hp.module = null;
    hp.object = null;
    this.world.inventory.push({ moduleId: item.def.id, condition: item.condition ?? 1, uid: item.uid });
    this._applyModuleEffects(p);
    this.bus.emit(EV.MODULE_REMOVED, { hardpoint: hardpointId, module: item.def, ship: p });
    return { ok: true };
  }

  /**
   * Recompute everything the hull's fit contributes: weapon mounts, power output,
   * thrust, hangar bays, cargo, sensors, shields. Called after every change so there
   * is exactly one place where a loadout turns into statistics.
   */
  _applyModuleEffects(ship) {
    const w = this.world;

    ship.weapons.length = 0;
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
      const mirrored = hpId === 'starboard' && def.hardpoint === 'port';
      const hpDef = this._hardpointDef(hpId);

      if (def.weapon) {
        const anchor = hpDef?.anchor ?? [0, 0, 0];
        const localPosition = new THREE.Vector3(anchor[0] * (mirrored ? -1 : 1), anchor[1], anchor[2]);
        const yawCentre = mirrored && hpDef ? -hpDef.yawCentre : (hpDef?.yawCentre ?? 0);
        ship.weapons.push(new WeaponMount(def.weapon, {
          localPosition,
          yawCentre,
          yawWidth: def.weapon.yawWidth ?? hpDef?.yawWidth ?? Math.PI * 0.5,
          hardpoint: hpId,
        }));
      }

      const g = def.grants ?? {};
      powerBonus += g.powerOutput ?? 0;
      thrustMul *= 1 + (g.thrust ?? 0);
      turnMul *= 1 + (g.turnRate ?? 0);
      hangarBays += g.hangarBays ?? 0;
      cargo += g.cargo ?? 0;
      sensorRange = Math.max(sensorRange, g.sensorRange ?? 0);
      shieldCapacity += g.shieldCapacity ?? 0;
      salvageRate += g.salvageRate ?? 0;
    }

    ship.power.bonusOutput = powerBonus;
    ship.body.accel = ship.classDef.accel * thrustMul;
    ship.body.turnRate = ship.classDef.turnRate * turnMul;
    ship.shields.max = shieldCapacity;
    ship.shields.regen = shieldCapacity * 0.06;
    if (ship.shields.current > ship.shields.max) ship.shields.current = ship.shields.max;

    if (w.systems.salvage) {
      w.systems.salvage.cargoCapacity = cargo;
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
