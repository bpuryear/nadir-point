import { registerItem, getItem, allItems } from '../../core/contracts.js';
import { RANGE } from '../../core/units.js';
import { EV } from '../../core/events.js';
import { MEV } from './events.js';

/**
 * ITEMS AND EQUIPMENT — five of them, and no more.
 *
 * The scope decision put items in on one condition, taken from `fun-systems.md` §1.2:
 * a device that CHANGES WHAT YOU CAN DO is worth more than a device that adds 8%
 * damage. So the test each of these had to pass is not "is it strong" but "is there a
 * situation where the correct play is different because I am carrying it".
 *
 *   COOLANT PURGE     every mount fires as fast as it can reload for six seconds, then
 *                     all of them are slow for a while. Turns a closing window into an
 *                     alpha strike, and costs you the minute after it.
 *   DECOY             guided munitions already in the air re-target to a thrown source.
 *                     Turns "I cannot survive this salvo" into "I can, once".
 *   BOARDING CHARGE   a hostile that is stranded AND defanged strikes instead of being
 *                     shot apart, and its hulk comes apart at full integrity. Turns the
 *                     careful kill from a shooting problem into a decision to stop
 *                     shooting.
 *   SCAN PULSE        resolves every hull in range down to its subsystems and its
 *                     projected salvage yield, and writes them into the codex. Costs
 *                     patrol heat: looking is not free, and this is the bill.
 *   JURY-RIG PATCH    saves a mount that is about to breach, at the price of a
 *                     permanently weaker mount until you pay to do it properly.
 *
 * Every effect above is a multiplier or a flag on state that already exists. None of
 * them adds a number to a stat block, and none of them is a cooldown button - the two
 * failure modes `fun-systems.md` names.
 */

/** Fired by `activate`; the system reads these back out of the returned object. */
const ok = (extra = {}) => ({ ok: true, ...extra });
const no = (reason) => ({ ok: false, reason });

// ---------------------------------------------------------------------------
// The library
// ---------------------------------------------------------------------------

registerItem({
  id: 'coolant_purge',
  name: 'Emergency Coolant Purge',
  kind: 'device',
  description: 'Dumps the loop overboard: every mount reloads at maximum rate for six seconds, then runs cold and slow.',
  volume: 6,
  maxStack: 4,
  buildCost: { composite: 14, electronics: 6 },
  requires: 'at least one weapon mount',
  activate(ctx) {
    const ship = ctx.ship;
    if (!ship || !ship.weapons.length) return no('nothing to cool');
    ctx.system._pushEffect({
      itemId: 'coolant_purge',
      remaining: 6,
      label: 'PURGE',
      tick(dt, sys) {
        // Runs at order 39, ahead of combat at 40, so the mounts are hot when combat
        // looks at them this step rather than next one.
        for (const m of ship.weapons) {
          if (!m.online) continue;
          m.cooldown = 0;
          m.burstTimer = 0;
        }
      },
      end(sys) {
        // The bill. Every mount is slow for one full cooldown afterwards.
        for (const m of ship.weapons) m.cooldown = Math.max(m.cooldown, (m.def.cooldown ?? 3) * 1.9);
        sys.bus?.emit(EV.NOTIFY, { text: 'COOLANT SPENT — mounts running cold', important: false });
      },
    });
    return ok({ window: 6 });
  },
});

registerItem({
  id: 'decoy',
  name: 'Countermeasure Decoy',
  kind: 'device',
  description: 'A thrown emitter that every guided munition already in the air prefers to your hull, for twelve seconds.',
  volume: 4,
  maxStack: 6,
  buildCost: { alloy: 10, electronics: 12 },
  requires: 'nothing',
  activate(ctx) {
    const ship = ctx.ship;
    if (!ship) return no('no ship');
    const decoy = {
      id: `decoy#${ctx.system._decoySeq++}`,
      position: ship.position.clone(),
      velocity: ship.velocity.clone().multiplyScalar(0.6),
      dead: false,
      pulled: 0,
    };
    // Throw it off the beam, away from the ship's own heading, so it separates.
    const side = ctx.rng.bool() ? 1 : -1;
    decoy.velocity.x += Math.cos(ship.heading) * 180 * side;
    decoy.velocity.z += -Math.sin(ship.heading) * 180 * side;
    ctx.system.decoys.push(decoy);
    ctx.system._pushEffect({
      itemId: 'decoy',
      remaining: 12,
      label: 'DECOY',
      decoy,
      tick(dt, sys) {
        decoy.position.addScaledVector(decoy.velocity, dt);
        sys._divertGuided(ship, decoy);
      },
      end(sys) {
        decoy.dead = true;
        const i = sys.decoys.indexOf(decoy);
        if (i >= 0) sys.decoys.splice(i, 1);
      },
    });
    return ok({ decoy });
  },
});

