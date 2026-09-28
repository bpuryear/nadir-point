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
}

const WINNER = ['SIDE A HOLDS THE FIELD', 'SIDE B HOLDS THE FIELD', '', 'NEITHER SIDE HOLDS THE FIELD'];

export class Hud {
  private readonly stats: HTMLElement;
  private readonly banner: HTMLElement;
  private readonly benchEl: HTMLElement;
  private frameTimes: number[] = [];
  private lastFrame = 0;
  private simSamples: number[] = [];
  private fpsWindow: number[] = [];

  constructor(root: HTMLElement) {
    this.stats = root.querySelector<HTMLElement>('#stats')!;
    this.banner = root.querySelector<HTMLElement>('#banner')!;
    this.benchEl = root.querySelector<HTMLElement>('#bench')!;
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
      if (recording) this.frameTimes.push(dt);
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
    };
  }

  showBench(r: BenchResult, info: HudInfo): void {
    const lines = [
      `NADIR POINT M0 BENCH`,
      `backend      ${info.backend}`,
      `canvas       ${info.canvasW}x${info.canvasH} @ DPR ${info.pixelRatio.toFixed(2)}`,
      `duration     ${r.seconds.toFixed(0)} s, ${r.frames} frames`,
      `avg fps      ${r.avgFps.toFixed(1)}`,
      `frame p50    ${r.p50.toFixed(2)} ms`,
      `frame p95    ${r.p95.toFixed(2)} ms`,
      `frame p99    ${r.p99.toFixed(2)} ms`,
      `worst 1% fps ${r.worstFps1.toFixed(1)}`,
      `sim avg      ${r.simAvg.toFixed(3)} ms/tick`,
      `sim max      ${r.simMax.toFixed(3)} ms/tick`,
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
