/**
 * THE REFIT SCREEN.
 *
 * This is where the player spends the most emotional time, so it is built around one
 * promise: everything you are about to do to this ship is visible BEFORE you do it,
 * and the ship itself changes the instant you do.
 *
 * FIVE THINGS, and each one is a requirement rather than a feature:
 *
 *   1. THE SHIP IS THE SCREEN. The live cruiser is framed in 3D behind the panels
 *      with every hardpoint called out by a leader line to its own plate. Not an
 *      icon of a ship, not a paper doll - the actual hull, with the actual modules
 *      on it, lit by the actual POI.
 *
 *   2. INSTALLING UPDATES THE MODEL LIVE, WITH NO HITCH. `RefitSystem.install`
 *      builds and attaches the geometry synchronously, and the expensive part of
 *      that is the first bake of a material or texture the registry has not seen.
 *      So the screen PREWARMS: while it is open and idle it builds one candidate
 *      module per frame, throws the geometry away and keeps the cache. By the time
 *      the player clicks, the click costs a geometry build and nothing else. The
 *      measured cost of the last install and the worst frame in the twelve frames
 *      after it are printed on the screen, because "no visible hitch" is an
 *      acceptance criterion and an acceptance criterion you cannot read is a wish.
 *
 *   3. THE HOLD SHOWS WHERE EVERY PART CAME FROM. See ui/inventory.js.
 *
 *   4. WHAT CHANGES IS SHOWN AS A DIFF: arcs, reactor output, thrust, turn rate,
 *      cargo, shields, hangar - current on the left, resulting on the right, the
 *      changed rows in the highlight colour. The arc change is drawn as a wedge on
 *      a compass rose, because "+100 degrees of coverage" is a number and a wedge
 *      opening on your starboard quarter is a fact.
 *
 *   5. THE SILHOUETTE IS SHOWN CHANGING. The screen measures the hull's own outline
 *      - the same top and side extents the geometry stream's silhouette audit uses -
 *      and after an install draws the previous outline as a ghost behind the new
 *      one. If a module does not change the outline, this graph says so, and that
 *      is a defect worth seeing.
 */

import * as THREE from 'three';
import { HARDPOINTS, getModule } from '../core/contracts.js';
import { POWER_CHANNELS } from '../core/contracts.js';
import {
  C, F, TRACK, factionInk, fmtMass, fmtPct, fmtRange, smootherstep, arcCoverage,
} from './theme.js';
import { InventoryPanel } from './inventory.js';

const PROFILE_BINS = 30;
const MOUNT_ORDER = HARDPOINTS;
const MOUNT_KEY = { bow: '1', dorsal: '2', ventral: '3', port: '4', starboard: '5', engine: '6' };

const _v = new THREE.Vector3();
const _m = new THREE.Matrix4();
const _inv = new THREE.Matrix4();

export class RefitScreen {
  constructor(ui) {
    this.ui = ui;
    this.world = ui.world;
    this.inventory = new InventoryPanel(ui);

    this.active = false;
    this.selectedUid = null;
    this.selectedMount = 'bow';
    this.hoverUid = null;
    this.hoverMount = null;

    /** Camera pose written every frame while the screen is up. */
    this.yaw = 0.92;
    this.pitch = 0.21;
    this.distance = 2050;
    this._openedAt = 0;

    /** Prewarm bookkeeping. */
    this._warm = new Set();
    this._warmQueue = [];

    /** Install cost instrumentation - see the header, point 2. */
    this.lastInstall = null;   // { ms, worstFrameMs, framesLeft, module }
    this._frameProbe = 0;

    this.profile = null;
    this.prevProfile = null;
    this._profileAt = -10;

    this._callouts = [];
    for (let i = 0; i < MOUNT_ORDER.length; i++) {
      this._callouts.push({ id: null, x: 0, y: 0, ok: false, side: 1, ly: 0 });
    }
    this._pt = { x: 0, y: 0, z: 0, ok: false };
  }

  // =========================================================================
  // Lifecycle
  // =========================================================================

  open() {
    if (this.active) return;
    this.active = true;
    this._openedAt = this.ui.time;
    this.profile = this._measureOutline();
    this.prevProfile = null;
    this._queuePrewarm();
    this.ui.notify('REFIT BAY', { important: true });
  }

  close() {
    if (!this.active) return;
    this.active = false;
    this.lastInstall = null;
  }

  /**
   * Build one candidate module per frame and throw the geometry away. The material
   * registry and texture factory keep what they baked, which is the whole point:
   * the first build of a Coalition tier-3 broadside costs a triple texture bake,
   * and the player must never pay for it on the frame they click.
   */
  _queuePrewarm() {
    const q = this._warmQueue;
    q.length = 0;
    for (const item of this.world.inventory ?? []) {
      if (!this._warm.has(item.moduleId)) q.push(item.moduleId);
    }
  }

  _prewarmStep() {
    const materials = this.world.systems?.materials;
    if (!materials?.get || !this._warmQueue.length) return;
    const id = this._warmQueue.shift();
    if (this._warm.has(id)) return;
    const def = getModule(id);
    this._warm.add(id);
    if (!def?.build) return;
    try {
      const obj = def.build({
        rng: this.ui.rng.fork(`prewarm:${id}`),
        materials,
        palette: this.world.systems?.palette ?? materials.palette,
        faction: def.faction,
        lod: 0,
      });
      obj?.traverse?.((o) => { if (o.isMesh && o.geometry) o.geometry.dispose(); });
    } catch (err) {
      // A module that cannot be built is the geometry stream's problem, not a
      // reason for the refit screen to die on the frame it opened.
      console.warn(`[ui/refit] prewarm failed for "${id}"`, err);
    }
  }

