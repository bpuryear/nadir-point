<script lang="ts">
  import { HULL_BY_ID } from '../content/hulls.ts';
  import type { Design } from '../content/types.ts';
  import type { Game } from '../game.svelte.ts';
  import { compileDesign, validateDesign } from '../sim/design.ts';
  import { app } from './state.svelte.ts';

  let { game }: { game: Game } = $props();

  interface Line {
    design: Design;
    valid: boolean;
    cost: number;
    count: number;
  }

  const lines = $derived<Line[]>(
    app.library.map((d) => {
      const valid = validateDesign(d).length === 0;
      return { design: d, valid, cost: valid ? compileDesign($state.snapshot(d) as Design).cost : 0, count: app.order[d.id] ?? 0 };
    }),
  );
  const total = $derived(lines.reduce((s, l) => s + (l.valid ? l.cost * l.count : 0), 0));
  const ships = $derived(lines.reduce((s, l) => s + (l.valid ? l.count : 0), 0));
  const over = $derived(total > app.exercise.budget);
  const invalidOrdered = $derived(lines.filter((l) => !l.valid && l.count > 0));

  function setCount(id: string, n: number): void {
    app.order[id] = Math.max(0, Math.min(40, n));
    app.saveOrder();
    game.showPreview();
  }
</script>

<div class="screen fleet">
  <section class="panel">
    <header>
      <span>Fleet · exercise {app.exercise.number}</span>
      <span class:red={over}>{total.toLocaleString()} / {app.exercise.budget.toLocaleString()}</span>
    </header>
    <div class="bar" class:red={over} class:amber={!over}><span style="width: {Math.min(100, (100 * total) / app.exercise.budget)}%"></span></div>

    <table class="data">
      <thead><tr><th>Pattern</th><th>Hull</th><th class="num">Cost</th><th class="num">Count</th><th class="num">Subtotal</th></tr></thead>
      <tbody>
        {#each lines as l (l.design.id)}
          <tr class:dimrow={!l.valid}>
            <td>{l.design.name}{#if !l.valid}<span class="red"> · invalid</span>{/if}</td>
            <td class="dim">{HULL_BY_ID.get(l.design.hull)?.name ?? '?'}</td>
            <td class="num">{l.valid ? l.cost : '—'}</td>
            <td class="num count">
              <button class="btn small" onclick={() => setCount(l.design.id, l.count - 1)} disabled={l.count <= 0}>−</button>
              <span>{l.count}</span>
              <button class="btn small" onclick={() => setCount(l.design.id, l.count + 1)} disabled={!l.valid}>+</button>
            </td>
            <td class="num">{l.valid ? (l.cost * l.count).toLocaleString() : '—'}</td>
          </tr>
        {/each}
      </tbody>
    </table>

    {#if over}<p class="red">OVER ALLOCATION BY {(total - app.exercise.budget).toLocaleString()}. FLEET TRAINING COMMAND WILL NOT SIGN FOR IT.</p>{/if}
    {#if invalidOrdered.length}<p class="red">INVALID PATTERNS ARE LEFT IN PORT: {invalidOrdered.map((l) => l.design.name).join(', ')}.</p>{/if}
    {#if ships === 0}<p class="red">NO SHIPS ASSIGNED.</p>{/if}
    <p class="dim">SHIPS DEPLOY AUTOMATICALLY IN THE WESTERN ZONE, HEAVY HULLS TO THE REAR. THE MAP BEHIND SHOWS THE DEPLOYMENT.</p>

    <div class="actions">
      <button class="btn" onclick={() => (app.screen = 'designer')}>Design bureau</button>
      <button class="btn primary" disabled={over || ships === 0} onclick={() => game.startBattle(app.battle.seed)}>Commence engagement</button>
    </div>
  </section>
</div>

<style>
  .fleet {
    pointer-events: none;
  }
  .fleet .panel {
    pointer-events: auto;
    width: 560px;
  }
  .bar {
    margin-bottom: 10px;
  }
  .count {
    white-space: nowrap;
  }
  .count span {
    display: inline-block;
    min-width: 2.2em;
    text-align: center;
  }
  .dimrow td {
    color: var(--faint);
  }
</style>