registerItem({
  id: 'boarding_charge',
  name: 'Boarding Charge',
  kind: 'consumable',
  description: 'A shaped breaching charge walked onto a hull that can neither run nor shoot; it strikes, and the hulk comes apart intact.',
  volume: 9,
  maxStack: 3,
  buildCost: { alloy: 22, composite: 10, electronics: 8 },
  requires: 'a hostile that is stranded AND defanged, inside tractor range',
  activate(ctx) {
    const ship = ctx.ship;
    const target = ctx.params?.target ?? ctx.system._bestBoardingTarget();
    if (!target) return no('no stranded, defanged hull in range');
    if (!target.stranded) return no(`${target.classDef.name} can still manoeuvre`);
    if (!target.defanged) return no(`${target.classDef.name} still has weapons`);
    const range = RANGE.salvageBeam * 1.5;
    if (target.position.distanceTo(ship.position) > range) {
      return no(`out of range - close to within ${Math.round(range)} m`);
    }
    // A prize, not a kill: the hull is not blown open, so everything survives the cut.
    target.salvageIntegrity = 1;
    target.applyDamage(target.hullHP + 1, { source: ship, rng: ctx.rng });
    ctx.system.bus?.emit(EV.NOTIFY, {
      text: `${target.classDef.name} STRUCK — hulk intact`, important: true,
    });
    return ok({ target: target.id });
  },
});

registerItem({
  id: 'scan_pulse',
  name: 'Survey Pulse',
  kind: 'consumable',
  description: 'A single loud active sweep: every hull in range resolves to its subsystems and its projected yield, and every patrol hears it.',
  volume: 3,
  maxStack: 8,
  buildCost: { electronics: 18 },
  requires: 'nothing',
  activate(ctx) {
    const ship = ctx.ship;
    if (!ship) return no('no ship');
    const range = ctx.system.scanRange();
    const seen = ctx.system._resolveAll(range);
    // Looking is not free. The war system already turns heat into interception odds.
    const war = ctx.world.systems.factionWar;
    const poiId = ctx.world.systems.travel?.currentPOI ?? ctx.world.poi?.id ?? null;
    if (war && poiId) war.bumpHeat(poiId, 0.14);
    ctx.system.bus?.emit(EV.NOTIFY, {
      text: `SURVEY PULSE — ${seen.ships} contacts, ${seen.wrecks} hulks resolved`, important: false,
    });
    return ok({ ...seen, range, heat: 0.14 });
  },
});

registerItem({
  id: 'jury_rig',
  name: 'Jury-Rig Patch',
  kind: 'consumable',
  description: 'Welds a failing mount back to structural whole in seconds; the mount is thirty percent weaker until it is rebuilt properly.',
  volume: 12,
  maxStack: 3,
  buildCost: { alloy: 18, composite: 12 },
  requires: 'a damaged hardpoint',
  activate(ctx) {
    const ship = ctx.ship;
    const id = ctx.params?.hardpoint ?? ctx.system._worstHardpoint();
    const hp = ship?.hardpoints?.get(id);
    if (!hp) return no('no such hardpoint');
    if (hp.structureHP >= hp.maxStructureHP) return no('no structural damage');
    // The patch is permanent damage that is not currently killing you.
    hp.maxStructureHP = Math.round(hp.maxStructureHP * 0.7);
    hp.structureHP = hp.maxStructureHP;
    hp.breached = false;
    hp.warned = false;
    hp.juryRigged = (hp.juryRigged ?? 0) + 1;
    ctx.system.bus?.emit(EV.NOTIFY, { text: `${id.toUpperCase()} MOUNT JURY-RIGGED`, important: true });
    return ok({ hardpoint: id, maxStructureHP: hp.maxStructureHP });
  },
});

// ---------------------------------------------------------------------------
// The system
// ---------------------------------------------------------------------------

/** Chance that cutting an intact section also frees a usable device. */
const ITEM_DROP_CHANCE = 0.16;

/** Which items a section of a given scrap grade can yield. */
const DROP_TABLE = {
  plate: ['jury_rig', 'jury_rig', 'boarding_charge'],
  machine: ['coolant_purge', 'decoy', 'jury_rig'],
  core: ['scan_pulse', 'decoy', 'coolant_purge'],
};