  /**
   * The outline walk is thousands of matrix multiplies and it does NOT belong on the
   * click. `RefitSystem.install` is the part that has to be instant, because it is
   * what changes the ship; the outline graph is a secondary readout and nobody can
   * tell that it caught up one frame later. Measuring it here keeps the frame that
   * carries the click honest.
   */
  _remeasureIfPending() {
    if (!this._pendingProfile) return;
    this._pendingProfile = false;
    const t0 = performance.now();
    this.prevProfile = this.profile;
    this.profile = this._measureOutline();
    this._profileAt = this.ui.time;
    if (this.lastInstall) this.lastInstall.outlineMs = performance.now() - t0;
  }

  update(dt) {
    if (!this.active) return;
    this._remeasureIfPending();
    this._prewarmStep();
    this._driveCamera(dt);

    if (this.lastInstall && this.lastInstall.framesLeft > 0) {
      this.lastInstall.framesLeft--;
      this.lastInstall.worstFrameMs = Math.max(this.lastInstall.worstFrameMs, dt * 1000);
    }
  }

  /**
   * The refit pose. Written straight onto the camera in the UI band, after the
   * camera systems have run, so no camera state anywhere else has to be touched or
   * restored - leaving the screen simply stops writing and the tactical rig is
   * exactly where the player left it.
   */
  _driveCamera() {
    const world = this.world;
    const cam = world.camera;
    const player = world.player;
    if (!cam) return;
    const cx = player?.position.x ?? 0;
    const cz = player?.position.z ?? 0;

    // A very slow drift. Enough that the hull is alive, slow enough that reading a
    // callout is never a moving target.
    const t = this.ui.time - this._openedAt;
    const yaw = this.yaw + Math.sin(t * 0.055) * 0.075;
    const pitch = this.pitch + Math.sin(t * 0.041 + 1.1) * 0.022;
    const d = this.distance;

    cam.position.set(
      cx + Math.cos(pitch) * Math.sin(yaw) * d,
      Math.sin(pitch) * d + 60,
      cz + Math.cos(pitch) * Math.cos(yaw) * d,
    );
    cam.up.set(0, 1, 0);
    _v.set(cx, 30, cz);
    cam.lookAt(_v);
    cam.updateMatrixWorld();
  }

  // =========================================================================
  // Actions
  // =========================================================================

  get refit() { return this.world.systems?.refit ?? null; }

  selectItem(uid) {
    this.selectedUid = uid;
    // Jump the mount selection to the first mount this part actually fits, so the
    // preview is never showing a combination the player cannot make.
    const item = (this.world.inventory ?? []).find((i) => i.uid === uid);
    const def = item ? getModule(item.moduleId) : null;
    if (!def) return;
    const r = this.refit;
    const fits = MOUNT_ORDER.filter((id) => {
      if (!r) return false;
      const c = r.canInstall(id, def.id);
      return c.ok || c.occupied !== undefined;
    });
    if (fits.length && !fits.includes(this.selectedMount)) this.selectedMount = fits[0];
  }

  install() {
    const r = this.refit;
    if (!r) { this.ui.orderBar.say('REFIT SYSTEM UNAVAILABLE', 'error'); return; }
    if (!this.selectedUid) { this.ui.orderBar.say('SELECT A PART FIRST', 'error'); return; }

    const t0 = performance.now();
    const res = r.install(this.selectedMount, this.selectedUid);
    const ms = performance.now() - t0;

    if (!res?.ok) {
      this.ui.orderBar.say(`CANNOT INSTALL — ${(res?.reason ?? 'unknown').toUpperCase()}`, 'error');
      return;
    }
    this._pendingProfile = true;
    this.lastInstall = { ms, worstFrameMs: 0, outlineMs: 0, framesLeft: 12, module: res.module?.name ?? '' };
    this.selectedUid = null;
    this._queuePrewarm();
    this.ui.orderBar.say(`INSTALLED ${(res.module?.name ?? '').toUpperCase()} · ${ms.toFixed(1)} MS`, 'good');
  }

  uninstall(mountId = this.selectedMount) {
    const r = this.refit;
    if (!r) return;
    const res = r.uninstall(mountId);
    if (!res?.ok) {
      this.ui.orderBar.say(`CANNOT REMOVE — ${(res?.reason ?? 'unknown').toUpperCase()}`, 'error');
      return;
    }
    this._pendingProfile = true;
    this._queuePrewarm();
    this.ui.orderBar.say('PART RETURNED TO HOLD', 'good');
  }

  scrapSelected() {
    if (!this.selectedUid) return;
    const v = this.inventory.scrap(this.selectedUid);
    if (v) {
      this.ui.orderBar.say(`SCRAPPED — +${v.alloy} ALLOY +${v.composite} COMPOSITE`, 'good');
      this.selectedUid = null;
    }
  }

