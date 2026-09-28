<script lang="ts">
  import type { Game } from '../game.svelte.ts';
  import { compileDesign } from '../sim/design.ts';
  import { app, type Screen } from './state.svelte.ts';

  let { game, onGo }: { game: Game; onGo: (s: Screen) => void } = $props();

  const ex = $derived(app.exercise);
  const issuedCost = $derived(ex.issued.reduce((s, o) => s + compileDesign(o.design).cost * o.count, 0));
  const canStart = $derived(game.fleetOrders().length > 0);
</script>

<div class="screen solid">
  <article class="paper">
    <div class="dim">
      FROM: FLEET TRAINING COMMAND, NADIR STATION<br />
      TO: COMMANDING OFFICER, 7TH ESCORT GROUP<br />
      CLASSIFICATION: RESTRICTED
    </div>
    <h1>EXERCISE {ex.number}: {ex.title}</h1>
    {#each ex.briefing as line, i (i)}
      <p>{line}</p>
    {/each}

    <h2>ISSUED PATTERNS</h2>
    <table class="data">
      <thead><tr><th>Pattern</th><th class="num">Count</th><th class="num">Cost each</th></tr></thead>
      <tbody>
        {#each ex.issued as o (o.design.id)}
          <tr><td>{o.design.name}</td><td class="num">{o.count}</td><td class="num">{compileDesign(o.design).cost}</td></tr>
        {/each}
      </tbody>
    </table>
    <p class="dim">ISSUED FLEET VALUE {issuedCost.toLocaleString()} OF {ex.budget.toLocaleString()} ALLOCATED.</p>

    <h2>OPPOSING FORCE</h2>
    <table class="data">
      <thead><tr><th>Pattern</th><th class="num">Count</th><th>Doctrine</th></tr></thead>
      <tbody>
        {#each ex.enemy as o (o.design.id)}
          <tr><td>{o.design.name}</td><td class="num">{o.count}</td><td>{o.design.doctrine.role.toUpperCase()}, {o.design.doctrine.engage.toUpperCase()} RANGE</td></tr>
        {/each}
      </tbody>
    </table>

    <h2>PROCEDURE</h2>
    <p>1. REVIEW OR REFIT THE PATTERNS IN THE DESIGN BUREAU.</p>
    <p>2. SET THE FLEET WITHIN ALLOCATION.</p>
    <p>3. COMMENCE. YOU DO NOT COMMAND INDIVIDUAL SHIPS ONCE THE ENGAGEMENT BEGINS. SELECT A SHIP TO READ ITS STATE AND ITS REASONS.</p>

    <div class="actions">
      <button class="btn" onclick={() => onGo('designer')}>Design bureau</button>
      <button class="btn" onclick={() => onGo('fleet')}>Fleet</button>
      <button class="btn primary" disabled={!canStart} onclick={() => game.startBattle(app.battle.seed)}>Commence engagement</button>
    </div>
  </article>
</div>