export class ItemSystem {
  constructor(world) {
    this.world = world;
    this.bus = world.bus;
    this.rng = world.rng.fork('items');
    this.name = 'items';
    /** Ahead of combat (40), so a purge is hot the same step it is pressed. */
    this.order = 39;

    /** @type {Array<Object>} live timed effects */
    this.active = [];
    /** @type {Array<Object>} live decoys, for VFX and the tactical overlay */
    this.decoys = [];
    this._decoySeq = 0;

    /**
     * Hull ids the player has actively resolved. The tactical layer may show
     * subsystems and projected yield for these; everything else is a contact.
     */
    this.resolved = new Set();
  }

  get hold() { return this.world.systems.cargo; }
  get player() { return this.world.player; }

  // --- using ----------------------------------------------------------------

  /** Can this be used right now, and if not, why not. Drives a greyed hotbar slot. */
  canUse(itemId, params = {}) {
    const def = getItem(itemId);
    if (!def) return { ok: false, reason: `unknown item "${itemId}"` };
    if ((this.hold?.itemCount(itemId) ?? 0) <= 0) return { ok: false, reason: 'none carried' };
    if (!this.player || this.player.dead) return { ok: false, reason: 'no ship' };
    if (this.active.some((e) => e.itemId === itemId)) return { ok: false, reason: 'already running' };
    return { ok: true, def };
  }

  /**
   * Spend one and fire it. Returns `{ok, reason}`; the item is only consumed on a
   * successful activation, so a mis-click never eats a charge.
   */
  use(itemId, params = {}) {
    const check = this.canUse(itemId, params);
    if (!check.ok) return check;
    const def = check.def;
    const result = def.activate({
      world: this.world,
      ship: this.player,
      system: this,
      rng: this.rng,
      params,
      def,
    });
    if (!result?.ok) return result ?? { ok: false, reason: 'activation failed' };
    this.hold.removeItem(itemId, 1);
    this.bus?.emit(MEV.ITEM_USED, { itemId, def, result });
    return { ok: true, def, ...result };
  }

  /** Fabricate one from refined materials. The second sink after repair. */
  build(itemId, count = 1) {
    const def = getItem(itemId);
    if (!def) return { ok: false, reason: `unknown item "${itemId}"` };
    if (!def.buildCost) return { ok: false, reason: `${def.name} cannot be fabricated` };
    const econ = this.world.systems.economy;
    if (!econ) return { ok: false, reason: 'no refinery' };
    const cost = {};
    for (const k in def.buildCost) cost[k] = def.buildCost[k] * count;
    const paid = econ.spend(cost, `item:${itemId}`);
    if (!paid.ok) return paid;
    const stored = this.hold.addItem(itemId, count);
    if (!stored.ok) { econ.credit(cost, 'item-refund'); return stored; }
    this.bus?.emit(MEV.ITEM_BUILT, { itemId, count, cost });
    return { ok: true, itemId, count, cost };
  }

  // --- per-step -------------------------------------------------------------

  fixedUpdate(dt) {
    if (this.active.length === 0) return;
    for (let i = this.active.length - 1; i >= 0; i--) {
      const e = this.active[i];
      e.remaining -= dt;
      e.tick?.(dt, this);
      if (e.remaining <= 0) {
        e.end?.(this);
        this.active.splice(i, 1);
        this.bus?.emit(MEV.ITEM_EXPIRED, { itemId: e.itemId });
      }
    }
  }

  _pushEffect(effect) {
    this.active.push(effect);
    return effect;
  }

  /**
   * Re-target guided munitions that are chasing `ship` onto `decoy`.
   *
   * Combat's projectile integrator steers toward `targetRef.position` and only checks
   * `targetRef.dead`, and its collision pass only tests real ships - so a decoy is a
   * thing missiles fly at and never hit. No change to `combat.js` was needed.
   */
  _divertGuided(ship, decoy) {
    const combat = this.world.systems.combat;
    const p = combat?.projectiles;
    if (!p) return;
    for (let i = 0; i < p.count; i++) {
      if (p.tracking[i] <= 0) continue;
      if (p.targetRef[i] !== ship) continue;
      p.targetRef[i] = decoy;
      decoy.pulled++;
    }
  }

  /** Sensor reach for a survey pulse: the fit's sensor range, or the hull baseline. */
  scanRange() {
    let best = RANGE.sensorBase;
    const p = this.player;
    if (p?.hardpoints) {
      for (const hp of p.hardpoints.values()) {
        const r = hp.module?.def?.grants?.sensorRange ?? 0;
        if (r > best) best = r;
      }
    }
    return best * 1.35;
  }