  repairMount(mountId = this.selectedMount) {
    const r = this.refit;
    if (!r?.repairHardpoint) return;
    const res = r.repairHardpoint(mountId);
    this.ui.orderBar.say(res.ok ? `MOUNT REPAIRED — ${res.cost} ALLOY`
      : `REPAIR FAILED — ${(res.reason ?? '').toUpperCase()}`, res.ok ? 'good' : 'error');
  }

  onClick(region) {
    if (region.kind === 'inventory') this.selectItem(region.uid);
    else if (region.kind === 'mount') {
      if (this.selectedMount === region.id && this.selectedUid) this.install();
      else this.selectedMount = region.id;
    } else if (region.kind === 'action') {
      if (region.action === 'install') this.install();
      else if (region.action === 'remove') this.uninstall();
      else if (region.action === 'scrap') this.scrapSelected();
      else if (region.action === 'repair') this.repairMount();
      else if (region.action === 'close') this.ui.openScreen(null);
    }
  }

  onKey(code) {
    for (const [id, key] of Object.entries(MOUNT_KEY)) {
      if (code === `digit${key}`) { this.selectedMount = id; return true; }
    }
    if (code === 'enter') { this.install(); return true; }
    if (code === 'backspace') { this.uninstall(); return true; }
    if (code === 'keyx') { this.scrapSelected(); return true; }
    if (code === 'keyr') { this.repairMount(); return true; }
    return false;
  }

  // =========================================================================
  // Outline measurement
  // =========================================================================

  /**
   * Bin the visible hull's vertices along the keel and keep the extremes. This is
   * the ship's actual outline from the top and from the side - the same measurement
   * the geometry stream's silhouette audit makes, done here so the refit screen has
   * no build-time dependency on that stream.
   */
  _measureOutline() {
    const hull = this.world.hullResult;
    const root = hull?.root ?? this.world.player?.root;
    if (!root) return null;

    const targets = [];
    const lod0 = hull?.lod?.levels?.[0]?.object;
    if (lod0) targets.push(lod0);
    else targets.push(root);
    if (hull?.hardpoints) for (const e of hull.hardpoints.values()) if (e.object) targets.push(e.object);

    root.updateMatrixWorld(true);
    _inv.copy(root.matrixWorld).invert();

    let zMin = Infinity, zMax = -Infinity;
    const box = hull?.bounds;
    if (box && Number.isFinite(box.min.z)) { zMin = box.min.z; zMax = box.max.z; }

    const bins = new Array(PROFILE_BINS);
    const collect = (pass) => {
      for (const t of targets) {
        t.traverse((o) => {
          if (!o.isMesh || o.isInstancedMesh) return;
          const pos = o.geometry?.getAttribute('position');
          if (!pos) return;
          _m.multiplyMatrices(_inv, o.matrixWorld);
          const step = pos.count > 2400 ? 3 : 1;
          for (let i = 0; i < pos.count; i += step) {
            _v.fromBufferAttribute(pos, i).applyMatrix4(_m);
            if (pass === 0) {
              if (_v.z < zMin) zMin = _v.z;
              if (_v.z > zMax) zMax = _v.z;
              continue;
            }
            let k = Math.floor(((_v.z - zMin) / (zMax - zMin)) * PROFILE_BINS);
            if (k < 0) k = 0; else if (k >= PROFILE_BINS) k = PROFILE_BINS - 1;
            const b = bins[k];
            const ax = Math.abs(_v.x);
            if (ax > b.halfWidth) b.halfWidth = ax;
            if (_v.y > b.top) b.top = _v.y;
            if (_v.y < b.bottom) b.bottom = _v.y;
            b.count++;
          }
        });
      }
    };

    if (!Number.isFinite(zMin) || zMax <= zMin) collect(0);
    if (!Number.isFinite(zMin) || zMax - zMin < 1e-3) return null;

    for (let i = 0; i < PROFILE_BINS; i++) {
      bins[i] = { halfWidth: 0, top: -Infinity, bottom: Infinity, count: 0 };
    }
    collect(1);
    let beam = 0, top = -Infinity, bottom = Infinity;
    for (const b of bins) {
      if (!b.count) { b.top = 0; b.bottom = 0; }
      beam = Math.max(beam, b.halfWidth * 2);
      top = Math.max(top, b.top);
      bottom = Math.min(bottom, b.bottom);
    }
    return {
      bins, zMin, zMax,
      length: zMax - zMin,
      beam,
      height: top - bottom,
      top, bottom,
    };
  }

  // =========================================================================
  // Loadout arithmetic
  // =========================================================================

