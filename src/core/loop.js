import { SIM, TIME_SCALES } from './units.js';
import { EventBus, EV } from './events.js';

/**
 * The engine loop.
 *
 * Simulation runs on a fixed 60 Hz step so behaviour is identical regardless of
 * frame rate, and so a seeded run is reproducible. Rendering interpolates.
 * Time controls scale how many sim steps a real second buys, they never change
 * the step size - a variable dt would make capital ship momentum feel different
 * at different speeds, which is exactly the thing this game cannot afford.
 */
export class Engine {
  constructor() {
    this.bus = new EventBus();
    this.systems = [];
    this.renderSystems = [];

    this.timeScaleIndex = 1; // 1x
    this.accumulator = 0;
    this.simTime = 0;      // seconds of in-world time elapsed
    this.frameTime = 0;    // seconds of wall-clock time elapsed
    this.frame = 0;
    this.alpha = 0;        // interpolation factor for render

    this._running = false;
    this._lastNow = 0;
    this._rafId = 0;
    this._boundTick = this._tick.bind(this);

    this.stats = { fps: 0, cpuMs: 0, stepMs: 0, renderMs: 0, steps: 0 };
    this._fpsAccum = 0;
    this._fpsFrames = 0;
  }

  get timeScale() {
    return TIME_SCALES[this.timeScaleIndex];
  }

  get paused() {
    return this.timeScale === 0;
  }

  setTimeScaleIndex(i) {
    const clamped = Math.max(0, Math.min(TIME_SCALES.length - 1, i | 0));
    if (clamped === this.timeScaleIndex) return;
    this.timeScaleIndex = clamped;
    this.accumulator = 0;
    this.bus.emit(EV.TIME_SCALE_CHANGED, { scale: this.timeScale, index: clamped });
  }

  togglePause() {
    this.setTimeScaleIndex(this.paused ? this._resumeIndex ?? 1 : ((this._resumeIndex = this.timeScaleIndex), 0));
  }

  /**
   * Register a system.
   * @param {{name?:string, fixedUpdate?:(dt:number,engine:Engine)=>void,
   *          update?:(dt:number,engine:Engine)=>void, order?:number}} system
   */
  add(system) {
    this.systems.push(system);
    this.systems.sort((a, b) => (a.order ?? 100) - (b.order ?? 100));
    return system;
  }

  /** Render-rate systems run every frame regardless of pause (camera, VFX lerp, UI). */
  addRender(system) {
    this.renderSystems.push(system);
    this.renderSystems.sort((a, b) => (a.order ?? 100) - (b.order ?? 100));
    return system;
  }

  start() {
    if (this._running) return;
    this._running = true;
    this._lastNow = performance.now();
    this._rafId = requestAnimationFrame(this._boundTick);
  }

  stop() {
    this._running = false;
    cancelAnimationFrame(this._rafId);
  }

  /** Advance exactly one sim step even while paused. Used by "step" debug key. */
  stepOnce() {
    this._fixedStep(SIM.dt);
  }

  _fixedStep(dt) {
    this.simTime += dt;
    for (const s of this.systems) s.fixedUpdate?.(dt, this);
  }

  _tick(now) {
    if (!this._running) return;
    this._rafId = requestAnimationFrame(this._boundTick);

    const cpuStart = now;
    // Clamp: a long stall (tab switch, hitch) must not spiral the accumulator.
    let wall = (now - this._lastNow) / 1000;
    this._lastNow = now;
    if (wall > 0.25) wall = 0.25;
    this.frameTime += wall;

    const stepStart = performance.now();
    let steps = 0;
    if (!this.paused) {
      this.accumulator += wall * this.timeScale;
      while (this.accumulator >= SIM.dt && steps < SIM.maxSubsteps) {
        this._fixedStep(SIM.dt);
        this.accumulator -= SIM.dt;
        steps++;
      }
      // If we blew the substep budget the world is running slower than requested;
      // drop the backlog rather than accumulate an unpayable debt.
      if (steps >= SIM.maxSubsteps) this.accumulator = 0;
    }
    this.alpha = this.paused ? 0 : this.accumulator / SIM.dt;
    this.stats.steps = steps;
    this.stats.stepMs = performance.now() - stepStart;

    const renderStart = performance.now();
    for (const s of this.renderSystems) s.update?.(wall, this);
    this.stats.renderMs = performance.now() - renderStart;

    this.frame++;
    this.stats.cpuMs = performance.now() - cpuStart;
    this._fpsAccum += wall;
    this._fpsFrames++;
    if (this._fpsAccum >= 0.5) {
      this.stats.fps = this._fpsFrames / this._fpsAccum;
      this._fpsAccum = 0;
      this._fpsFrames = 0;
    }
  }
}
