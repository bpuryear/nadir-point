/**
 * WHAT HAPPENS AFTER THE HULL GOES.
 *
 * `Ship._cripple` stops the ship. This turns that into a story, and it is the only
 * consumer of `MEV.PLAYER_CRIPPLED`.
 *
 * The design is `docs/design/look-target.md` §3, which is binding, and it differs on one
 * point from the research brief in `closest-comparables.md` §5.2 - the brief said the
 * hold is lost, the decision says the hold survives. The decision is right and the
 * reason is stated there: losing an hour of careful cutting to one bad fight reads as
 * punishing, while losing your *installed guns* and being able to see exactly where they
 * are reads as dramatic, because going back for them becomes its own sortie. The switch
 * is `DERELICT.ventHold` below, one constant, if that ever needs revisiting.
 *
 * THE SEQUENCE
 *
 *   1. the hull is crippled: reactor scrammed, drive dead, weapons dark, drifting
 *   2. every hardpoint whose structure was already failing BREACHES, and its module
 *      comes off INTACT and stays exactly where you fell. At least one always does -
 *      whatever killed you took something with it.
 *   3. you drift, visibly, for `driftSeconds`, while a tender is raised
 *   4. the nearest berth that will have you tows you in and charges for it. If nobody
 *      will have you, the faction that dislikes you least comes anyway, at a price that
 *      reflects how they feel. (This is the stranding path
 *      `docs/design/integration-decisions.md` promised and nobody had built.)
 *   5. the site stays on the record. Your guns are still there. They are still there
 *      next session, because `core/persistence.js` saves this list.
 *
 * THE FOUR-QUESTION TEST (docs/design/scope-decision.md):
 *
 *  1. What decision does this create? Two. Whether to go back - the site is in contested
 *     space, your fit is now four mounts instead of six, and whatever killed you may
 *     still be there. And, before that, whether to break off: a fight you are losing now
 *     costs specific, named hardware rather than a reload, so disengaging has a price
 *     you can compute against the price of staying.
 *  2. What does it interlock with? Hardpoint structure (which decides *what* you lose,
 *     so repairing a weak mount before a sortie is now insurance), the detached-module
 *     path that already existed and was symmetric, salvage, the anchorage table,
 *     reputation (who will tow you), debt, and the sortie ledger.
 *  3. What does it abstract? The tow. There is no tender ship to escort, no rescue
 *     minigame and no crew. It is a duration and a bill, because the interesting part is
 *     the wreck you left behind, not the journey back from it.
 *  4. Can the player see it? `status()` reports the drift countdown and the projected
 *     bill while it is happening, and `sites()` lists every place the player has left
 *     hardware, with what and how much. Nothing about it is hidden state.
 */

import * as THREE from 'three';
import { EV } from '../../core/events.js';
import { MEV } from './events.js';
import { KM } from '../../core/units.js';
import { getModule } from '../../core/contracts.js';

export const DERELICT = {
  /** Seconds adrift before a tender has you. Long enough to look at what you did. */
  driftSeconds: 45,
  /** A mount at or below this fraction of its structure comes apart in the fall. */
  breachAt: 0.35,
  /** Flat tow fee, in refined alloy. */
  towBase: 40,
  /** Plus this per kilometre towed. */
  towPerKm: 0.30,
  /** Plus this much for putting the hull back into a state that holds pressure. */
  towHullBill: 140,
  /** Hull the tender leaves you with, as a fraction of maximum. Enough to move. */
  recoveredHull: 0.28,
  /** Propellant the tender leaves in the tank. Enough to reach one more berth. */
  recoveredPropellant: 140,
  /** Does the cargo hold survive? Binding decision: yes. */
  ventHold: false,
  /** Within this of a recorded site, the hardware you left there is real again. */
  respawnRange: 45 * KM,
  /** Beyond this it is put away again, so a site is not a permanent draw call. */
  despawnRange: 70 * KM,

  /**
   * STRANDING. Seconds of sitting still with no berth in reach before a tender is
   * raised on your behalf.
   *
   * `docs/design/integration-decisions.md` promised this path - "a Coalition or Concord
   * tender will come to you, on the faction whose reputation is higher" - and nobody
   * built it, so running the tank dry between anchorages was a soft lock. The headless
   * harness found it immediately, because with the authored POI spacing and 0.8 units
   * per kilometre a full 640-unit tank affords roughly one long leg and not two.
   *
   * The grace period is generous on purpose: the player must have time to notice, read
   * the reachable list, and decide to spend their reserve rather than be rescued.
   */
  strandGrace: 45,
  /** A rescue costs more than a tow from a berth you were nearly at. */
  strandSurcharge: 1.35,
  /** Being towed takes longer than being recovered from a wreck; it is further. */
  strandSeconds: 90,
};