  /**
   * What the hull is, or would be. Mirrors `RefitSystem._applyModuleEffects` exactly
   * so the preview cannot promise something the simulation will not deliver.
   *
   * @param {Object} [swap] { mount, module } to install, or { mount, remove:true }
   */
  summary(swap = null) {
    const world = this.world;
    const player = world.player;
    const hull = world.hullResult;
    const out = {
      filled: 0, weapons: 0, arcs: [], coverage: 0,
      powerBonus: 0, thrustMul: 1, turnMul: 1,
      hangarBays: 0, cargo: 6, sensorRange: 0, shieldCapacity: 0, salvageRate: 0,
      mass: player?.classDef?.mass ?? 0,
    };
    if (!player) return out;

    for (const id of MOUNT_ORDER) {
      let def = player.hardpoints?.get(id)?.module?.def ?? null;
      if (swap && swap.mount === id) def = swap.remove ? null : swap.module;
      if (!def) continue;
      out.filled++;
      out.mass += def.mass ?? 0;

      const hpDef = hull?.hardpoints?.get(id)?.def ?? null;
      const mirrored = id === 'starboard' && def.hardpoint === 'port';
      if (def.weapon) {
        out.weapons++;
        const yawCentre = mirrored && hpDef ? -hpDef.yawCentre : (hpDef?.yawCentre ?? 0);
        const yawWidth = def.weapon.yawWidth ?? hpDef?.yawWidth ?? Math.PI * 0.5;
        out.arcs.push({ centre: yawCentre, width: yawWidth, type: def.weapon.type, mount: id, range: def.weapon.range });
      }
      const g = def.grants ?? {};
      out.powerBonus += g.powerOutput ?? 0;
      out.thrustMul *= 1 + (g.thrust ?? 0);
      out.turnMul *= 1 + (g.turnRate ?? 0);
      out.hangarBays += g.hangarBays ?? 0;
      out.cargo += g.cargo ?? 0;
      out.sensorRange = Math.max(out.sensorRange, g.sensorRange ?? 0);
      out.shieldCapacity += g.shieldCapacity ?? 0;
      out.salvageRate += g.salvageRate ?? 0;
    }

    // Utility mounts declare a full circle and are not weapons; counting them would
    // report total coverage on a hull that cannot answer its own starboard quarter.
    out.firing = out.arcs.filter((a) => a.width < Math.PI * 1.98);
    const cov = arcCoverage(out.firing);
    out.coverage = cov.union;
    out.doubled = cov.doubled;
    out.maxDepth = cov.max;
    out.power = (player.power?.baseOutput ?? 100) + out.powerBonus;
    out.accel = (player.classDef?.accel ?? 6) * out.thrustMul;
    out.turnRate = (player.classDef?.turnRate ?? 0.085) * out.turnMul;
    return out;
  }

  /** The candidate the player is currently pointing at, if any. */
  candidate() {
    if (!this.selectedUid) return null;
    const item = (this.world.inventory ?? []).find((i) => i.uid === this.selectedUid);
    if (!item) return null;
    const def = getModule(item.moduleId);
    if (!def) return null;
    const r = this.refit;
    const check = r ? r.canInstall(this.selectedMount, def.id) : { ok: false, reason: 'no refit system' };
    return { item, def, check };
  }

  // =========================================================================
  // Draw
  // =========================================================================

  draw(P, hit) {
    const world = this.world;
    const player = world.player;

    this._drawChrome(P, hit);
    this._drawCallouts(P, hit);

    const leftX = 28;
    const leftW = 330;
    this.inventory.draw(P, leftX, 78, leftW, {
      selectedUid: this.selectedUid, hoverUid: this.hoverUid, hit,
    });
    this._drawActions(P, leftX, P.h - 190, leftW, hit);

    const rightW = 368;
    const rightX = P.w - 28 - rightW;
    let y = this._drawMountPanel(P, rightX, 78, rightW, hit);
    y = this._drawDelta(P, rightX, y + 22, rightW);
    this._drawSilhouette(P, rightX, y + 20, rightW);

    this._drawStatusStrip(P, player);
  }

  _drawChrome(P, hit) {
    P.scrim(0, 0, P.w, 50, { alpha: 0.86 });
    P.hline(0, 49, P.w, C.rule);
    P.text('REFIT BAY', 28, 32, { font: F.large, color: C.inkStrong, track: TRACK.head });

    const poi = this.world.systems?.materials?.poi ?? this.world.poi?.id ?? '';
    if (poi) P.label(String(poi).replace(/-/g, ' '), 190, 32, { color: C.inkFaint });

    const txt = 'ESC · RETURN TO HELM';
    const tw = P.measure(txt, F.microBold, TRACK.label);
    P.frame(P.w - 28 - tw - 16, 18, tw + 16, 20, C.ruleDim);
    P.text(txt, P.w - 28 - tw - 8, 32, { font: F.microBold, color: C.inkDim, track: TRACK.label });
    hit?.push({ kind: 'action', action: 'close', x: P.w - 28 - tw - 16, y: 18, w: tw + 16, h: 20 });

    // Wide side scrims so the panels sit on the frame instead of floating on the hull.
    P.scrim(0, 50, 388, P.h - 50, { alpha: 0.60, fadeRight: true });
    P.scrim(P.w - 428, 50, 428, P.h - 50, { alpha: 0.60, fadeLeft: true });
  }

  // --- hardpoint callouts --------------------------------------------------

