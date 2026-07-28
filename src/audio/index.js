/**
 * AUDIO INSTALLER.
 *
 * One entry point, idempotent, and it is called during boot before there is a
 * player, before any module is registered and before the first user gesture. So:
 *
 *   - No AudioContext is created here. `installAudio` builds an event graph and
 *     two engine systems and nothing else. The context appears on the first
 *     pointerdown / keydown / wheel, which is the only moment a browser will
 *     allow it, and every play call before then is a cheap early return.
 *   - Every dependency is read defensively. No player, no camera matrix, no
 *     salvage system, no POI: all of it degrades to silence, never to a throw.
 *   - If `AudioContext` does not exist at all - a headless renderer, a locked
 *     down embed - `AudioEngine.unavailable` latches true and the whole stream
 *     becomes a set of no-ops. The probe and the smoke test both run in exactly
 *     that state and must stay clean.
 *
 * TWO ENGINE SYSTEMS, both in the 200-299 VFX/audio band:
 *
 *   order 205 (fixed)   audio-sim     nothing but tracking the cutting beam,
 *                                     because that is the one sustained sound
 *                                     whose emitter is a simulation object that
 *                                     moves on the fixed step.
 *   order 210 (render)  audio-frame   listener, time scale, drive beds, beam
 *                                     release and the voice sweep. Runs every
 *                                     frame including while paused, because
 *                                     fading the master out IS work and pause
 *                                     never ticks the fixed step.
 *
 * Everything else is event-driven, straight off `core/events.js`.
 */

import { AudioEngine, MIX, SPACE, BUSES } from './engine.js';
import { WeaponAudio } from './weapons.js';
import { ImpactAudio } from './impacts.js';
import { ExplosionAudio } from './explosions.js';
import { DriveAudio } from './drive.js';
import { SalvageAudio } from './salvage.js';
import { AmbienceAudio, bedIdFor } from './ambience.js';
import { UIAudio } from './ui.js';
import { EV } from '../core/events.js';
import { clamp } from './synth.js';

export { AudioEngine, AudioMixer, MIX, SPACE, BUSES } from './engine.js';
export { WeaponAudio } from './weapons.js';
export { ImpactAudio } from './impacts.js';
export { ExplosionAudio } from './explosions.js';
export { DriveAudio } from './drive.js';
export { SalvageAudio } from './salvage.js';
export { AmbienceAudio, bedIdFor } from './ambience.js';
export { UIAudio } from './ui.js';

/** Stable identities for beam mounts, so one mount holds one sustained voice. */
const MOUNT_IDS = new WeakMap();
let mountSeq = 0;
function mountKey(ship, mount) {
  if (!mount) return ship?.id ?? 'anon';
  let id = MOUNT_IDS.get(mount);
  if (id === undefined) {
    id = `m${mountSeq++}`;
    MOUNT_IDS.set(mount, id);
  }
  return id;
}

/** Projectile kinds from `sim/combat.js` mapped onto the instruments here. */
const KIND_TO_TYPE = {
  slug: 'cannon', shell: 'cannon', railslug: 'rail',
  missile: 'missile', flak: 'flak', pdslug: 'pd',
};

/** How hard an impact of each kind hits. Point defence should barely register. */
const IMPACT_SEVERITY = {
  pd: 0.22, pdslug: 0.22, flak: 0.38, cannon: 0.7, slug: 0.62, shell: 0.72,
  rail: 1.0, railslug: 1.0, missile: 0.95, beam: 0.45, lance: 0.8, mining: 0.3,
};

/**
 * @param {import('../core/world.js').World} world
 * @param {Object} [opts]
 * @param {boolean} [opts.autoGesture]  install window gesture listeners (default true)
 * @param {string}  [opts.poi]          ambience bed to use before a POI is entered
 * @param {number}  [opts.volume]       0..1.5 master trim
 * @returns {Object} the audio facade, also parked on `world.systems.audio`
 */
