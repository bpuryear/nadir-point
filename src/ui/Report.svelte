<script lang="ts">
  import type { Game } from '../game.svelte.ts';
  import { SIM_VERSION } from '../sim/constants.ts';
  import { app, type Screen } from './state.svelte.ts';

  let { game, onGo }: { game: Game; onGo: (s: Screen) => void } = $props();

  const r = $derived(app.report!);
  const won = $derived(r.winner === 0);
  const own = $derived(r.ships.filter((s) => s.side === 0));
  const opfor = $derived(r.ships.filter((s) => s.side === 1));
  const opforLost = $derived(opfor.filter((s) => s.fate === 'crippled' || s.fate === 'destroyed').length);
  const gunnery = $derived(r.weapons.filter((w) => w.side === 0).sort((a, b) => b.shots - a.shots));
  const minsec = (s: number): string => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
  const pct = (v: number): string => `${Math.round(v * 100)}%`;
</script>

<div class="screen solid">
  <article class="paper">
    <div class="dim">
      FROM: CHIEF UMPIRE, FLEET TRAINING COMMAND<br />
      TO: COMMANDING OFFICER, 7TH ESCORT GROUP<br />
      SUBJECT: AFTER-ACTION REPORT, EXERCISE {app.exercise.number} ({app.exercise.title})
    </div>
    <div class="stamp" class:good={won}>{won ? 'FIELD HELD' : r.winner === 1 ? 'FIELD LOST' : 'NO DECISION'}</div>
    <p>
      DURATION {minsec(r.seconds)}. OWN LOSSES {r.lost[0].toLocaleString()} OF {r.deployed[0].toLocaleString()} DEPLOYED.
      OPFOR LOSSES {r.lost[1].toLocaleString()} OF {r.deployed[1].toLocaleString()} ({opforLost} OF {opfor.length} HULLS).
    </p>

    <h2>CAUSES</h2>
    {#if r.causes.length}
      {#each r.causes as c, i (i)}
        <p>{i + 1}. {c.text.toUpperCase()}</p>
      {/each}
    {:else}
      <p>NO SINGLE CAUSE STANDS OUT.</p>
    {/if}

    {#if !won && r.causes.length}
      <p class="note">UMPIRE'S NOTE: ANSWER CAUSE 1 IN THE DESIGN BUREAU, THEN RE-RUN THE SAME SEED. THE SAME SEED REPLAYS THE SAME ENGAGEMENT, SO ANY CHANGE IN THE RESULT IS YOUR CHANGE.</p>
    {/if}

    <h2>OWN UNITS</h2>
    <table class="data">
      <thead><tr><th>Ship</th><th>Fate</th><th class="num">At</th><th class="num">Hull</th><th class="num">Dealt</th><th class="num">Taken</th><th class="num">Crew lost</th><th>Modules lost</th></tr></thead>
      <tbody>
        {#each own as s (s.unit)}
          <tr>
            <td>{app.battle.names[s.unit] ?? s.design}</td>
            <td class:red={s.fate === 'crippled' || s.fate === 'destroyed'}>{s.fate.toUpperCase()}</td>
            <td class="num dim">{s.fateAt >= 0 ? minsec(s.fateAt) : ''}</td>
            <td class="num">{pct(s.structure)}</td>
            <td class="num">{s.dealt.toFixed(0)}</td>
            <td class="num">{s.taken.toFixed(0)}</td>
            <td class="num">{s.crewLost}</td>
            <td class="dim">{s.modulesLost.join(' ')}</td>
          </tr>
        {/each}
      </tbody>
    </table>

    <h2>OWN GUNNERY</h2>
    <table class="data">
      <thead><tr><th>Weapon</th><th>Against</th><th class="num">Shots</th><th class="num">Hit</th><th class="num">Expected</th><th class="num">Through armour</th></tr></thead>
      <tbody>
        {#each gunnery as g, i (i)}
          <tr>
            <td>{g.weapon}</td>
            <td class="dim">{g.targetClass}s</td>
            <td class="num">{g.shots}</td>
            <td class="num" class:red={g.hitRate < 0.35}>{pct(g.hitRate)}</td>
            <td class="num dim">{pct(g.expectedRate)}</td>
            <td class="num" class:red={g.throughRate < 0.4}>{pct(g.throughRate)}</td>
          </tr>
        {/each}
      </tbody>
    </table>

    <p class="dim sig">SIM v{SIM_VERSION} · SEED {app.battle.seed} · STATE {app.lastHash}</p>

    <div class="actions">
      <button class="btn" onclick={() => onGo('designer')}>Refit in design bureau</button>
      <button class="btn" onclick={() => onGo('fleet')}>Adjust fleet</button>
      <button class="btn" onclick={() => game.startBattle(app.battle.seed)}>Re-run, same seed</button>
      <button class="btn primary" onclick={() => game.startBattle(app.battle.seed + 1)}>New engagement</button>
    </div>
  </article>
</div>

<style>
  .note {
    color: var(--amber);
    border-left: 2px solid var(--amber);
    padding-left: 10px;
  }
  .sig {
    margin-top: 18px;
    font-size: 10px;
  }
</style>
