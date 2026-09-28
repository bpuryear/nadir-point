<script lang="ts">
  import { FACINGS } from '../content/types.ts';
  import { ACTIVE, CRIPPLED, DESTROYED, ESCAPED, WITHDRAWING } from '../sim/world.ts';
  import type { InspectDetail } from '../worker/protocol.ts';

  let { detail, names, onClose }: { detail: InspectDetail; names: string[]; onClose: () => void } = $props();

  const STATUS: Record<number, string> = {
    [ACTIVE]: 'In action',
    [WITHDRAWING]: 'Withdrawing',
    [CRIPPLED]: 'Crippled',
    [DESTROYED]: 'Destroyed',
    [ESCAPED]: 'Escaped',
  };

  const pct = (v: number): string => `${Math.round(Math.max(0, v) * 100)}%`;
</script>

<section class="panel inspector">
  <header>
    <span>{names[detail.unit] ?? `Unit ${detail.unit}`}</span>
    <button class="btn small" onclick={onClose}>Close</button>
  </header>
  <div class="row"><span class="k">Status</span><span class:red={detail.status >= CRIPPLED}>{STATUS[detail.status]}</span></div>
  <div class="row"><span class="k">Structure</span><span>{Math.max(0, detail.structure).toFixed(0)} / {detail.structureMax}</span></div>
  <div class="bar" class:red={detail.structure < detail.structureMax * 0.3}><span style="width: {pct(detail.structure / detail.structureMax)}"></span></div>
  <div class="row"><span class="k">Speed</span><span>{detail.speed.toFixed(0)} / {detail.maxSpeed.toFixed(0)} m/s</span></div>

  <div class="panel-title">Armour</div>
  {#each FACINGS as f, i (f)}
    <div class="row armour">
      <span class="k">{f}</span>
      <span>{detail.armour[i].toFixed(0)} / {detail.armourPlan[i]}</span>
    </div>
    <div class="bar" class:red={detail.armourPlan[i] > 0 && detail.armour[i] <= 0}><span style="width: {detail.armourPlan[i] ? pct(detail.armour[i] / detail.armourPlan[i]) : '0%'}"></span></div>
  {/each}

  <div class="panel-title">Target</div>
  <p class="reason">{detail.target >= 0 ? `${names[detail.target] ?? detail.target}. ` : ''}{detail.reason}</p>

  <div class="panel-title">Weapons</div>
  <table class="data">
    <thead><tr><th>Gun</th><th>Mount</th><th>Target</th><th class="num">Hit</th><th class="num">Reload</th></tr></thead>
    <tbody>
      {#each detail.weapons as w, i (i)}
        <tr>
          <td><span class="led" class:off={w.hp <= 0} class:hurt={w.hp > 0 && w.hp < 0.5}></span>{w.code}</td>
          <td class="dim">{w.mount}</td>
          <td>{w.hp <= 0 ? 'lost' : w.target >= 0 ? (w.inArc ? (names[w.target] ?? w.target) : 'out of arc') : '—'}</td>
          <td class="num">{w.inArc && w.hp > 0 ? pct(w.hitChance) : ''}</td>
          <td class="num dim">{w.hp > 0 && w.reload > 0 ? `${w.reload.toFixed(1)}s` : ''}</td>
        </tr>
      {/each}
    </tbody>
  </table>

  <div class="panel-title">Modules</div>
  <div class="modules">
    {#each detail.modules as m, i (i)}
      <span class="mod"><span class="led" class:off={m.hp <= 0} class:hurt={m.hp > 0 && m.hp < 0.5}></span>{m.code} <span class="dim">{m.mount}</span></span>
    {/each}
  </div>
  <div class="row"><span class="k">Damage control</span><span>{detail.dcSupply > 0 ? `${detail.dcSupply.toFixed(0)} supplies` : 'none'}</span></div>
  <div class="row"><span class="k">Crew lost</span><span>{detail.crewLost}</span></div>
</section>

<style>
  .inspector {
    width: 340px;
    max-height: calc(100vh - 60px);
    overflow: auto;
  }
  .panel-title {
    margin-top: 12px;
  }
  .armour {
    margin-top: 2px;
  }
  .reason {
    margin: 0;
  }
  .modules {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 2px 10px;
    margin-bottom: 8px;
  }
</style>