  _drawCallouts(P, hit) {
    const world = this.world;
    const player = world.player;
    const hull = world.hullResult;
    const proj = this.ui.projector;
    if (!player) return;

    const cands = this._callouts;
    let n = 0;
    for (const id of MOUNT_ORDER) {
      const entry = hull?.hardpoints?.get(id);
      const c = cands[n];
      c.id = id;
      c.ok = false;
      if (entry?.socket) {
        entry.socket.getWorldPosition(_v);
        c.ok = proj.vec(_v, this._pt);
        c.x = this._pt.x;
        c.y = this._pt.y;
      }
      c.side = c.ok && c.x > P.w * 0.5 ? 1 : -1;
      n++;
    }

    // Two gutters, one per side, with a 1-D relaxation so plates never overlap.
    for (const side of [-1, 1]) {
      const list = cands.filter((c) => c.ok && c.side === side).sort((a, b) => a.y - b.y);
      const plateH = 46;
      let cursor = 96;
      for (const c of list) {
        c.ly = Math.max(cursor, Math.min(P.h - 220, c.y));
        cursor = c.ly + plateH + 8;
      }
    }

    for (const c of cands) {
      if (!c.ok) continue;
      const id = c.id;
      const hp = player.hardpoints?.get(id);
      const entry = hull?.hardpoints?.get(id);
      const def = entry?.def;
      const mod = hp?.module?.def ?? entry?.module ?? null;
      const selected = this.selectedMount === id;
      const breached = !!hp?.breached;
      const frac = hp ? hp.structureHP / Math.max(1, hp.maxStructureHP) : 1;

      const plateW = 172;
      const px = c.side < 0 ? 400 : P.w - 400 - plateW;
      const py = c.ly - 16;

      const edge = selected ? C.select : breached ? C.warn : mod ? C.rule : C.ruleDim;
      P.leader(c.x, c.y, c.side < 0 ? px + plateW : px, c.ly + 6,
        selected ? C.select : C.ruleDim, selected ? 1.5 : 1);
      P.diamond(c.x, c.y, selected ? 5 : 3.5,
        { fill: selected ? C.select : mod ? C.inkDim : null, stroke: selected ? C.select : C.inkFaint });

      P.scrim(px, py, plateW, 44, { alpha: 0.82 });
      P.frame(px, py, plateW, 44, edge);
      if (selected) P.fill(px, py, 3, 44, C.select);

      P.label(`${MOUNT_KEY[id]} ${def?.label ?? id}`, px + 9, py + 14,
        { color: selected ? C.select : C.inkFaint });
      if (mod) {
        const fi = factionInk(mod.faction);
        P.fill(px + 9, py + 19, 2, 9, fi.stripe);
        P.text(clip(P, mod.name.toUpperCase(), F.small, plateW - 26), px + 16, py + 27,
          { font: F.small, color: C.ink });
      } else {
        P.text(breached ? 'BREACHED' : 'EMPTY', px + 9, py + 27,
          { font: F.small, color: breached ? C.warn : C.inkFaint, track: TRACK.label });
      }
      P.bar(px + 9, py + 33, plateW - 18, 4, breached ? 0 : frac, {
        color: breached ? C.warnGhost : frac <= 0.35 ? C.warn : C.inkDim,
        track: C.track, threshold: 0.35, thresholdColor: C.warnDim,
      });

      hit?.push({ kind: 'mount', id, x: px, y: py, w: plateW, h: 44 });
    }
  }

  // --- mount detail --------------------------------------------------------

  _drawMountPanel(P, x, y, w, hit) {
    const world = this.world;
    const player = world.player;
    const id = this.selectedMount;
    const entry = world.hullResult?.hardpoints?.get(id);
    const def = entry?.def;
    const hp = player?.hardpoints?.get(id);
    const mod = hp?.module?.def ?? entry?.module ?? null;
    const cand = this.candidate();

    P.label('SELECTED MOUNT', x, y, { color: C.inkDim });
    P.hline(x, y + 5, w, C.rule);

    P.text((def?.label ?? id).toUpperCase(), x, y + 24,
      { font: F.midBold, color: C.inkStrong, track: TRACK.head });
    P.text(`TIER ${def?.maxTier ?? '?'} MAX`, x + w, y + 24,
      { font: F.small, color: C.inkFaint, align: 'right' });

    let cy = y + 40;
    if (def) {
      P.label('ARC', x, cy, { color: C.inkFaint });
      P.text(`${Math.round((def.yawWidth * 180) / Math.PI)}° ABOUT ${Math.round((def.yawCentre * 180) / Math.PI)}°`,
        x + 44, cy, { font: F.micro, color: C.inkFaint });
      P.label('STRUCTURE', x + 190, cy, { color: C.inkFaint });
      P.text(String(def.structureHP), x + w, cy, { font: F.micro, color: C.inkFaint, align: 'right' });
      cy += 14;
    }

    // Fitted
    P.hline(x, cy, w, C.ruleDim);
    cy += 16;
    if (mod) {
      const fi = factionInk(mod.faction);
      P.fill(x, cy - 9, 2, 11, fi.stripe);
      P.text(mod.name.toUpperCase(), x + 8, cy, { font: F.bodyBold, color: C.ink });
      P.text(fi.name.toUpperCase(), x + w, cy, { font: F.micro, color: fi.hue, align: 'right', track: TRACK.label });
      cy += 13;
      P.text(wrapFirst(mod.description ?? '', 52), x + 8, cy, { font: F.micro, color: C.inkFaint });
      cy += 12;
      P.text(wrapSecond(mod.description ?? '', 52), x + 8, cy, { font: F.micro, color: C.inkFaint });
      cy += 14;
    } else {
      P.text(hp?.breached ? 'MOUNT BREACHED — REPAIR BEFORE FITTING' : 'NOTHING FITTED',
        x, cy, { font: F.small, color: hp?.breached ? C.warn : C.inkFaint, track: TRACK.label });
      cy += 18;
    }

    // Candidate
    if (cand) {
      P.hline(x, cy, w, C.ruleDim);
      cy += 6;
      P.label('SELECTED PART', x, cy + 10, { color: C.select });
      cy += 22;
      const fi = factionInk(cand.def.faction);
      P.fill(x, cy - 9, 2, 11, fi.stripe);
      P.text(cand.def.name.toUpperCase(), x + 8, cy, { font: F.bodyBold, color: C.select });
      P.text(`T${cand.def.tier} · ${fmtMass(cand.def.mass ?? 0)}`, x + w, cy,
        { font: F.micro, color: C.inkFaint, align: 'right' });
      cy += 14;
      if (cand.def.weapon) {
        const wpn = cand.def.weapon;
        P.label(`${wpn.type} · ${fmtRange(wpn.range)} · ${wpn.damage} DMG`, x + 8, cy, { color: C.inkFaint });
        cy += 13;
      }
      const okText = cand.check.ok ? 'READY TO FIT'
        : cand.check.occupied ? `SWAPS OUT ${String(cand.check.occupied.def?.name ?? '').toUpperCase()}`
          : (cand.check.reason ?? '').toUpperCase();
      const okColor = cand.check.ok ? C.friendly : cand.check.occupied ? C.select : C.warn;
      P.text(okText, x + 8, cy, { font: F.microBold, color: okColor, track: TRACK.label });
      cy += 10;
    }

    return cy;
  }

