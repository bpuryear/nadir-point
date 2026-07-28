/**
 * REFIT COMMITMENT.
 *
 * `closest-comparables.md` §5.2, Product 3: a run manufactures irreversible commitment,
 * and we were maximally reversible. `RefitSystem.install` and `uninstall` were free,
 * instant, available anywhere and lossless - a module went back into the hold in exactly
 * the condition it came off in. There is no such thing as committing to a fit, so there
 * is no such thing as a fit.
 *
 * `docs/design/look-target.md` §2 is the binding decision this file implements:
 *
 *   - **full refit happens only when docked at an anchorage**
 *   - in the field the player may jettison a module and hot-swap into a *now-empty*
 *     mount, and that is deliberately worse: it takes real time during which the mount
 *     is dead, and it applies a condition penalty, because a field weld is not a yard
 *     weld
 *   - it cannot move a module between two occupied mounts, only into an empty one
 *
 * OWNERSHIP NOTE. `src/sim/refit.js` belongs to another stream this wave, so none of
 * this is written there. `installTime = 2.5` is declared at `refit.js:51` and never
 * consumed; this file consumes it, from outside, by holding the call for the duration
 * and then making it. `enforce()` wraps the live `RefitSystem` instance so that a UI
 * written against `refit.install(...)` gets gated behind the same rules without anybody
 * editing that file. It no-ops the moment refit.js sets `refit.gated = true`, so the
 * proper implementation supersedes this one by existing. See this stream's handover.
 *
 * THE FOUR-QUESTION TEST (docs/design/scope-decision.md):
 *
 *  1. What decision does this create? Which six modules you leave the berth with. That
 *     was previously not a decision at all, because it could be undone for free at any
 *     moment from anywhere. It also creates the live one: something beautiful is
 *     floating in front of you and your ventral mount is full - is it worth cutting your
 *     own cargo pods off, at a condition cost, thirty seconds of dead mount and a
 *     hostile inbound?
 *  2. What does it interlock with? The sortie (the fit is chosen at a berth, which is
 *     where a sortie begins), the anchorage table (Tallow turns a fit around five times
 *     faster than open space; only the two yards will touch a tier-3 mount), the Field
 *     Dock module - which now buys autonomy at the cost of a ventral hardpoint that
 *     could have held cargo pods, a hangar deck or the salvage tractor - and condition,
 *     which every downstream system already reads.
 *  3. What does it abstract? The work itself. There is no minigame, no bolt pattern and
 *     no crew: it is a duration and a condition delta. The scope decision forbids crew
 *     and the reference games get nothing from simulating the labour.
 *  4. Can the player see it? `describe()` returns, per hardpoint, exactly what would
 *     happen if you tried: seconds, condition cost, and the reason when the answer is
 *     no. Nothing is refused without a sentence saying what would make it possible.
 */

import { EV } from '../../core/events.js';
import { MEV } from './events.js';
import { getModule, HARDPOINTS } from '../../core/contracts.js';
import { clamp01 } from '../condition.js';

export const REFIT_GATE = {
  /** Multiplier on the base install time when nothing is helping you. */
  fieldSpeedMul: 0.28,
  /** ...and when the Field Dock is bolted to the ventral mount. */
  fieldDockSpeedMul: 0.55,
  /** Condition a field weld costs the part going on. */
  fieldInstallLoss: 0.10,
  fieldDockInstallLoss: 0.035,
  /** Condition cutting a welded module back off costs it. */
  fieldRemoveLoss: 0.12,
  fieldDockRemoveLoss: 0.045,
  /** Tier at or above which a berth with heavy gantries is required. */
  heavyTier: 3,
  /** The module that makes a hull its own yard, at the price of a ventral hardpoint. */
  fieldDockModule: 'ventral_repair_bay',
};

export class RefitGateSystem {
  /** @param {import('../../core/world.js').World} world */
  constructor(world) {
    this.world = world;
    this.bus = world.bus;
    this.name = 'refit-gate';
    /** Just ahead of refit's own queue at 90. */
    this.order = 89;

    /** @type {null|{action:string, hardpointId:string, uid:string, remaining:number, total:number, conditionLoss:number, label:string}} */
    this.job = null;
    this.enforced = false;
    this._rows = [];
    this._original = null;
  }

  // =========================================================================
  // Where you are, and what it buys
  // =========================================================================

  get refit() { return this.world.systems.refit ?? null; }
  get travel() { return this.world.systems.travel ?? null; }

