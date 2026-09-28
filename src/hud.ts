import { TICK_HZ } from './sim/constants.ts';
import type { Snapshot } from './sim-client.ts';

// Plain DOM overlay. Near-opaque black panels, 1 px borders, small monospace.

export interface HudInfo {
  backend: string;
  pixelRatio: number;
  canvasW: number;
  canvasH: number;
  speed: number;
  paused: boolean;
  blur: number;
}

export interface BenchResult {
  seconds: number;
  frames: number;
  avgFps: number;
  p50: number;
  p95: number;
  p99: number;
  worstFps1: number;
  simAvg: number;
  simMax: number;
  worstFrame: number;
  over20: number;
  over33: number;
  over50: number;
  /** Frames over 20 ms that started within 2 s after a battle restart. */
  over20NearRestart: number;
  battles: number;
  hidden: number;
  simOver2: number;
}

const SPIKE_MS = 20;
const RESTART_WINDOW_MS = 2000;

const WINNER = ['SIDE A HOLDS THE FIELD', 'SIDE B HOLDS THE FIELD', '', 'NEITHER SIDE HOLDS THE FIELD'];

export class Hud {
  private readonly stats: HTMLElement;
  private readonly banner: HTMLElement;
  private readonly benchEl: HTMLElement;
  private frameTimes: number[] = [];
  private lastFrame = 0;
  private simSamples: number[] = [];
  private fpsWindow: number[] = [];
  private spikes: { at: number; dt: number }[] = [];
  private restarts: number[] = [];
  private hiddenCount = 0;