export class DerelictSystem {
  /** @param {import('../../core/world.js').World} world */
  constructor(world) {
    this.world = world;
    this.bus = world.bus;
    this.rng = world.rng.fork('derelict');
    this.name = 'derelict';
    /** After travel, before combat: recovery moves the ship, and combat should see it. */
    this.order = 27;

    /** Set false to put the old "the player is a corpse" behaviour back. */
    this.enabled = true;

    /** null | { at, remaining, x, z, poiId, bill, toPOI } */
    this.drifting = null;
    /** Seconds spent with no berth in reach. See `_checkStranded`. */
    this._strandedFor = 0;
    this._strandWarned = false;

    /**
     * Places the player has left hardware.
     * `{ id, x, z, poiId, at, modules: [{moduleId, name, condition}], live: boolean }`
     * @type {Array}
     */
    this.wrecksites = [];
    this._siteSeq = 0;
    /** Live `DetachedModule` objects, by site id, so respawn is idempotent. */
    this._spawned = new Map();

    this._offs = [];
    this._offs.push(this.bus.on(MEV.PLAYER_CRIPPLED, (e) => this._onCrippled(e)));
  }

  get system() { return this.world.systems.system ?? null; }
  get travel() { return this.world.systems.travel ?? null; }
  get war() { return this.world.systems.factionWar ?? null; }

  // =========================================================================
  // Falling
  // =========================================================================

  _onCrippled({ ship }) {
    if (!ship?.isPlayer || this.drifting) return;
    const x = ship.position.x;
    const z = ship.position.z;
    const poiId = this.system?.containing(x, z)?.id ?? null;

    const lost = this._breachHardpoints(ship);
    const site = lost.length ? this._recordSite(x, z, poiId, lost, ship.faction) : null;

    if (DERELICT.ventHold) this._ventHold();

    const bill = this._quoteTow(x, z);
    this.drifting = {
      at: 0,
      remaining: DERELICT.driftSeconds,
      x, z, poiId,
      bill: bill.alloy,
      toPOI: bill.poiId,
      toName: bill.name,
      hostile: bill.hostile,
      siteId: site?.id ?? null,
    };

    this.bus.emit(EV.NOTIFY, {
      text: `HULL CRIPPLED — REACTOR SCRAMMED — ${lost.length} MOUNT${lost.length === 1 ? '' : 'S'} BREACHED`,
      important: true,
    });
    if (bill.name) {
      this.bus.emit(EV.NOTIFY, {
        text: `TENDER RAISED — ${bill.name.toUpperCase()} — ${Math.ceil(bill.alloy)} ALLOY`
          + (bill.hostile ? ' — THEY ARE NOT FRIENDS' : ''),
        important: true,
      });
    }
  }

  /**
   * Which mounts came apart, and what they dropped.
   *
   * A mount that was already failing goes; a mount at full structure holds. That makes
   * pre-sortie structure repair genuinely insurance rather than housekeeping. And at
   * least one always goes, because a hull that reached zero without losing anything is
   * a hull that lost nothing, and then the whole system is free.
   */
  _breachHardpoints(ship) {
    const rows = [];
    let worst = null;
    let worstFrac = Infinity;
    for (const hp of ship.hardpoints.values()) {
      if (!hp.module) continue;
      const frac = hp.maxStructureHP > 0 ? hp.structureHP / hp.maxStructureHP : 0;
      if (frac < worstFrac) { worstFrac = frac; worst = hp; }
      if (frac <= DERELICT.breachAt) rows.push(hp);
    }
    if (rows.length === 0 && worst) rows.push(worst);

    const lost = [];
    for (const hp of rows) {
      const item = hp.module;
      const def = item.def ?? getModule(item.moduleId);
      const anchor = hp.object ? hp.object.getWorldPosition(new THREE.Vector3()) : ship.position.clone();
      // Scatter, so six mounts do not land on one pixel and so the site reads as a
      // debris field rather than a stack.
      anchor.x += this.rng.signed() * 340;
      anchor.z += this.rng.signed() * 340;
      anchor.y += this.rng.signed() * 90;

      hp.module = null;
      if (hp.object?.parent) hp.object.parent.remove(hp.object);
      hp.object = null;
      hp.breached = true;
      hp.structureHP = 0;
      hp.warned = false;

      lost.push({
        hardpoint: hp.id,
        moduleId: def?.id ?? item.moduleId,
        name: def?.name ?? 'MODULE',
        condition: item.condition ?? 1,
        x: anchor.x, y: anchor.y, z: anchor.z,
      });
      this.bus.emit(EV.MODULE_LOST, { ship, hardpoint: hp.id, module: item, intact: true, crippled: true });
    }

    // One recompute after all of them, not one per mount.
    this.world.systems.refit?._applyModuleEffects?.(ship);
    return lost;
  }