  /** The Field Dock, on the hull, working. Autonomy costs a ventral hardpoint. */
  get fieldDock() {
    const hp = this.world.player?.hardpoints?.get('ventral');
    if (!hp?.module) return false;
    if (hp.breached) return false;
    return hp.module.def?.id === REFIT_GATE.fieldDockModule;
  }

  /** `{docked, poiId, heavy, speedMul, installLoss, removeLoss, where}` */
  context() {
    const travel = this.travel;
    const docked = !!travel?.docked;
    const svc = docked ? travel.services(travel.dockedAt) : null;
    if (docked && svc) {
      return {
        docked: true,
        poiId: travel.dockedAt,
        heavy: !!svc.heavyRefit,
        speedMul: svc.refitSpeedMul,
        installLoss: 0,
        removeLoss: 0,
        where: svc.kindLabel,
      };
    }
    const dock = this.fieldDock;
    return {
      docked: false,
      poiId: travel?.currentPOI ?? null,
      heavy: false,
      speedMul: dock ? REFIT_GATE.fieldDockSpeedMul : REFIT_GATE.fieldSpeedMul,
      installLoss: dock ? REFIT_GATE.fieldDockInstallLoss : REFIT_GATE.fieldInstallLoss,
      removeLoss: dock ? REFIT_GATE.fieldDockRemoveLoss : REFIT_GATE.fieldRemoveLoss,
      where: dock ? 'FIELD DOCK' : 'OPEN SPACE',
    };
  }

  /**
   * Base seconds of work for a module, before the place it is happening in.
   * `refit.installTime` is the declared constant this stream finally spends.
   */
  baseSeconds(def, action = 'install') {
    const base = this.refit?.installTime ?? 2.5;
    const mass = def?.mass ?? 200;
    const tier = def?.tier ?? 1;
    const t = base * (1 + mass / 600) * tier;
    return action === 'uninstall' ? t * 0.6 : t;
  }

  seconds(def, action = 'install', ctx = null) {
    const c = ctx ?? this.context();
    return this.baseSeconds(def, action) / Math.max(0.05, c.speedMul);
  }

  // =========================================================================
  // The rule
  // =========================================================================

  /**
   * Would this be allowed, and at what price. Never throws, always carries a reason.
   *
   * @param {string} hardpointId
   * @param {string|null} moduleId  the part going ON; null for a removal
   * @param {'install'|'uninstall'} action
   */
  check(hardpointId, moduleId, action = 'install') {
    const player = this.world.player;
    const ctx = this.context();
    const out = {
      ok: false, reason: null, action, hardpointId, moduleId,
      seconds: 0, conditionLoss: 0, where: ctx.where, docked: ctx.docked,
    };
    if (!player) { out.reason = 'no ship'; return out; }
    const hp = player.hardpoints?.get(hardpointId);
    if (!hp) { out.reason = `unknown hardpoint "${hardpointId}"`; return out; }
    if (this.job) {
      out.reason = `REFIT UNDER WAY — ${this.job.label}, ${Math.ceil(this.job.remaining)}s`;
      return out;
    }
    if (this.travel?.inTransit) { out.reason = 'not under transit burn'; return out; }

    if (action === 'uninstall') {
      if (!hp.module) { out.reason = 'nothing installed'; return out; }
      out.seconds = this.seconds(hp.module.def, 'uninstall', ctx);
      out.conditionLoss = ctx.removeLoss;
      out.ok = true;
      if (!ctx.docked) {
        out.note = `field cut — the part comes off ${Math.round(ctx.removeLoss * 100)}% worse`;
      }
      return out;
    }

    const def = getModule(moduleId);
    if (!def) { out.reason = `unknown module "${moduleId}"`; return out; }

    // The one hard rule from the binding decision: out here you may only fill a mount
    // that is already empty. Swapping two occupied mounts is a yard job.
    if (!ctx.docked && hp.module) {
      out.reason = `${hardpointId.toUpperCase()} IS OCCUPIED — a swap needs a berth; `
        + 'cut the old mount off first';
      return out;
    }
    if ((def.tier ?? 1) >= REFIT_GATE.heavyTier && !ctx.heavy) {
      out.reason = `TIER ${def.tier} NEEDS HEAVY GANTRIES — Ironhold or Tallow`;
      return out;
    }
    if (hp.breached && !ctx.heavy) {
      out.reason = `${hardpointId.toUpperCase()} IS BREACHED — the structure is a yard job`;
      return out;
    }

    out.seconds = this.seconds(def, 'install', ctx);
    out.conditionLoss = ctx.installLoss;
    out.ok = true;
    if (!ctx.docked) {
      out.note = `field weld — the part goes on ${Math.round(ctx.installLoss * 100)}% worse`;
    }
    return out;
  }