  constructor(root: HTMLElement) {
    this.stats = root.querySelector<HTMLElement>('#stats')!;
    this.banner = root.querySelector<HTMLElement>('#banner')!;
    this.benchEl = root.querySelector<HTMLElement>('#bench')!;
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.hiddenCount++;
    });
  }

  markRestart(now: number): void {
    this.restarts.push(now);
  }

  toggle(): void {
    document.body.classList.toggle('hud-hidden');
  }

  /** Call once per rendered frame. */
  frame(now: number, recording: boolean): void {
    if (this.lastFrame > 0) {
      const dt = now - this.lastFrame;
      this.fpsWindow.push(dt);
      if (this.fpsWindow.length > 90) this.fpsWindow.shift();
      if (recording) {
        this.frameTimes.push(dt);
        if (dt > SPIKE_MS) this.spikes.push({ at: this.lastFrame, dt });
      }
    }
    this.lastFrame = now;
  }

  simSample(snap: Snapshot, recording: boolean): void {
    if (snap.meta.steps > 0 && recording) this.simSamples.push(snap.meta.stepMs);
  }

  update(snap: Snapshot | null, info: HudInfo): void {
    const w = this.fpsWindow;
    const avg = w.length ? w.reduce((a, b) => a + b, 0) / w.length : 0;
    const sorted = [...w].sort((a, b) => a - b);
    const p95 = sorted.length ? sorted[Math.floor(sorted.length * 0.95)] : 0;
    const m = snap?.meta;
    const t = m ? m.tick / TICK_HZ : 0;
    const rows: [string, string][] = [
      ['BACKEND', `${info.backend} · DPR ${info.pixelRatio.toFixed(2)} · ${info.canvasW}×${info.canvasH}`],
      ['FRAME', avg ? `${(1000 / avg).toFixed(0)} FPS · p95 ${p95.toFixed(1)} ms` : '—'],
      ['SIM', m ? `${m.stepMs.toFixed(2)} ms/tick` : '—'],
      ['CLOCK', `${fmtTime(t)} · T${m?.tick ?? 0} · ${info.paused ? 'PAUSED' : `${info.speed}×`}`],
      ['SIDE A', m ? String(m.alive[0]) : '—'],
      ['SIDE B', m ? String(m.alive[1]) : '—'],
      ['SEED', m ? String(m.seed) : '—'],
      ['BLUR', info.blur > 0 ? 'ON' : 'OFF'],
    ];
    this.stats.innerHTML = rows.map(([k, v]) => `<div class="row"><span class="k">${k}</span><span class="v">${v}</span></div>`).join('');

    if (m?.ended) {
      this.banner.hidden = false;
      this.banner.innerHTML = `ENGAGEMENT CONCLUDED · ${WINNER[m.winner] ?? ''}<br><span class="dim">T${m.tick} · HASH ${m.hash ?? '…'}</span>`;
    } else {
      this.banner.hidden = true;
    }
  }

  benchResult(seconds: number): BenchResult {
    const ft = [...this.frameTimes].sort((a, b) => a - b);
    const n = ft.length;
    const q = (p: number): number => (n ? ft[Math.min(n - 1, Math.floor(n * p))] : 0);
    const sum = ft.reduce((a, b) => a + b, 0);
    const worst = ft.slice(Math.floor(n * 0.99));
    const worstAvg = worst.length ? worst.reduce((a, b) => a + b, 0) / worst.length : 0;
    const sim = this.simSamples;
    return {
      seconds,
      frames: n,
      avgFps: n ? 1000 / (sum / n) : 0,
      p50: q(0.5),
      p95: q(0.95),
      p99: q(0.99),
      worstFps1: worstAvg ? 1000 / worstAvg : 0,
      simAvg: sim.length ? sim.reduce((a, b) => a + b, 0) / sim.length : 0,
      simMax: sim.length ? Math.max(...sim) : 0,
      worstFrame: n ? ft[n - 1] : 0,
      over20: this.spikes.length,
      over33: this.spikes.filter((f) => f.dt > 33).length,
      over50: this.spikes.filter((f) => f.dt > 50).length,
      over20NearRestart: this.spikes.filter((f) => this.restarts.some((r) => f.at >= r && f.at - r < RESTART_WINDOW_MS)).length,
      battles: this.restarts.length + 1,
      hidden: this.hiddenCount,
      simOver2: sim.filter((v) => v > 2).length,
    };
  }

  showBench(r: BenchResult, info: HudInfo): void {
    const lines = [
      `NADIR POINT M0 BENCH`,
      `backend      ${info.backend}`,
      `canvas       ${info.canvasW}x${info.canvasH} @ DPR ${info.pixelRatio.toFixed(2)}`,
      `display      ${screen.width}x${screen.height}, devicePixelRatio ${window.devicePixelRatio}`,
      `duration     ${r.seconds.toFixed(0)} s, ${r.frames} frames`,
      `avg fps      ${r.avgFps.toFixed(1)}`,
      `frame p50    ${r.p50.toFixed(2)} ms`,
      `frame p95    ${r.p95.toFixed(2)} ms`,
      `frame p99    ${r.p99.toFixed(2)} ms`,
      `worst 1% fps ${r.worstFps1.toFixed(1)}`,
      `worst frame  ${r.worstFrame.toFixed(1)} ms`,
      `over 20 ms   ${r.over20} frames (${r.over20NearRestart} within 2 s of a battle restart)`,
      `over 33 ms   ${r.over33} frames`,
      `over 50 ms   ${r.over50} frames`,
      `battles      ${r.battles}`,
      `tab hidden   ${r.hidden} times`,
      `sim avg      ${r.simAvg.toFixed(3)} ms/tick`,
      `sim max      ${r.simMax.toFixed(3)} ms/tick`,
      `sim > 2 ms   ${r.simOver2} batches`,
      `user agent   ${navigator.userAgent}`,
    ];
    this.benchEl.hidden = false;
    this.benchEl.querySelector('pre')!.textContent = lines.join('\n');
  }

  showBenchProgress(elapsed: number, total: number): void {
    this.benchEl.hidden = false;
    this.benchEl.querySelector('pre')!.textContent = `BENCH RUNNING · ${elapsed.toFixed(0)} / ${total} s · do not touch the page`;
  }
}

function fmtTime(s: number): string {
  const m = Math.floor(s / 60);
  const r = Math.floor(s % 60);
  return `${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`;
}