  /** Only reachable if `DERELICT.ventHold` is flipped back on. Kept honest, not dead. */
  _ventHold() {
    const economy = this.world.systems.economy;
    if (economy) for (const g of ['plate', 'machine', 'core']) economy.ventScrap(g);
    this.world.inventory.length = 0;
    this.bus.emit(MEV.CARGO_CHANGED, { reason: 'crippled' });
  }

  _recordSite(x, z, poiId, modules, faction) {
    const site = {
      id: `site:${this._siteSeq++}`,
      x, z, poiId,
      at: this.world.systems.sortie?.time ?? 0,
      faction: faction ?? 'player',
      modules,
      live: false,
    };
    this.wrecksites.push(site);
    this.bus.emit(MEV.WRECKSITE_MARKED, { site });
    this.bus.emit(EV.NOTIFY, {
      text: `${modules.length} MODULE${modules.length === 1 ? '' : 'S'} ADRIFT AT THIS POSITION — `
        + `${modules.map((m) => m.name.toUpperCase()).join(', ')}`,
      important: true,
    });
    return site;
  }

  // =========================================================================
  // Being fetched
  // =========================================================================

  /**
   * Who tows you, from where, and what it costs.
   *
   * The preference order is the whole of the reputation design in one function: a berth
   * that will have you, nearest first; failing that, the faction that dislikes you least,
   * at a surcharge. There is no third case, because "nobody comes" is a soft lock and
   * `integration-decisions.md` already ruled it out.
   */
  _quoteTow(x, z) {
    const sys = this.system;
    if (!sys) return { alloy: DERELICT.towBase, poiId: null, name: null, hostile: false };
    const rep = this.world.reputation ?? {};
    const owner = (node) => this.travel?.ownerOf(node.id) ?? 'contested';

    const willing = sys.nearestAnchorage(x, z, (node) => {
      const o = owner(node);
      if (o === 'contested') return false;
      return (rep[o] ?? 0) >= (node.anchorage.minStanding ?? -100);
    });

    let pick = willing;
    let hostile = false;
    if (!pick) {
      // Nobody will berth you. The faction that dislikes you least comes anyway.
      const best = (rep.coalition ?? 0) >= (rep.concord ?? 0) ? 'coalition' : 'concord';
      pick = sys.nearestAnchorage(x, z, (node) => owner(node) === best)
        ?? sys.nearestAnchorage(x, z);
      hostile = true;
    }
    if (!pick) return { alloy: DERELICT.towBase, poiId: null, name: null, hostile: false };

    const player = this.world.player;
    const missing = player ? 1 - player.hullHP / Math.max(1, player.maxHullHP) : 1;
    const km = pick.distance / KM;
    let alloy = DERELICT.towBase + km * DERELICT.towPerKm + missing * DERELICT.towHullBill;
    if (hostile) {
      const o = owner(pick.node);
      const dislike = Math.max(0, -(rep[o] ?? 0)) / 100;
      alloy *= 1.5 + dislike;
    }
    return {
      alloy: Math.ceil(alloy), poiId: pick.node.id, name: pick.node.name,
      km, hostile, owner: owner(pick.node),
    };
  }

  fixedUpdate(dt) {
    if (this.drifting) this._updateDrift(dt);
    else this._checkStranded(dt);
    this._updateSites();
  }

  /**
   * Can the player still reach anywhere that would take them in?
   *
   * Measured at the SILENT rate, 0.5 units per kilometre, because that is the cheapest
   * way to move and a player who has not thought of it should not be rescued for it.
   * `reach` is therefore the most generous honest answer to "am I stuck".
   */
  reachability() {
    const travel = this.travel;
    const sys = this.system;
    const p = this.world.player;
    const prop = this.world.propellant;
    if (!travel || !sys || !p || !prop) return null;
    const spendable = Math.max(0, prop.current - (prop.reserve ?? 0));
    const rangeM = (spendable / 0.5) * 1000;
    const rep = this.world.reputation ?? {};
    let best = null;
    for (const node of sys.anchorages()) {
      const owner = travel.ownerOf(node.id);
      const willing = owner !== 'contested'
        && (rep[owner] ?? 0) >= (node.anchorage.minStanding ?? -100);
      const d = Math.hypot(node.position.x - p.position.x, node.position.z - p.position.z);
      if (!willing) continue;
      if (!best || d < best.distance) best = { node, distance: d, owner };
    }
    return {
      spendable,
      rangeM,
      rangeKm: rangeM / 1000,
      nearest: best,
      reachable: !!best && best.distance <= rangeM,
    };
  }