  // --- the diff ------------------------------------------------------------

  _drawDelta(P, x, y, w) {
    const cand = this.candidate();
    const now = this.summary();
    const after = cand && (cand.check.ok || cand.check.occupied)
      ? this.summary({ mount: this.selectedMount, module: cand.def })
      : null;

    P.label('WHAT CHANGES', x, y, { color: C.inkDim });
    P.hline(x, y + 5, w, C.rule);
    let cy = y + 20;

    // Arc rose: current coverage solid, the candidate's new wedge hatched.
    this._drawArcRose(P, x + 44, cy + 44, 42, now, after, cand);

    const col1 = x + 104;
    const col2 = x + 236;
    const col3 = x + w;
    P.label('CURRENT', col2, cy, { color: C.inkFaint, align: 'right' });
    P.label('AFTER', col3, cy, { color: after ? C.select : C.inkFaint, align: 'right' });
    cy += 13;

    const rows = [
      ['MOUNTS', `${now.filled}/6`, after ? `${after.filled}/6` : null],
      ['WEAPONS', String(now.weapons), after ? String(after.weapons) : null],
      ['ARC', `${Math.round(now.coverage * 180 / Math.PI)}°`, after ? `${Math.round(after.coverage * 180 / Math.PI)}°` : null],
      ['ARC ×2', `${Math.round(now.doubled * 180 / Math.PI)}°`, after ? `${Math.round(after.doubled * 180 / Math.PI)}°` : null],
      ['REACTOR', `${now.power.toFixed(0)} PU`, after ? `${after.power.toFixed(0)} PU` : null],
      ['THRUST', `${now.accel.toFixed(2)} M/S²`, after ? `${after.accel.toFixed(2)} M/S²` : null],
      ['TURN', `${now.turnRate.toFixed(3)} R/S`, after ? `${after.turnRate.toFixed(3)} R/S` : null],
      ['CARGO', String(now.cargo), after ? String(after.cargo) : null],
      ['SHIELD', String(Math.round(now.shieldCapacity)), after ? String(Math.round(after.shieldCapacity)) : null],
      ['HANGAR', String(now.hangarBays), after ? String(after.hangarBays) : null],
      ['MASS', fmtMass(now.mass), after ? fmtMass(after.mass) : null],
    ];

    for (const [label, a, b] of rows) {
      const changed = b !== null && b !== a;
      P.label(label, col1, cy, { color: changed ? C.select : C.inkFaint });
      P.text(a, col2, cy, { font: F.small, color: changed ? C.inkDim : C.inkFaint, align: 'right' });
      P.text(b ?? '—', col3, cy, {
        font: changed ? F.bodyBold : F.small,
        color: changed ? C.select : C.inkFaint, align: 'right',
      });
      cy += 13;
    }
    return cy;
  }

  /**
   * The arc rose, drawn as CONCENTRIC BANDS - one ring per mount, not one pie.
   *
   * A filled pie answers "can anything shoot that way", which on a hull with a
   * 306-degree dorsal bed is always yes and therefore never changes. Bands answer
   * "how many mounts answer that bearing", which is what a broadside is, and which
   * moves the moment a part goes on. The candidate's band is drawn on the outside in
   * the highlight colour, so what the player is about to gain is a new ring.
   */
  _drawArcRose(P, cx, cy, R, now, after, cand) {
    const c = P.ctx;
    const arcs = now.firing ?? [];
    const added = after ? (after.firing ?? []).filter((a) => a.mount === this.selectedMount) : [];
    // A swap can COST an arc, and that is the more important half of the decision.
    const removed = after
      ? arcs.filter((a) => a.mount === this.selectedMount
        && !added.some((b) => Math.abs(b.centre - a.centre) < 1e-6 && Math.abs(b.width - a.width) < 1e-6))
      : [];
    const kept = arcs.filter((a) => !removed.includes(a));
    const bands = kept.length + added.length + removed.length;
    const bandW = Math.max(3.5, Math.min(7, (R - 12) / Math.max(1, bands)));

    c.beginPath();
    c.arc(cx, cy, R, 0, Math.PI * 2);
    c.strokeStyle = C.ruleDim;
    c.lineWidth = 1;
    c.stroke();

    const band = (a, i, color, weight) => {
      const r = R - 4 - i * bandW;
      if (r < 6) return;
      const a0 = -Math.PI * 0.5 + a.centre - a.width * 0.5;
      const a1 = -Math.PI * 0.5 + a.centre + a.width * 0.5;
      c.beginPath();
      c.arc(cx, cy, r, a0, a1);
      c.strokeStyle = color;
      c.lineWidth = weight;
      c.stroke();
    };

    added.forEach((a, i) => band(a, i, C.select, bandW - 1.2));
    removed.forEach((a, i) => band(a, i + added.length, C.warn, bandW - 1.2));
    kept.forEach((a, i) => band(a, i + added.length + removed.length, C.inkFaint, bandW - 1.6));

    P.rule(cx, cy - R - 5, P.hair, 9, C.ink);
    P.label('BOW', cx, cy - R - 9, { color: C.inkFaint, align: 'center' });
    const delta = added.length - removed.length;
    const tag = !after ? 'ARCS' : delta > 0 ? `ARCS +${delta}` : delta < 0 ? `ARCS ${delta}` : 'ARCS ±0';
    P.label(tag, cx, cy + R + 14, {
      color: delta > 0 ? C.select : delta < 0 ? C.warn : C.inkFaint, align: 'center',
    });
  }

