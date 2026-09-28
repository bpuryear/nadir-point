<script lang="ts">
  import type { Game } from '../game.svelte.ts';
  import type { Stage } from '../render/stage.ts';
  import BattleHud from './BattleHud.svelte';
  import Briefing from './Briefing.svelte';
  import Designer from './Designer.svelte';
  import Fleet from './Fleet.svelte';
  import Report from './Report.svelte';
  import { app, type Screen } from './state.svelte.ts';

  let { game, stage }: { game: Game; stage: Stage } = $props();

  const SPEEDS = [0.25, 0.5, 1, 2, 4, 8];

  const tabs: { id: Screen; label: string }[] = [
    { id: 'briefing', label: 'Directive' },
    { id: 'designer', label: 'Design bureau' },
    { id: 'fleet', label: 'Fleet' },
    { id: 'battle', label: 'Engagement' },
    { id: 'report', label: 'Report' },
  ];

  function go(id: Screen): void {
    app.screen = id;
    if (id === 'fleet') game.showPreview();
  }

  function enabled(id: Screen): boolean {
    if (id === 'battle') return app.battle.active;
    if (id === 'report') return app.report !== null;
    return true;
  }

  function onKey(e: KeyboardEvent): void {
    if (app.screen !== 'battle') return;
    const el = e.target as HTMLElement;
    if (el.tagName === 'INPUT' || el.tagName === 'SELECT') return;
    if (e.key === ' ') {
      e.preventDefault();
      game.togglePause();
    } else if (e.key >= '1' && e.key <= '6') {
      game.setSpeed(SPEEDS[Number(e.key) - 1]);
    } else if (e.key === 'Escape') {
      game.select(-1);
    } else if (e.key === 'f' || e.key === 'F') {
      game.setFollow(!app.battle.follow);
    } else if (e.key === 'b' || e.key === 'B') {
      stage.blur = stage.blur > 0 ? 0 : 1;
    }
  }
</script>

<svelte:window onkeydown={onKey} />

<div class="ui">
  <nav class="topbar">
    <div class="brand">NADIR POINT</div>
    {#each tabs as t (t.id)}
      <button class="tab" class:active={app.screen === t.id} disabled={!enabled(t.id)} onclick={() => go(t.id)}>{t.label}</button>
    {/each}
    <div class="spacer"></div>
    <div class="meta">EXERCISE {app.exercise.number} · {app.exercise.title} · {stage.backend}</div>
  </nav>

  {#if app.screen === 'briefing'}
    <Briefing {game} onGo={go} />
  {:else if app.screen === 'designer'}
    <Designer />
  {:else if app.screen === 'fleet'}
    <Fleet {game} />
  {:else if app.screen === 'battle'}
    <BattleHud {game} />
  {:else if app.screen === 'report'}
    <Report {game} onGo={go} />
  {/if}
</div>