  _checkStranded(dt) {
    const travel = this.travel;
    const p = this.world.player;
    if (!travel || !p || p.dead || p.crippled || travel.docked || travel.inTransit) {
      this._strandedFor = 0;
      return;
    }
    const reach = this.reachability();
    if (!reach || reach.reachable) { this._strandedFor = 0; return; }

    this._strandedFor = (this._strandedFor ?? 0) + dt;
    if (this._strandedFor === dt || (this._strandedFor > 5 && !this._strandWarned)) {
      this._strandWarned = true;
      this.bus.emit(EV.NOTIFY, {
        text: `NO BERTH IN REACH — ${Math.round(reach.rangeKm)} km on the tank, `
          + `nearest is ${Math.round((reach.nearest?.distance ?? 0) / KM)} km`,
        important: true,
      });
    }
    if (this._strandedFor < DERELICT.strandGrace) return;

    this._strandedFor = 0;
    this._strandWarned = false;
    const quote = this._quoteTow(p.position.x, p.position.z);
    this.drifting = {
      at: 0,
      remaining: DERELICT.strandSeconds,
      x: p.position.x, z: p.position.z,
      poiId: this.system?.containing(p.position.x, p.position.z)?.id ?? null,
      bill: Math.ceil(quote.alloy * DERELICT.strandSurcharge),
      toPOI: quote.poiId,
      toName: quote.name,
      hostile: quote.hostile,
      siteId: null,
      stranded: true,
    };
    this.bus.emit(EV.NOTIFY, {
      text: `TENDER RAISED — STRANDED — ${(quote.name ?? 'ANCHORAGE').toUpperCase()} — `
        + `${this.drifting.bill} ALLOY`,
      important: true,
    });
  }

  _updateDrift(dt) {
    const d = this.drifting;
    d.at += dt;
    d.remaining -= dt;
    if (d.remaining > 0) return;
    this.drifting = null;
    this._recover(d);
  }

  /**
   * The tender arrives. You are put alongside, patched to something that holds pressure,
   * given enough propellant to reach one more berth, and handed the bill.
   */
  _recover(d) {
    const player = this.world.player;
    const sys = this.system;
    if (!player) return;

    const node = d.toPOI ? sys?.get(d.toPOI) : null;
    if (node) {
      // Set down just outside the berth, facing it, at rest.
      player.body.position.set(node.position.x - 4200, 0, node.position.z);
      player.body.velocity.set(0, 0, 0);
      if (player.planeLocked) {
        player.body.heading = Math.PI * 0.5;
        player.body.desiredHeading = Math.PI * 0.5;
      }
    }

    player.crippled = false;
    player.scrammed = false;
    player.disabled = false;
    player.dead = false;
    // A tow because you ran out of propellant does not include hull work. You get the
    // legs back and the bill; the damage is still yours.
    if (!d.stranded) player.hullHP = Math.max(player.hullHP, player.maxHullHP * DERELICT.recoveredHull);
    player.power.setHealthFactor?.(1);
    for (const m of player.weapons) {
      if (m.offlineReason === 'scram') { m.online = true; m.offlineReason = null; }
    }
    this.world.systems.refit?._applyModuleEffects?.(player);
    player._refreshEfficiency();

    const tank = this.world.propellant;
    if (tank) tank.current = Math.max(tank.current, Math.min(tank.max, DERELICT.recoveredPropellant));

    // The bill goes on the slate rather than being taken, because a player who has just
    // lost two mounts probably cannot pay it and being told so twice is not drama.
    this.world.systems.sortie?.borrow(d.bill, `tow to ${d.toName ?? 'anchorage'}`);

    this.bus.emit(MEV.PLAYER_RECOVERED, {
      poiId: d.toPOI, name: d.toName, bill: d.bill, hostile: d.hostile, stranded: !!d.stranded,
      site: this.wrecksites.find((s) => s.id === d.siteId) ?? null,
    });
    this.bus.emit(EV.NOTIFY, {
      text: `${d.stranded ? 'TOWED IN' : 'RECOVERED'} — ${(d.toName ?? 'ANCHORAGE').toUpperCase()} — `
        + `${Math.ceil(d.bill)} ALLOY ON THE SLATE`,
      important: true,
    });

    if (d.toPOI && this.travel) {
      this.travel.enter(d.toPOI);
      const res = this.travel.dock(d.toPOI);
      if (!res.ok) {
        this.bus.emit(EV.NOTIFY, { text: `HELD OFF THE BERTH — ${res.reason}`, important: true });
      }
    }
  }