  _resolveAll(range) {
    const p = this.player;
    const codex = this.world.systems.codex;
    let ships = 0;
    let wrecks = 0;
    if (!p) return { ships, wrecks };
    const r2 = range * range;
    for (const s of this.world.ships) {
      if (s === p || s.dead) continue;
      if (s.position.distanceToSquared(p.position) > r2) continue;
      this.resolved.add(s.id);
      ships++;
      codex?.markShipClass(s.classDef?.id, 'scanned');
      for (const hp of s.hardpoints?.values?.() ?? []) {
        if (hp.module?.def) codex?.markModule(hp.module.def.id, 'scanned');
      }
    }
    for (const w of this.world.wrecks) {
      const pos = w.body?.position;
      if (!pos || pos.distanceToSquared(p.position) > r2) continue;
      this.resolved.add(w.id);
      wrecks++;
      codex?.markShipClass(w.sourceClass?.id, 'scanned');
      for (const sec of w.sections) {
        if (sec.moduleId) codex?.markModule(sec.moduleId, 'scanned');
      }
    }
    return { ships, wrecks };
  }

  _bestBoardingTarget() {
    const p = this.player;
    if (!p) return null;
    const range = RANGE.salvageBeam * 1.5;
    let best = null;
    let bestD2 = range * range;
    for (const s of this.world.ships) {
      if (s === p || s.dead) continue;
      if (!this.world.areHostile(p.faction, s.faction)) continue;
      if (!s.stranded || !s.defanged) continue;
      const d2 = s.position.distanceToSquared(p.position);
      if (d2 < bestD2) { bestD2 = d2; best = s; }
    }
    return best;
  }

  _worstHardpoint() {
    const p = this.player;
    let worst = null;
    let worstFrac = 1;
    for (const [id, hp] of p?.hardpoints ?? []) {
      const frac = hp.maxStructureHP > 0 ? hp.structureHP / hp.maxStructureHP : 1;
      if (frac < worstFrac) { worstFrac = frac; worst = id; }
    }
    return worst;
  }

  // --- salvage hooks --------------------------------------------------------

  /**
   * A cut section may free a device. Only intact sections do, which gives the careful
   * kill a third payoff after the part itself and its condition.
   */
  rollDrop(section, rng = this.rng) {
    if (!section || section.integrity < 0.55) return null;
    if (rng.next() > ITEM_DROP_CHANCE) return null;
    const grade = section.grade && DROP_TABLE[section.grade] ? section.grade : 'machine';
    const itemId = rng.pick(DROP_TABLE[grade]);
    const stored = this.hold?.addItem(itemId, 1);
    return stored?.ok ? itemId : null;
  }

  /** Repair a jury-rigged mount properly. The cause and its cure live together. */
  clearJuryRig(hardpointId) {
    const p = this.player;
    const hp = p?.hardpoints?.get(hardpointId);
    if (!hp?.juryRigged) return { ok: false, reason: 'not jury-rigged' };
    const econ = this.world.systems.economy;
    const cost = { alloy: 34 * hp.juryRigged, composite: 12 * hp.juryRigged };
    const paid = econ ? econ.spend(cost, 'jury-rig-rebuild') : { ok: true };
    if (!paid.ok) return paid;
    hp.maxStructureHP = Math.round(hp.maxStructureHP / 0.7 ** hp.juryRigged);
    hp.structureHP = hp.maxStructureHP;
    hp.juryRigged = 0;
    return { ok: true, cost, maxStructureHP: hp.maxStructureHP };
  }

  // --- read API -------------------------------------------------------------

  /** Hotbar contents: what is carried, whether it can fire, and why not. */
  describeHotbar() {
    const out = [];
    for (const def of allItems()) {
      const count = this.hold?.itemCount(def.id) ?? 0;
      const check = this.canUse(def.id);
      out.push({
        itemId: def.id,
        name: def.name,
        kind: def.kind,
        description: def.description,
        requires: def.requires ?? '--',
        count,
        volumeEachM3: def.volume,
        ready: check.ok,
        reason: check.ok ? null : check.reason,
        buildCost: def.buildCost ?? null,
        active: this.active.some((e) => e.itemId === def.id),
      });
    }
    return out;
  }

  /** Live effect windows, for a status strip. */
  describeActive() {
    return this.active.map((e) => ({
      itemId: e.itemId,
      label: e.label ?? e.itemId,
      remaining: Math.max(0, Math.round(e.remaining * 10) / 10),
    }));
  }

  /** Decoys currently in space, for VFX and the tactical overlay. */
  describeDecoys() {
    return this.decoys.map((d) => ({
      id: d.id, position: d.position, pulled: d.pulled, dead: d.dead,
    }));
  }

  /** Has the player actively resolved this hull? Gates the detailed target readout. */
  isResolved(entity) {
    return this.resolved.has(entity?.id);
  }

  dispose() {
    for (const e of this.active) e.end?.(this);
    this.active.length = 0;
    this.decoys.length = 0;
  }
}