  // --- silhouette ----------------------------------------------------------

  _drawSilhouette(P, x, y, w) {
    const prof = this.profile;
    P.label('SILHOUETTE', x, y, { color: C.inkDim });
    P.hline(x, y + 5, w, C.rule);
    if (!prof) {
      P.text('NO HULL GEOMETRY', x, y + 22, { font: F.small, color: C.inkFaint, track: TRACK.label });
      return y + 30;
    }

    const changed = this.prevProfile && (this.ui.time - this._profileAt) < 12;
    const ghostA = changed ? THREE.MathUtils.clamp(1 - (this.ui.time - this._profileAt) / 12, 0, 1) : 0;

    const h = 46;
    const gap = 8;
    const sideY = y + 18;
    const topY = sideY + h + gap + 12;

    this._profileGraph(P, x, sideY, w, h, prof, 'side', ghostA);
    P.label('SIDE', x, sideY + h + 9, { color: C.inkFaint });
    P.text(`${Math.round(prof.length)} × ${Math.round(prof.height)} M`, x + w, sideY + h + 9,
      { font: F.micro, color: C.inkFaint, align: 'right' });

    this._profileGraph(P, x, topY, w, h, prof, 'top', ghostA);
    P.label('PLAN', x, topY + h + 9, { color: C.inkFaint });
    P.text(`${Math.round(prof.length)} × ${Math.round(prof.beam)} M`, x + w, topY + h + 9,
      { font: F.micro, color: C.inkFaint, align: 'right' });

    if (changed) {
      P.text('GHOST = PREVIOUS FIT', x + w, y, {
        font: F.micro, color: C.selectDim, align: 'right', track: TRACK.label,
      });
    }
    return topY + h + 16;
  }

  _profileGraph(P, x, y, w, h, prof, mode, ghostA) {
    const c = P.ctx;
    P.frame(x, y, w, h, C.ruleDim);
    const cy = y + h * 0.5;
    P.rule(x, cy, w, P.hair, C.ruleDim);

    const drawOne = (p, stroke, fill, alpha) => {
      if (!p) return;
      const span = Math.max(1e-3, p.zMax - p.zMin);
      const scaleZ = w / span;
      // Both graphs share ONE vertical scale, so beam and height are comparable
      // between the two views rather than each being normalised to its own extreme -
      // which would hide exactly the thing the player is looking for, that a module
      // made the ship taller but not wider.
      const extent = Math.max(p.beam * 0.5, Math.abs(p.top), Math.abs(p.bottom), 1);
      const scaleY = (h * 0.47) / extent;
      c.globalAlpha = alpha;
      c.beginPath();
      // Bow to the LEFT: the Homeworld ship-portrait convention.
      for (let i = p.bins.length - 1; i >= 0; i--) {
        const b = p.bins[i];
        const zx = x + w - ((i + 0.5) / p.bins.length) * w;
        const v = mode === 'side' ? b.top : b.halfWidth;
        const py = cy - v * scaleY;
        if (i === p.bins.length - 1) c.moveTo(zx, py); else c.lineTo(zx, py);
      }
      for (let i = 0; i < p.bins.length; i++) {
        const b = p.bins[i];
        const zx = x + w - ((i + 0.5) / p.bins.length) * w;
        const v = mode === 'side' ? b.bottom : -b.halfWidth;
        c.lineTo(zx, cy - v * scaleY);
      }
      c.closePath();
      if (fill) { c.fillStyle = fill; c.fill(); }
      c.strokeStyle = stroke;
      c.lineWidth = 1;
      c.stroke();
      c.globalAlpha = 1;
      void scaleZ;
    };

    if (ghostA > 0.01) drawOne(this.prevProfile, C.selectDim, null, ghostA);
    drawOne(prof, C.ink, C.scrimHard, 1);
  }

  // --- actions and status --------------------------------------------------