  /** Structure rebuilds on a breached mount are heavy work. Travel's repair uses this. */
  canRebuildHardpoint() {
    return this.context().heavy;
  }

  // =========================================================================
  // Doing it
  // =========================================================================

  /**
   * Start an install. The mount is dead for the duration and the call completes later;
   * that lateness IS the commitment.
   */
  beginInstall(hardpointId, inventoryUid) {
    const item = this.world.inventory.find((i) => i.uid === inventoryUid);
    if (!item) return { ok: false, reason: 'not in inventory' };
    const gate = this.check(hardpointId, item.moduleId, 'install');
    if (!gate.ok) {
      this.bus.emit(MEV.REFIT_REFUSED, gate);
      return gate;
    }
    const def = getModule(item.moduleId);
    this.job = {
      action: 'install',
      hardpointId,
      uid: inventoryUid,
      conditionLoss: gate.conditionLoss,
      remaining: gate.seconds,
      total: gate.seconds,
      label: `${def.name} → ${hardpointId.toUpperCase()}`,
      where: gate.where,
    };
    this.bus.emit(MEV.REFIT_STARTED, { ...this.job });
    this.bus.emit(EV.NOTIFY, {
      text: `REFIT — ${this.job.label} — ${Math.ceil(gate.seconds)}s (${gate.where})`,
      important: true,
    });
    // `module` and the `ok` are here so that a caller written against the old
    // instantaneous `refit.install` contract still reads sensibly; `pending` is the
    // field that tells the truth, and `MEV.REFIT_FINISHED` is when it actually landed.
    return { ok: true, pending: true, job: this.job, module: def, seconds: gate.seconds };
  }

  /** Start a removal. Same shape, and out here it costs the part condition. */
  beginUninstall(hardpointId) {
    const gate = this.check(hardpointId, null, 'uninstall');
    if (!gate.ok) {
      this.bus.emit(MEV.REFIT_REFUSED, gate);
      return gate;
    }
    const hp = this.world.player.hardpoints.get(hardpointId);
    this.job = {
      action: 'uninstall',
      hardpointId,
      uid: hp.module.uid ?? null,
      conditionLoss: gate.conditionLoss,
      remaining: gate.seconds,
      total: gate.seconds,
      label: `${hp.module.def.name} ← ${hardpointId.toUpperCase()}`,
      where: gate.where,
    };
    this.bus.emit(MEV.REFIT_STARTED, { ...this.job });
    this.bus.emit(EV.NOTIFY, {
      text: `CUTTING — ${this.job.label} — ${Math.ceil(gate.seconds)}s (${gate.where})`,
      important: true,
    });
    return { ok: true, pending: true, job: this.job, module: hp.module.def, seconds: gate.seconds };
  }

  /** Abandon the job. The part stays where it was; the time is gone. */
  cancel() {
    if (!this.job) return false;
    this.bus.emit(EV.NOTIFY, { text: `REFIT ABANDONED — ${this.job.label}`, important: true });
    this.job = null;
    return true;
  }

  fixedUpdate(dt) {
    // `refit.js` may be constructed after this system, depending on how integration
    // orders its boot. Claim it the first step it exists rather than requiring an
    // ordering guarantee nobody wrote down.
    if (!this.enforced && this.refit) this.enforce();
    const job = this.job;
    if (!job) return;
    job.remaining -= dt;
    if (job.remaining > 0) return;
    this.job = null;
    this._complete(job);
  }

  _complete(job) {
    const refit = this.refit;
    if (!refit) return;
    let result;
    if (job.action === 'install') {
      // The condition penalty is applied to the inventory entry BEFORE it goes on, so
      // there is exactly one number and `refit._applyModuleEffects` reads the same one
      // every other system does.
      const item = this.world.inventory.find((i) => i.uid === job.uid);
      if (item && job.conditionLoss > 0) {
        item.condition = clamp01((item.condition ?? 1) - job.conditionLoss);
      }
      result = this._raw('install', job.hardpointId, job.uid);
    } else {
      result = this._raw('uninstall', job.hardpointId);
      if (result?.ok && job.conditionLoss > 0) {
        const back = this.world.inventory.find((i) => i.uid === job.uid);
        if (back) back.condition = clamp01((back.condition ?? 1) - job.conditionLoss);
      }
    }
    this.bus.emit(MEV.REFIT_FINISHED, { ...job, result });
    this.bus.emit(EV.NOTIFY, {
      text: result?.ok ? `REFIT COMPLETE — ${job.label}` : `REFIT FAILED — ${result?.reason ?? 'unknown'}`,
      important: true,
    });
    return result;
  }

