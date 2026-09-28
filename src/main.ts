import { Hud } from './hud.ts';
import { Stage } from './render/stage.ts';
import { TEST_MAP_H, TEST_MAP_W } from './sim/scenario.ts';
import { SimClient } from './sim-client.ts';

const params = new URLSearchParams(location.search);
const perSide = clampInt(params.get('n'), 250, 10, 2000);
const benchSeconds = clampInt(params.get('bench'), 0, 0, 3600);
const WARMUP_S = 5;
const RESTART_DELAY_MS = 5000;
const SPEEDS = [0.25, 0.5, 1, 2, 4, 8];

async function boot(): Promise<void> {
  const container = document.getElementById('stage')!;
  const hud = new Hud(document.body);

  let stage: Stage;
  try {
    stage = await Stage.create({
      container,
      mapW: TEST_MAP_W,
      mapH: TEST_MAP_H,
      capacity: perSide * 2,
      forceWebGL: params.has('webgl'),
      dprCap: Number(params.get('dpr')) || 1.25,
    });
  } catch (err) {
    document.getElementById('fatal')!.hidden = false;
    document.getElementById('fatal')!.textContent = `RENDERER FAILED TO START: ${String(err)}`;
    throw err;
  }
  if (params.get('blur') === '0') stage.blur = 0;

  const sim = new SimClient();
  let seed = clampInt(params.get('seed'), 1, 0, 2 ** 31 - 1);
  let restartAt = 0;
  sim.start(seed, perSide);

  const benchStart = performance.now();
  let benchDone = false;
  const recording = (): boolean => {
    if (!benchSeconds || benchDone) return false;
    const s = (performance.now() - benchStart) / 1000;
    return s > WARMUP_S && s < WARMUP_S + benchSeconds;
  };

  sim.onSnapshot = (snap) => {
    hud.simSample(snap, recording());
    if (snap.meta.ended && restartAt === 0) restartAt = performance.now() + RESTART_DELAY_MS;
  };

  const info = () => ({
    backend: stage.backend,
    pixelRatio: stage.pixelRatio,
    canvasW: stage.renderer.domElement.width,
    canvasH: stage.renderer.domElement.height,
    speed: sim.speed,
    paused: sim.paused,
    blur: stage.blur,
  });

  window.addEventListener('keydown', (e) => {
    if (e.key === ' ') {
      e.preventDefault();
      sim.setPaused(!sim.paused);
    } else if (e.key >= '1' && e.key <= '6') {
      sim.setSpeed(SPEEDS[Number(e.key) - 1]);
    } else if (e.key === 'r' || e.key === 'R') {
      seed++;
      restartAt = 0;
      hud.markRestart(performance.now());
      sim.start(seed, perSide);
    } else if (e.key === 'b' || e.key === 'B') {
      stage.blur = stage.blur > 0 ? 0 : 1;
    } else if (e.key === 'h' || e.key === 'H') {
      hud.toggle();
    }
  });

  let lastHud = 0;
  stage.renderer.setAnimationLoop(() => {
    const now = performance.now();
    const snap = sim.latest;
    if (snap) {
      const alpha = sim.alpha(now);
      stage.fleet.update(snap.data, snap.meta.count, alpha);
      stage.tracers.update(snap.data, snap.meta.count);
    }
    stage.render();
    hud.frame(now, recording());

    if (restartAt && now >= restartAt) {
      restartAt = 0;
      seed++;
      hud.markRestart(now);
      sim.start(seed, perSide);
    }
    if (now - lastHud > 250) {
      lastHud = now;
      hud.update(sim.latest, info());
      if (benchSeconds && !benchDone) {
        const elapsed = (now - benchStart) / 1000 - WARMUP_S;
        if (elapsed >= benchSeconds) {
          benchDone = true;
          hud.showBench(hud.benchResult(benchSeconds), info());
        } else {
          hud.showBenchProgress(Math.max(0, elapsed), benchSeconds);
        }
      }
    }
  });
}

function clampInt(raw: string | null, fallback: number, lo: number, hi: number): number {
  const n = raw === null ? NaN : Math.floor(Number(raw));
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : fallback;
}

void boot();
