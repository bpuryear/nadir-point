<script lang="ts">
  import type { Game } from '../game.svelte.ts';
  import { TICK_HZ } from '../sim/constants.ts';
  import Inspector from './Inspector.svelte';
  import { app } from './state.svelte.ts';

  let { game }: { game: Game } = $props();

  const SPEEDS = [0.25, 0.5, 1, 2, 4, 8];
  const b = $derived(app.battle);
  const clock = $derived.by(() => {
    const s = Math.floor(b.tick / TICK_HZ);
    return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
  });
  const result = $derived(b.winner === 0 ? 'YOU HOLD THE FIELD' : b.winner === 1 ? 'OPFOR HOLDS THE FIELD' : 'NEITHER SIDE HOLDS THE FIELD');
</script>

<div class="hud-top panel">
  <span class="amber">{clock}</span>
  <span class="dim">·</span>
  <span>OWN {b.onField[0]}</span>
  <span class="dim">·</span>
  <span>OPFOR {b.onField[1]}</span>
  <span class="dim">·</span>
  <span class="dim">SEED {b.seed}</span>
</div>

{#if b.ended}
  <div class="hud-banner panel">ENGAGEMENT CONCLUDED · {result}<br /><span class="dim">REPORT FOLLOWS</span></div>
{/if}

<div class="hud-controls panel">
  <button class="btn small" class:on={b.paused} onclick={() => game.togglePause()}>{b.paused ? 'Resume' : 'Pause'}</button>
  {#each SPEEDS as s, i (s)}
    <button class="btn small" class:on={b.speed === s} onclick={() => game.setSpeed(s)} title="Key {i + 1}">{s}×</button>
  {/each}
  <button class="btn small" class:on={b.follow} onclick={() => game.setFollow(!b.follow)} title="Key F">Follow</button>
  <button class="btn small" disabled={b.ended} onclick={() => game.skip()}>Skip to result</button>
</div>

{#if b.selected >= 0 && b.inspect}
  <div class="hud-inspector">
    <Inspector detail={b.inspect} names={b.names} onClose={() => game.select(-1)} />
  </div>
{:else if !b.ended}
  <div class="hud-hint dim">SELECT A SHIP TO READ ITS STATE AND ITS REASONS · SPACE PAUSE · 1–6 SPEED · F FOLLOW · B BLUR</div>
{/if}

<style>
  .hud-top {
    position: fixed;
    top: 48px;
    left: 50%;
    transform: translateX(-50%);
    display: flex;
    gap: 10px;
    letter-spacing: 0.16em;
  }
  .hud-banner {
    position: fixed;
    top: 96px;
    left: 50%;
    transform: translateX(-50%);
    text-align: center;
    letter-spacing: 0.22em;
  }
  .hud-controls {
    position: fixed;
    bottom: 14px;
    left: 50%;
    transform: translateX(-50%);
    display: flex;
    gap: 4px;
  }
  .hud-inspector {
    position: fixed;
    top: 48px;
    right: 12px;
  }
  .hud-hint {
    position: fixed;
    bottom: 58px;
    left: 50%;
    transform: translateX(-50%);
    font-size: 10px;
    letter-spacing: 0.16em;
    white-space: nowrap;
    pointer-events: none;
  }
</style>