  /** Call through to refit, bypassing our own wrapper if we installed one. */
  _raw(method, ...args) {
    const refit = this.refit;
    if (this._original && this._original[method]) return this._original[method].apply(refit, args);
    return refit[method](...args);
  }

  // =========================================================================
  // Enforcement
  // =========================================================================

  /**
   * Route `refit.install` / `refit.uninstall` through the gate.
   *
   * This wraps the live instance rather than editing `src/sim/refit.js`, which belongs
   * to another stream this wave. Without it the gate is a proposal rather than a rule,
   * and requirement 2 of this stream would be a document. It is deliberately trivial to
   * remove: `refit.gated = true` disables it permanently, and `release()` unwraps.
   */
  enforce() {
    const refit = this.refit;
    if (!refit || this.enforced || refit.gated) return false;
    this._original = {
      install: refit.install.bind(refit),
      uninstall: refit.uninstall.bind(refit),
    };
    const gate = this;
    refit.install = function gatedInstall(hardpointId, uid, opts) {
      if (opts?.bypassGate) return gate._original.install(hardpointId, uid);
      return gate.beginInstall(hardpointId, uid);
    };
    refit.uninstall = function gatedUninstall(hardpointId, opts) {
      if (opts?.bypassGate) return gate._original.uninstall(hardpointId);
      return gate.beginUninstall(hardpointId);
    };
    refit.gatedBy = this;
    this.enforced = true;
    return true;
  }

  release() {
    const refit = this.refit;
    if (!this.enforced || !refit || !this._original) return false;
    refit.install = this._original.install;
    refit.uninstall = this._original.uninstall;
    delete refit.gatedBy;
    this._original = null;
    this.enforced = false;
    return true;
  }

  // =========================================================================
  // Read API
  // =========================================================================

  /**
   * Per hardpoint: what is on it, what a removal would cost, and - for whatever is in
   * the hold - what installing it would cost, right here, right now. Cached array.
   */
  describe() {
    const rows = this._rows;
    rows.length = 0;
    const player = this.world.player;
    if (!player) return rows;
    const ctx = this.context();
    for (const id of HARDPOINTS) {
      const hp = player.hardpoints.get(id);
      const remove = hp?.module ? this.check(id, null, 'uninstall') : null;
      const fits = [];
      for (const item of this.world.inventory) {
        const c = this.check(id, item.moduleId, 'install');
        const def = getModule(item.moduleId);
        const accepts = def && (def.hardpoint === id
          || (def.hardpoint === 'port' && id === 'starboard')
          || (def.hardpoint === 'starboard' && id === 'port'));
        if (!accepts) continue;
        fits.push({
          uid: item.uid,
          moduleId: item.moduleId,
          name: def.name,
          condition: item.condition ?? 1,
          ok: c.ok,
          reason: c.reason,
          seconds: c.seconds,
          conditionLoss: c.conditionLoss,
          conditionAfter: clamp01((item.condition ?? 1) - c.conditionLoss),
        });
      }
      rows.push({
        id,
        module: hp?.module?.def ?? null,
        condition: hp?.module?.condition ?? null,
        breached: !!hp?.breached,
        remove: remove ? {
          ok: remove.ok, reason: remove.reason, seconds: remove.seconds,
          conditionLoss: remove.conditionLoss,
        } : null,
        fits,
      });
    }
    return rows;
  }

  /** The one-line state a HUD strip wants. */
  status() {
    const ctx = this.context();
    return {
      where: ctx.where,
      docked: ctx.docked,
      heavy: ctx.heavy,
      fieldDock: this.fieldDock,
      speedMul: ctx.speedMul,
      installLoss: ctx.installLoss,
      removeLoss: ctx.removeLoss,
      enforced: this.enforced,
      job: this.job
        ? { label: this.job.label, remaining: this.job.remaining, total: this.job.total }
        : null,
    };
  }

  dispose() {
    this.release();
    this.job = null;
  }
}
