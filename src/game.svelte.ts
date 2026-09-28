import type { Bench } from './bench.ts';
import { rosterFrom } from './render/roster.ts';
import type { Stage } from './render/stage.ts';
import { createBattle, type BattleSpec } from './sim/battle.ts';
import { compileDesign, validateDesign } from './sim/design.ts';
import type { FleetOrder } from './sim/deploy.ts';
import { exerciseBattle } from './sim/run.ts';
import type { SimClient } from './sim-client.ts';
import type { Overlay } from './ui/overlay.ts';
import { app } from './ui/state.svelte.ts';
import { createPrev, M_STRIDE, savePrev, U_STRIDE, U_TARGET, writeModules, writeUnits } from './worker/snapshot.ts';

const CLICK_SLOP_PX = 5;
const UI_UPDATE_MS = 100;
const REPORT_DELAY_MS = 2500;

/** Ties the screens to the stage and the sim worker. Owns the battle lifecycle. */
export class Game {
  private preview: { units: Float32Array; modules: Float32Array } | null = null;
  private lastUi = 0;
  private lastFrame = 0;
  private reportTimer = 0;
  private readonly stage: Stage;
  private readonly sim: SimClient;
  private readonly overlay: Overlay;
  private readonly bench: Bench | null;

  constructor(stage: Stage, sim: SimClient, overlay: Overlay, bench: Bench | null) {
    this.stage = stage;
    this.sim = sim;
    this.overlay = overlay;
    this.bench = bench;
    sim.onSnapshot = (snap) => {
      stage.addEvents(snap.meta.events);
      this.bench?.simSample(snap.meta.stepMs, snap.meta.steps);
    };
    sim.onEnded = (msg) => {
      app.report = msg.report;
      app.lastHash = msg.hash;
      window.clearTimeout(this.reportTimer);
      if (this.bench) {
        this.reportTimer = window.setTimeout(() => this.startBattle(app.battle.seed + 1), 3000);
        return;
      }
      this.reportTimer = window.setTimeout(() => {
        if (app.screen === 'battle') app.screen = 'report';
      }, REPORT_DELAY_MS);
    };
    this.attachPicking();
    stage.rig.onUserInput = () => {
      if (app.screen === 'battle') app.battle.follow = false;
    };
  }

  setFollow(on: boolean): void {
    app.battle.follow = on;
  }

  /** The player's fleet for the current exercise: valid designs with a count above zero. */
  fleetOrders(): FleetOrder[] {
    const out: FleetOrder[] = [];
    for (const [id, count] of Object.entries(app.order)) {
      const design = app.design(id);
      if (!design || count <= 0 || validateDesign(design).length) continue;
      out.push({ design: $state.snapshot(design), count });
    }
    return out;
  }

  fleetCost(): number {
    return this.fleetOrders().reduce((s, o) => s + compileDesign(o.design).cost * o.count, 0);
  }

  private spec(seed: number): BattleSpec {
    return exerciseBattle($state.snapshot(app.exercise), this.fleetOrders(), seed);
  }

  /** Show the fleet in its deployment zone, facing the opposition, with no sim running. */
  showPreview(): void {
    if (this.fleetOrders().length === 0) {
      this.stage.clearBattle();
      this.preview = null;
      return;
    }
    const spec = this.spec(app.battle.seed);
    const w = createBattle(spec);
    this.stage.setMap(spec.width, spec.height);
    this.stage.loadBattle(rosterFrom(w));
    const prev = createPrev(w.count);
    savePrev(w, prev);
    const units = new Float32Array(w.count * U_STRIDE);
    const modules = new Float32Array(w.moduleCount * M_STRIDE);
    writeUnits(w, prev, units);
    writeModules(w, modules);
    this.preview = { units, modules };
  }