export function installAudio(world, opts = {}) {
  if (world?.systems?.audio) return world.systems.audio;
  if (!world || !world.engine) return null;

  const rng = (world.rng?.fork ? world.rng.fork('audio') : null);
  const core = new AudioEngine({ rng });
  if (opts.volume !== undefined) core.volume = clamp(opts.volume, 0, 1.5);

  const weapons = new WeaponAudio(core);
  const impacts = new ImpactAudio(core);
  const explosions = new ExplosionAudio(core);
  const drives = new DriveAudio(core);
  const salvage = new SalvageAudio(core);
  const ambience = new AmbienceAudio(core);
  const ui = new UIAudio(core);

  const bus = world.bus ?? world.engine.bus;
  const offs = [];
  const on = (type, fn) => {
    if (!bus?.on) return;
    offs.push(bus.on(type, (payload) => {
      // A thrown handler is already caught and logged by the bus, but audio is not
      // worth a console error in someone else's stream, so swallow deliberately
      // and keep a count.
      try { fn(payload ?? {}); } catch (err) { api.stats.errors++; api._lastError = err; }
    }));
  };

  /** Shields absorbed this hit, so the hull thud that follows is suppressed. */
  let shieldGuardTarget = null;
  let shieldGuardAt = -1;

  const defaultBed = bedIdFor(opts.poi ?? world.poi?.paletteId ?? world.poi?.id ?? 'giant-orbit');

  // -------------------------------------------------------------------------
  // helpers
  // -------------------------------------------------------------------------

  /** Spatial record for a THREE.Vector3-ish point, or the listener if absent. */
  const at = (p) => (p && Number.isFinite(p.x) ? core.spatialAt(p.x, p.y, p.z) : core.here());

  const hullSize = (ship) => clamp((ship?.classDef?.length ?? 400) / 480, 0.35, 2.4);

  const weaponSize = (def, ship) => clamp(
    0.55 + 0.30 * Math.pow(Math.max(2, def?.damage ?? 40) / 45, 0.45)
    + 0.30 * Math.min(1.6, (ship?.classDef?.length ?? 400) / 900),
    0.55, 1.9,
  );

  // -------------------------------------------------------------------------
  // combat
  // -------------------------------------------------------------------------

  on(EV.WEAPON_FIRED, ({ ship, mount, origin, aimPoint, type }) => {
    if (!core.ready || core.paused) return;
    const def = mount?.def ?? null;
    const t = type ?? def?.type ?? 'cannon';
    const spat = at(origin ?? ship?.position);
    if (!spat.audible) return;
    // A missile is panned from the launcher toward where it is going; everything
    // else stays where it was fired from.
    let travel = null;
    if (t === 'missile' && aimPoint && Number.isFinite(aimPoint.x)) {
      const to = core.spatialAt(aimPoint.x, aimPoint.y, aimPoint.z, TRAVEL);
      travel = { pan: to.pan, cutoff: to.cutoff };
      // spatialAt wrote into TRAVEL, not the shared scratch, so `spat` is intact.
    }
    weapons.fire(t, spat, {
      faction: ship?.faction ?? 'player',
      size: weaponSize(def, ship),
      key: mountKey(ship, mount),
      travel,
    });
  });

  on(EV.SHIELD_IMPACT, ({ ship, point, amount }) => {
    if (!core.ready || core.paused) return;
    shieldGuardTarget = ship ?? null;
    shieldGuardAt = core.now;
    impacts.shield(at(point ?? ship?.position), {
      size: hullSize(ship),
      severity: clamp((amount ?? 60) / 260, 0.2, 1),
      faction: ship?.faction ?? 'player',
    });
  });

  on(EV.PROJECTILE_IMPACT, ({ point, target, type }) => {
    if (!core.ready || core.paused) return;
    // The shield already answered for this one.
    if (target && target === shieldGuardTarget && core.now - shieldGuardAt < 0.04) return;
    impacts.hull(at(point ?? target?.position), {
      size: hullSize(target),
      severity: IMPACT_SEVERITY[type] ?? 0.6,
      faction: target?.faction ?? 'player',
    });
  });

  on(EV.SUBSYSTEM_HIT, ({ ship, subsystem, point }) => {
    if (!core.ready || core.paused) return;
    impacts.graze(at(point ?? subsystem?.worldPosition ?? ship?.position), {
      kind: subsystem?.def?.kind ?? 'weapon',
    });
  });

  on(EV.SUBSYSTEM_DESTROYED, ({ ship, subsystem, point }) => {
    if (!core.ready || core.paused) return;
    impacts.subsystem(at(point ?? subsystem?.worldPosition ?? ship?.position), {
      size: hullSize(ship),
      kind: subsystem?.def?.kind ?? 'weapon',
    });
  });

  on(EV.SHIP_DESTROYED, ({ ship, catastrophic }) => {
    if (!core.ready || core.paused) return;
    explosions.detonate(at(ship?.position), {
      radius: ship?.radius ?? (ship?.classDef?.length ?? 400) * 0.42,
      catastrophic: !!catastrophic,
      faction: ship?.faction ?? 'player',
    });
  });

  // The VFX stream may emit its own detonations for wreck secondaries.
  on(EV.EXPLOSION, (e) => {
    if (!core.ready || core.paused) return;
    const p = e.point ?? e.position ?? null;
    const spat = at(p);
    if (e.radius && e.radius > 90) {
      explosions.detonate(spat, { radius: e.radius, catastrophic: !!e.catastrophic });
    } else {
      explosions.secondary(spat, { radius: e.radius ?? 30 });
    }
  });

  // -------------------------------------------------------------------------
  // the player's hull
  // -------------------------------------------------------------------------

  on(EV.HARDPOINT_BREACH_WARNING, () => ui.alarm());
  on(EV.HARDPOINT_BREACHED, ({ ship }) => {
    impacts.breach(at(ship?.position));
    ui.alarm();
  });
  on(EV.MODULE_LOST, () => ui.notify(true));
  on(EV.MODULE_INSTALLED, () => ui.install());
  on(EV.MODULE_REMOVED, () => ui.uninstall());
  on(EV.SHIP_DISABLED, ({ ship }) => { if (ship?.isPlayer) ui.alarm(); });

  // -------------------------------------------------------------------------
  // salvage
  // -------------------------------------------------------------------------

  on(EV.SALVAGE_CUT_START, ({ wreck, section }) => {
    if (!core.ready || core.paused) return;
    salvage.startCut(at(section?.worldPosition ?? wreck?.body?.position), wreck?.faction ?? 'player');
  });
  on(EV.SALVAGE_CUT_STOP, () => salvage.stopCut(0.2));
  on(EV.SALVAGE_TOW_START, ({ section }) => {
    const spat = at(section?.worldPosition);
    salvage.stopCut(0.10);
    salvage.sectionFree(spat, salvage.cut?.faction ?? 'player');
  });
  on(EV.SALVAGE_ACQUIRED, ({ kind }) => salvage.acquired(core.here(), { module: kind === 'module' }));

  // -------------------------------------------------------------------------
  // ship systems, orders, world
  // -------------------------------------------------------------------------

  on(EV.POWER_ROUTED, () => ui.power());
  on(EV.ORDER_MOVE, () => ui.confirm());
  on(EV.ORDER_ATTACK, () => ui.confirm());
  on(EV.ORDER_SALVAGE, () => ui.confirm());
  on(EV.ORDER_STRIKECRAFT, () => ui.confirm());
  on(EV.SELECTION_CHANGED, () => ui.select());
  on(EV.NOTIFY, ({ important }) => ui.notify(!!important));
  on(EV.BATTLE_STARTED, () => ui.notify(true));

  on(EV.POI_ENTERED, (e) => {
    const bed = e.poi?.paletteId ?? e.def?.paletteId ?? e.def?.kind ?? e.id;
    ambience.enter(bed);
  });

  on(EV.TIME_SCALE_CHANGED, ({ scale }) => {
    const prev = core.timeScale;
    ui.timeScale(scale ?? 1, prev);
    core.setTimeScale(scale ?? 1);
  });

  // -------------------------------------------------------------------------
  // engine systems
  // -------------------------------------------------------------------------

  const eng = world.engine;

  // Fixed step: the cutting beam's emitter is a simulation object, so track it on
  // the simulation's clock. Everything else audio does is render-rate.
  const simSystem = {
    name: 'audio-sim',
    order: 205,
    fixedUpdate() {
      if (!core.ready || core.paused) return;
      const sal = world.systems?.salvage;
      const cutting = sal?.cutting;
      if (salvage.cut && !cutting) { salvage.stopCut(0.18); return; }
      if (!cutting?.section) return;
      const p = cutting.section.worldPosition;
      if (!p) return;
      salvage.updateCut(core.spatialAt(p.x, p.y, p.z), cutting.section.cutProgress ?? 0);
    },
  };

  const renderSystem = {
    name: 'audio-frame',
    order: 210,
    update(dt, e) {
      // Time scale is polled rather than only listened for, because `setScaleTable`
      // can change the effective scale without emitting when the index survives.
      core.setTimeScale(e.timeScale);
      if (!core.ready) return;

      // --- listener ---------------------------------------------------------
      const cam = world.camera;
      if (cam?.updateMatrixWorld) {
        cam.updateMatrixWorld();
        const m = cam.matrixWorld?.elements;
        const focus = world.player?.position ?? null;
        let d = 0;
        if (focus && cam.position) {
          const ddx = cam.position.x - focus.x;
          const ddy = cam.position.y - focus.y;
          const ddz = cam.position.z - focus.z;
          d = Math.sqrt(ddx * ddx + ddy * ddy + ddz * ddz);
        }
        core.setListener(m, d);
      }

      // First bed. Deferred to here because there is no context - and therefore
      // nowhere to put it - until the player has touched something.
      if (!ambience.current && !core.paused) ambience.enter(defaultBed);

      weapons.update();
      drives.update(dt, world.ships ?? EMPTY, world.player ?? null);
      core.sweep();
    },
  };

  eng.add(simSystem);
  eng.addRender(renderSystem);

  if (opts.autoGesture !== false) core.attachGestures(globalThis);

  const api = {
    core, weapons, impacts, explosions, drives, salvage, ambience, ui,
    stats: { errors: 0 },
    _lastError: null,

    /** Start real-time audio now. Must be called from a user gesture. */
    unlock() { return core.unlock(); },
    get ready() { return core.ready; },
    get unavailable() { return core.unavailable; },
    setVolume(v) { core.setVolume(v); },

    /** Force a specific ambience bed. Used by the probe and by the POI stream. */
    setPOI(id) { return ambience.enter(id); },

    report() {
      return {
        ready: core.ready,
        unavailable: core.unavailable,
        paused: core.paused,
        timeScale: core.timeScale,
        pitch: core.pitch,
        stretch: core.stretch,
        zoom: Number(core.zoom.toFixed(2)),
        bed: ambience.currentId,
        drives: drives.count,
        beams: weapons.held.size,
        cutting: !!salvage.cut,
        voices: core.stats.voices,
        started: core.stats.started,
        dropped: core.stats.dropped,
        gated: core.stats.gated,
        errors: api.stats.errors,
      };
    },

    dispose() {
      for (const off of offs) { try { off(); } catch { /* already detached */ } }
      offs.length = 0;
      weapons.stopAll(0.02);
      drives.stopAll(0.02);
      salvage.stopCut(0.02);
      ambience.stopAll(0.02);
      const i = eng.systems.indexOf(simSystem);
      if (i >= 0) eng.systems.splice(i, 1);
      const j = eng.renderSystems.indexOf(renderSystem);
      if (j >= 0) eng.renderSystems.splice(j, 1);
      core.dispose();
      if (world.systems.audio === api) delete world.systems.audio;
    },
  };

  world.register?.('audio', api);
  return api;
}

const EMPTY = [];
/** Scratch spatial record for the missile's destination, kept off the shared one. */
const TRAVEL = { gain: 0, pan: 0, cutoff: 19000, distance: 0, audible: false };

export default installAudio;
