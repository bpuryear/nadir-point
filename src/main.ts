import { mount } from 'svelte';
import { Bench } from './bench.ts';
import { Game } from './game.svelte.ts';
import { Stage } from './render/stage.ts';
import { SimClient } from './sim-client.ts';
import App from './ui/App.svelte';
import { Overlay } from './ui/overlay.ts';

const params = new URLSearchParams(location.search);
const benchSeconds = Math.max(0, Math.min(3600, Math.floor(Number(params.get('bench')) || 0)));

async function boot(): Promise<void> {
  let stage: Stage;
  try {
    stage = await Stage.create({
      container: document.getElementById('stage')!,
      forceWebGL: params.has('webgl'),
      dprCap: Number(params.get('dpr')) || 1.25,
    });
  } catch (err) {
    const fatal = document.getElementById('fatal')!;
    fatal.hidden = false;
    fatal.textContent = `RENDERER FAILED TO START: ${String(err)}`;
    throw err;
  }
  if (params.get('blur') === '0') stage.blur = 0;

  const bench = benchSeconds > 0 ? new Bench(benchSeconds) : null;
  const game = new Game(stage, new SimClient(), new Overlay(), bench);
  mount(App, { target: document.getElementById('app')!, props: { game, stage } });
  // For end-to-end tests: find a ship on screen without guessing pixels.
  (window as unknown as { __nadir: unknown }).__nadir = { game, stage };
  if (bench) game.startBattle(1);
  stage.renderer.setAnimationLoop(() => game.frame(performance.now()));
}

void boot();