  startBattle(seed: number): void {
    const orders = this.fleetOrders();
    if (orders.length === 0) return;
    window.clearTimeout(this.reportTimer);
    const spec = this.spec(seed);
    const w = createBattle(spec);
    this.stage.setMap(spec.width, spec.height);
    this.stage.loadBattle(rosterFrom(w));
    this.preview = null;
    this.bench?.markRestart(performance.now());
    app.report = null;
    app.battle = {
      ...app.battle,
      active: true,
      seed,
      tick: 0,
      onField: [0, 0],
      ended: false,
      winner: -1,
      selected: -1,
      follow: true,
      inspect: null,
      names: unitNames(w.count, (i) => w.designs[w.design[i]].hull.name, (i) => w.side[i]),
    };
    this.sim.start(spec);
    app.screen = 'battle';
  }

  setSpeed(v: number): void {
    this.sim.setSpeed(v);
    app.battle.speed = v;
  }

  togglePause(): void {
    this.sim.setPaused(!this.sim.paused);
    app.battle.paused = this.sim.paused;
  }

  skip(): void {
    this.sim.skip();
  }

  select(unit: number): void {
    app.battle.selected = unit;
    if (unit < 0) app.battle.inspect = null;
    this.sim.inspect(unit);
  }

  /** Called once per animation frame. */
  frame(now: number): void {
    const inBattle = app.screen === 'battle';
    const snap = this.sim.latest;
    const dt = this.lastFrame ? Math.min(0.1, (now - this.lastFrame) / 1000) : 0;
    this.lastFrame = now;
    if (inBattle && snap) {
      this.stage.frame(snap.units, snap.modules, this.sim.alpha(now));
      if (app.battle.follow) this.frameFight(snap.units, dt);
      const sel = app.battle.selected;
      const target = sel >= 0 ? snap.units[sel * U_STRIDE + U_TARGET] : -1;
      this.overlay.update(this.stage, sel, target, app.battle.names);
      if (now - this.lastUi > UI_UPDATE_MS) {
        this.lastUi = now;
        const m = snap.meta;
        app.battle.tick = m.tick;
        app.battle.onField = m.onField;
        app.battle.ended = m.ended;
        app.battle.winner = m.winner;
        app.battle.inspect = m.inspect;
      }
    } else {
      this.overlay.hide();
      const p = app.screen === 'fleet' ? this.preview : null;
      this.stage.frame(p?.units ?? null, p?.modules ?? null, 1);
    }
    this.bench?.frame(now);
  }

  /** Keep the fight in view: centre on the ships still fighting, zoom to fit them. */
  private frameFight(units: Float32Array, dt: number): void {
    const b = this.stage.fightBounds(units);
    if (!b) return;
    const pad = 900;
    const dist = this.stage.rig.fitDistance(b.w + pad, b.h + pad);
    this.stage.rig.track(b.cx, b.cz, dist, dt);
  }

  private attachPicking(): void {
    const el = this.stage.renderer.domElement;
    let downX = 0;
    let downY = 0;
    el.addEventListener('pointerdown', (e) => {
      downX = e.clientX;
      downY = e.clientY;
    });
    el.addEventListener('pointerup', (e) => {
      if (app.screen !== 'battle') return;
      if (Math.hypot(e.clientX - downX, e.clientY - downY) > CLICK_SLOP_PX) return;
      this.select(this.stage.pick(e.clientX, e.clientY));
    });
  }
}

/** Call signs: "BASTION 1" for ours, "OPFOR LANCET 7" for theirs. */
function unitNames(count: number, hull: (i: number) => string, side: (i: number) => number): string[] {
  const seen = new Map<string, number>();
  const names: string[] = [];
  for (let i = 0; i < count; i++) {
    const key = `${side(i)}:${hull(i)}`;
    const n = (seen.get(key) ?? 0) + 1;
    seen.set(key, n);
    names.push(`${side(i) === 1 ? 'OPFOR ' : ''}${hull(i).toUpperCase()} ${n}`);
  }
  return names;
}