  _drawActions(P, x, y, w, hit) {
    const cand = this.candidate();
    const player = this.world.player;
    const hp = player?.hardpoints?.get(this.selectedMount);
    // Key hints are spelled out. A ⏎ or a ⌫ is a font gamble, and a control the
    // player cannot find is the same as a control that is not there.
    const buttons = [
      { action: 'install', key: 'ENTER', label: 'FIT PART', on: !!cand && (cand.check.ok || !!cand.check.occupied) },
      { action: 'remove', key: 'BKSP', label: 'REMOVE', on: !!hp?.module },
      { action: 'scrap', key: 'X', label: 'SCRAP', on: !!this.selectedUid },
      { action: 'repair', key: 'R', label: 'REPAIR', on: !!hp && hp.structureHP < hp.maxStructureHP },
    ];

    P.label('ACTIONS', x, y, { color: C.inkDim });
    P.hline(x, y + 5, w, C.rule);
    let cy = y + 12;
    const bw = (w - 8) / 2;
    for (let i = 0; i < buttons.length; i++) {
      const b = buttons[i];
      const bx = x + (i % 2) * (bw + 8);
      const by = cy + Math.floor(i / 2) * 28;
      if (b.on) {
        P.frame(bx, by, bw, 22, C.ruleBright);
        P.fill(bx, by, 3, 22, C.select);
      } else {
        P.frame(bx, by, bw, 22, C.ruleDim);
      }
      P.text(b.label, bx + 10, by + 15, {
        font: F.microBold, color: b.on ? C.ink : C.inkFaint, track: TRACK.label,
      });
      P.text(b.key, bx + bw - 8, by + 15, {
        font: F.micro, color: b.on ? C.inkFaint : C.inkFaint, align: 'right',
      });
      if (b.on) hit?.push({ kind: 'action', action: b.action, x: bx, y: by, w: bw, h: 22 });
    }
  }

  _drawStatusStrip(P, player) {
    const world = this.world;
    const y = P.h - 62;
    P.scrim(0, y - 18, P.w, 80, { alpha: 0.80 });
    P.hline(0, y - 18, P.w, C.rule);

    const m = world.materials ?? { alloy: 0, composite: 0, exotic: 0 };
    const cells = [
      ['ALLOY', String(m.alloy), C.ink],
      ['COMPOSITE', String(m.composite), C.ink],
      ['EXOTIC', String(m.exotic), m.exotic > 0 ? C.salvage : C.inkFaint],
    ];
    let x = 420;
    for (const [k, v, col] of cells) {
      P.label(k, x, y, { color: C.inkFaint });
      P.text(v, x, y + 18, { font: F.midBold, color: col });
      x += 110;
    }

    if (player) {
      const hullFrac = player.maxHullHP > 0 ? player.hullHP / player.maxHullHP : 1;
      P.label('HULL', x, y, { color: C.inkFaint });
      P.text(fmtPct(hullFrac), x, y + 18, {
        font: F.midBold, color: hullFrac < 0.4 ? C.warn : C.ink,
      });
      P.bar(x, y + 24, 150, 4, hullFrac, { color: hullFrac < 0.4 ? C.warn : C.inkDim, track: C.track, segments: 10 });
      x += 190;
    }

    // The acceptance criterion, measured and printed.
    const li = this.lastInstall;
    P.label('LAST INSTALL', x, y, { color: C.inkFaint });
    if (li) {
      // Only the install cost is judged here. The following frame's wall time is
      // reported but never coloured: the review environment rasterises in software
      // and a frame time measured there means nothing (ARCHITECTURE.md, tooling).
      const bad = li.ms > 16.7;
      P.text(`${li.ms.toFixed(1)} MS`, x, y + 18, { font: F.midBold, color: bad ? C.warn : C.friendly });
      P.text(`OUTLINE +${li.outlineMs.toFixed(1)} MS DEFERRED`, x + 82, y + 12,
        { font: F.micro, color: C.inkFaint, track: TRACK.label });
      P.text(`NEXT FRAME ${li.worstFrameMs.toFixed(0)} MS`, x + 82, y + 23,
        { font: F.micro, color: C.inkFaint, track: TRACK.label });
    } else {
      P.text('—', x, y + 18, { font: F.midBold, color: C.inkFaint });
    }

    const warm = this._warm.size;
    const pending = this._warmQueue.length;
    P.label('GEOMETRY CACHE', P.w - 28, y, { color: C.inkFaint, align: 'right' });
    P.text(pending ? `PREWARMING ${warm}/${warm + pending}` : `${warm} PARTS WARM`,
      P.w - 28, y + 18, {
        font: F.small, color: pending ? C.select : C.inkFaint, align: 'right', track: TRACK.label,
      });
  }
}

// ---------------------------------------------------------------------------

function clip(P, str, font, maxW) {
  if (P.measure(str, font, TRACK.value) <= maxW) return str;
  let s = str;
  while (s.length > 1 && P.measure(`${s}…`, font, TRACK.value) > maxW) s = s.slice(0, -1);
  return `${s}…`;
}

function wrapFirst(str, n) {
  if (str.length <= n) return str.toUpperCase();
  const cut = str.lastIndexOf(' ', n);
  return str.slice(0, cut > 0 ? cut : n).toUpperCase();
}

function wrapSecond(str, n) {
  if (str.length <= n) return '';
  const cut = str.lastIndexOf(' ', n);
  const rest = str.slice((cut > 0 ? cut : n) + 1);
  return (rest.length > n ? `${rest.slice(0, n - 1)}…` : rest).toUpperCase();
}

export { POWER_CHANNELS, smootherstep };