  // =========================================================================
  // The hardware you left behind
  // =========================================================================

  /**
   * Sites are records first and objects second. Within `respawnRange` the modules are
   * real, cuttable `DetachedModule`s in `world.wrecks`; beyond `despawnRange` they are
   * put away again. That is what makes "go back for your own guns" survive flying to
   * the other side of the system and, through `core/persistence.js`, a page reload.
   */
  _updateSites() {
    if (this.wrecksites.length === 0) return;
    const player = this.world.player;
    if (!player) return;
    const salvage = this.world.systems.salvage;
    if (!salvage?.spawnDetachedModule) return;

    for (const site of this.wrecksites) {
      const dx = site.x - player.position.x;
      const dz = site.z - player.position.z;
      const d = Math.hypot(dx, dz);
      if (!site.live && d <= DERELICT.respawnRange) this._spawnSite(site, salvage);
      else if (site.live && d > DERELICT.despawnRange) this._despawnSite(site);
    }
    // A site with nothing left in it is a site the player finished.
    for (let i = this.wrecksites.length - 1; i >= 0; i--) {
      if (this.wrecksites[i].modules.length === 0) {
        this._despawnSite(this.wrecksites[i]);
        this.wrecksites.splice(i, 1);
      }
    }
  }

  _spawnSite(site, salvage) {
    const made = [];
    for (const m of site.modules) {
      const detached = salvage.spawnDetachedModule({
        ship: { faction: site.faction, position: new THREE.Vector3(m.x, m.y ?? 0, m.z), velocity: null },
        mount: null,
        moduleDef: getModule(m.moduleId) ?? { id: m.moduleId, name: m.name },
        condition: m.condition,
        point: new THREE.Vector3(m.x, m.y ?? 0, m.z),
        quiet: true,
      });
      if (detached) {
        detached.residualHeat = 0;      // it has been out here a while
        detached.__ownedBySite = true;
        detached.__siteId = site.id;
        detached.__siteModuleId = m.moduleId;
        made.push(detached);
      }
    }
    this._spawned.set(site.id, made);
    site.live = true;
  }

  _despawnSite(site) {
    const made = this._spawned.get(site.id) ?? [];
    const kept = [];
    for (const w of made) {
      // What the player actually cut out is gone; what they left is written back.
      if (!w.spent) {
        const sec = w.sections[0];
        kept.push({
          moduleId: w.__siteModuleId,
          name: w.name,
          condition: sec?.condition ?? 0.5,
          x: w.body.position.x, y: w.body.position.y, z: w.body.position.z,
        });
      }
      this.world.removeWreck(w);
    }
    if (made.length) site.modules = kept;
    this._spawned.delete(site.id);
    site.live = false;
  }

  // =========================================================================
  // Read API
  // =========================================================================

  /** Drifting, and what it is going to cost. Null when the hull is fine. */
  status() {
    const d = this.drifting;
    if (!d) return null;
    return {
      remaining: d.remaining,
      total: DERELICT.driftSeconds,
      toPOI: d.toPOI,
      toName: d.toName,
      bill: d.bill,
      hostile: d.hostile,
    };
  }

  /** Every place the player has left hardware, nearest first. */
  sites() {
    const player = this.world.player;
    return this.wrecksites.map((s) => ({
      id: s.id,
      x: s.x,
      z: s.z,
      poiId: s.poiId,
      live: s.live,
      km: player ? Math.hypot(s.x - player.position.x, s.z - player.position.z) / KM : 0,
      modules: s.modules.map((m) => ({ moduleId: m.moduleId, name: m.name, condition: m.condition })),
    })).sort((a, b) => a.km - b.km);
  }

  /** Save/restore hook. Plain data, no object identity. */
  serialise() {
    // Fold live objects back into records first so a save mid-visit is accurate.
    for (const site of this.wrecksites) if (site.live) this._despawnSite(site);
    return { seq: this._siteSeq, sites: this.wrecksites.map((s) => ({ ...s, live: false })) };
  }

  restore(data) {
    for (const site of this.wrecksites) if (site.live) this._despawnSite(site);
    this.wrecksites = Array.isArray(data?.sites) ? data.sites.map((s) => ({ ...s, live: false })) : [];
    this._siteSeq = data?.seq ?? this.wrecksites.length;
    this.drifting = null;
  }

  dispose() {
    for (const off of this._offs) off?.();
    this._offs.length = 0;
    for (const site of this.wrecksites) if (site.live) this._despawnSite(site);
  }
}
