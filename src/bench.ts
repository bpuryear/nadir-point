// Frame-time benchmark for the reference-machine check. ?bench=N runs N
// seconds after a 5 s warm-up, looping battles, then prints a result box.

const WARMUP_S = 5;
const SPIKE_MS = 20;
const RESTART_WINDOW_MS = 2000;

export class Bench {
  private readonly seconds: number;
  private readonly start = performance.now();
  private readonly frames: number[] = [];
  private readonly spikes: { at: number; dt: number }[] = [];
  private readonly sim: number[] = [];
  private readonly restarts: number[] = [];
  private hidden = 0;
  private last = 0;
  done = false;

  constructor(seconds: number) {
    this.seconds = seconds;
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.hidden++;
    });
  }

  private recording(now: number): boolean {
    const s = (now - this.start) / 1000;
    return !this.done && s > WARMUP_S && s < WARMUP_S + this.seconds;
  }

  frame(now: number): void {
    const prev = this.last;
    if (prev > 0 && this.recording(now)) {
      const dt = now - prev;
      this.frames.push(dt);
      if (dt > SPIKE_MS) this.spikes.push({ at: prev, dt });
    }
    this.last = now;
    if (this.done) return;
    const elapsed = (now - this.start) / 1000 - WARMUP_S;
    if (elapsed >= this.seconds) {
      this.done = true;
      this.show(this.report());
    } else if (Math.floor(now / 500) !== Math.floor(prev / 500)) {
      this.show(`BENCH RUNNING · ${Math.max(0, elapsed).toFixed(0)} / ${this.seconds} s · do not touch the page`);
    }
  }

  simSample(stepMs: number, steps: number): void {
    if (steps > 0 && this.recording(performance.now())) this.sim.push(stepMs);
  }

  markRestart(now: number): void {
    this.restarts.push(now);
  }

  private report(): string {
    const ft = [...this.frames].sort((a, b) => a - b);
    const n = ft.length;
    const q = (p: number): number => (n ? ft[Math.min(n - 1, Math.floor(n * p))] : 0);
    const sum = ft.reduce((a, b) => a + b, 0);
    const worst = ft.slice(Math.floor(n * 0.99));
    const worstAvg = worst.length ? worst.reduce((a, b) => a + b, 0) / worst.length : 0;
    const near = this.spikes.filter((f) => this.restarts.some((r) => f.at >= r && f.at - r < RESTART_WINDOW_MS)).length;
    const canvas = document.querySelector('canvas');
    return [
      'NADIR POINT BENCH',
      `canvas       ${canvas?.width}x${canvas?.height}`,
      `display      ${screen.width}x${screen.height}, devicePixelRatio ${window.devicePixelRatio}`,
      `duration     ${this.seconds} s, ${n} frames`,
      `avg fps      ${n ? (1000 / (sum / n)).toFixed(1) : '0'}`,
      `frame p50    ${q(0.5).toFixed(2)} ms`,
      `frame p95    ${q(0.95).toFixed(2)} ms`,
      `frame p99    ${q(0.99).toFixed(2)} ms`,
      `worst 1% fps ${worstAvg ? (1000 / worstAvg).toFixed(1) : '0'}`,
      `worst frame  ${n ? ft[n - 1].toFixed(1) : '0'} ms`,
      `over 20 ms   ${this.spikes.length} frames (${near} within 2 s of a battle restart)`,
      `over 33 ms   ${this.spikes.filter((f) => f.dt > 33).length} frames`,
      `over 50 ms   ${this.spikes.filter((f) => f.dt > 50).length} frames`,
      `battles      ${this.restarts.length + 1}`,
      `tab hidden   ${this.hidden} times`,
      `sim avg      ${this.sim.length ? (this.sim.reduce((a, b) => a + b, 0) / this.sim.length).toFixed(3) : '0'} ms/tick`,
      `sim max      ${this.sim.length ? Math.max(...this.sim).toFixed(3) : '0'} ms/tick`,
      `user agent   ${navigator.userAgent}`,
    ].join('\n');
  }

  private show(text: string): void {
    const el = document.getElementById('bench');
    if (!el) return;
    el.hidden = false;
    el.querySelector('pre')!.textContent = text;
  }
}
