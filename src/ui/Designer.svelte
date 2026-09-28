<script lang="ts">
  import { HULLS, HULL_BY_ID } from '../content/hulls.ts';
  import { MODULES, MODULE_BY_ID } from '../content/modules.ts';
  import { CRITERIA, FACINGS, SIZE_NAME, type Criterion, type Design } from '../content/types.ts';
  import { compileDesign, validateDesign } from '../sim/design.ts';
  import Blueprint from './Blueprint.svelte';
  import DpsDial from './DpsDial.svelte';
  import { app } from './state.svelte.ts';

  const CRITERION_LABEL: Record<Criterion, string> = {
    cruiser: 'Cruisers',
    destroyer: 'Destroyers',
    frigate: 'Frigates',
    crippled: 'Crippled ships',
    armourBroken: 'Broken armour',
    threat: 'Ships firing on it',
  };

  const design = $derived(app.design(app.editing) ?? app.library[0]);
  const hull = $derived(HULL_BY_ID.get(design.hull)!);
  const errors = $derived(validateDesign(design));
  const stats = $derived(errors.length ? null : compileDesign($state.snapshot(design) as Design));
  let mountId = $state<string | null>(null);
  const mount = $derived(hull.mounts.find((m) => m.id === mountId) ?? null);
  const options = $derived(mount ? MODULES.filter((m) => m.mount === mount.type && m.size <= mount.size) : []);
  const armourTonnes = $derived(design.armour.map((a, f) => a * hull.armourMass[f]));

  function save(): void {
    app.saveLibrary();
  }

  function edit(id: string): void {
    app.editing = id;
    mountId = null;
  }

  function setModule(id: string | null): void {
    if (!mount) return;
    if (id) design.modules[mount.id] = id;
    else delete design.modules[mount.id];
    save();
  }

  function newId(): string {
    return `d-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e4).toString(36)}`;
  }

  function copy(): void {
    const d: Design = { ...structuredClone($state.snapshot(design) as Design), id: newId(), name: `${design.name} (copy)` };
    app.library.push(d);
    save();
    edit(d.id);
  }

  function create(hullId: string): void {
    const h = HULL_BY_ID.get(hullId)!;
    const core = h.mounts.filter((m) => m.type === 'internal').sort((a, b) => b.size - a.size);
    const engines = h.mounts.filter((m) => m.type === 'engine');
    const modules: Record<string, string> = {};
    if (core[0]) modules[core[0].id] = ['', 'reactor-s', 'reactor-m', 'reactor-l'][core[0].size];
    const bridgeMount = core.find((m) => m.size === 1) ?? core[1];
    if (bridgeMount) modules[bridgeMount.id] = 'bridge';
    for (const e of engines) modules[e.id] = ['', 'drive-s', 'drive-m', 'drive-l'][e.size];
    const d: Design = {
      id: newId(),
      name: `${h.name}, new pattern`,
      hull: h.id,
      modules,
      armour: [Math.round(h.armourMax[0] / 2), Math.round(h.armourMax[1] / 2), Math.round(h.armourMax[2] / 2), Math.round(h.armourMax[3] / 2)],
      doctrine: { role: 'line', engage: 'optimal', priority: [], withdrawAt: 0.25 },
    };
    app.library.push(d);
    save();
    edit(d.id);
  }

  function remove(): void {
    if (app.library.length <= 1) return;
    const id = design.id;
    app.library = app.library.filter((d) => d.id !== id);
    delete app.order[id];
    app.saveOrder();
    save();
    edit(app.library[0].id);
  }

  function setPriority(slot: number, value: string): void {
    const list = [...design.doctrine.priority];
    if (value === '') list.splice(slot, 1);
    else list[slot] = value as Criterion;
    design.doctrine.priority = list.filter(Boolean).slice(0, 3);
    save();
  }
</script>

<div class="screen solid designer">
  <aside class="panel library">
    <header>Patterns</header>
    {#each app.library as d (d.id)}
      <button class="item" class:active={d.id === design.id} onclick={() => edit(d.id)}>
        <span>{d.name}</span>
        {#if validateDesign(d).length}<span class="red">!</span>{/if}
      </button>
    {/each}
    <div class="new">
      <div class="k dim caps">New on hull</div>
      {#each HULLS as h (h.id)}
        <button class="btn small" onclick={() => create(h.id)}>{h.name}</button>
      {/each}
    </div>
    <div class="actions">
      <button class="btn small" onclick={copy}>Copy</button>
      <button class="btn small" disabled={app.library.length <= 1} onclick={remove}>Delete</button>
      <button class="btn small" onclick={() => app.resetToIssue()}>Reset all to issue</button>
    </div>
  </aside>

  <section class="panel work">
    <header>
      <input class="name" type="text" bind:value={design.name} onchange={save} />
      <span class="dim">{hull.name.toUpperCase()} · {hull.cls.toUpperCase()}</span>
    </header>
    <div class="print">
      <Blueprint {design} {hull} selected={mountId} onSelect={(id) => (mountId = id)} />
    </div>

    {#if mount}
      <div class="picker">
        <div class="panel-title">
          <span>Mount {mount.id} · {mount.zone} · {mount.type} {SIZE_NAME[mount.size]}{mount.type === 'hardpoint' ? ` · arc ±${mount.arc}°` : ''}</span>
          <button class="btn small" onclick={() => (mountId = null)}>Close</button>
        </div>
        <table class="data">
          <thead>
            <tr><th>Module</th><th class="num">Dmg</th><th class="num">Pen</th><th class="num">Reload</th><th class="num">Range</th><th class="num">Track</th><th class="num">Mass</th><th class="num">MW</th><th class="num">Cost</th><th></th></tr>
          </thead>
          <tbody>
            <tr class:current={!design.modules[mount.id]}>
              <td class="dim">Empty</td><td colspan="8"></td>
              <td><button class="btn small" onclick={() => setModule(null)}>Clear</button></td>
            </tr>
            {#each options as m (m.id)}
              <tr class:current={design.modules[mount.id] === m.id} title={m.blurb}>
                <td>{m.name}</td>
                <td class="num">{m.weapon?.damage ?? ''}</td>
                <td class="num">{m.weapon?.pen ?? ''}</td>
                <td class="num">{m.weapon ? `${m.weapon.reload}s` : ''}</td>
                <td class="num">{m.weapon?.range ?? ''}</td>
                <td class="num">{m.weapon ? `${m.weapon.tracking}°` : ''}</td>
                <td class="num">{m.mass}</td>
                <td class="num">{m.output ? `+${m.output}` : m.draw ? `-${m.draw}` : ''}</td>
                <td class="num">{m.cost}</td>
                <td><button class="btn small" onclick={() => setModule(m.id)}>Fit</button></td>
              </tr>
            {/each}
          </tbody>
        </table>
        {#if design.modules[mount.id]}
          <p class="dim blurb">{MODULE_BY_ID.get(design.modules[mount.id])?.blurb}</p>
        {/if}
      </div>
    {:else}
      <p class="dim hint">SELECT A MOUNT ON THE BLUEPRINT TO FIT IT. BOW MOUNTS FIRE FORWARD AND TAKE BOW HITS; CORE MOUNTS ARE HIT LEAST.</p>
    {/if}
  </section>

  <aside class="side">
    <section class="panel">
      <header>Particulars</header>
      {#if stats}
        <div class="row"><span class="k">Mass</span><span>{stats.mass.toFixed(0)} t</span></div>
        <div class="row"><span class="k">Top speed</span><span>{stats.maxSpeed.toFixed(0)} m/s</span></div>
        <div class="row"><span class="k">Turn</span><span>{stats.turnRate.toFixed(0)}°/s</span></div>
        <div class="row"><span class="k">Power</span><span>{stats.powerDraw} / {stats.powerOut} MW</span></div>
        <div class="bar amber"><span style="width: {Math.min(100, (100 * stats.powerDraw) / Math.max(1, stats.powerOut))}%"></span></div>
        <div class="row"><span class="k">Cost</span><span class="amber">{stats.cost}</span></div>
        <div class="row"><span class="k">Crew</span><span>{stats.crew}</span></div>
        <div class="row"><span class="k">Damage/s</span><span>{stats.totalDps.toFixed(1)}</span></div>
        <div class="row"><span class="k">Tracking</span><span>{stats.trackingMul > 1 ? '×1.25 (fire control)' : '×1.00'}</span></div>
        <div class="row"><span class="k">Engages at</span><span>{stats.engageRange.toFixed(0)} m</span></div>
        <div class="dial-row">
          <DpsDial dps={stats.dpsByBearing} bearing={stats.bearingDeg} />
          <div class="dim small">FIRE BY BEARING. AMBER: THE BEARING THIS SHIP WILL HOLD ({stats.bearingDeg}°).</div>
        </div>
      {:else}
        {#each errors as e, i (i)}
          <p class="red">{e}</p>
        {/each}
      {/if}
    </section>

    <section class="panel">
      <header>Armour plate</header>
      {#each FACINGS as f, i (f)}
        <div class="row"><span class="k">{f}</span><span>{design.armour[i]} / {hull.armourMax[i]} · {armourTonnes[i].toFixed(0)} t</span></div>
        <input type="range" min="0" max={hull.armourMax[i]} step="1" bind:value={design.armour[i]} onchange={save} />
      {/each}
    </section>

    <section class="panel">
      <header>Doctrine</header>
      <div class="row">
        <span class="k">Role</span>
        <span>
          <button class="btn small" class:on={design.doctrine.role === 'line'} onclick={() => ((design.doctrine.role = 'line'), save())}>Line</button>
          <button class="btn small" class:on={design.doctrine.role === 'strike'} onclick={() => ((design.doctrine.role = 'strike'), save())}>Strike</button>
        </span>
      </div>
      <div class="row">
        <span class="k">Engage</span>
        <span>
          {#each ['short', 'optimal', 'long'] as const as e (e)}
            <button class="btn small" class:on={design.doctrine.engage === e} onclick={() => ((design.doctrine.engage = e), save())}>{e}</button>
          {/each}
        </span>
      </div>
      {#each [0, 1, 2] as slot (slot)}
        <div class="row">
          <span class="k">Priority {slot + 1}</span>
          <select value={design.doctrine.priority[slot] ?? ''} onchange={(e) => setPriority(slot, (e.currentTarget as HTMLSelectElement).value)} disabled={slot > design.doctrine.priority.length}>
            <option value="">— nearest —</option>
            {#each CRITERIA as c (c)}
              <option value={c}>{CRITERION_LABEL[c]}</option>
            {/each}
          </select>
        </div>
      {/each}
      <div class="row"><span class="k">Withdraw below</span><span>{design.doctrine.withdrawAt > 0 ? `${Math.round(design.doctrine.withdrawAt * 100)}% hull` : 'never'}</span></div>
      <input type="range" min="0" max="0.9" step="0.05" bind:value={design.doctrine.withdrawAt} onchange={save} />
    </section>
  </aside>
</div>

<style>
  .designer {
    display: grid;
    grid-template-columns: 230px minmax(0, 1fr) 330px;
    gap: 12px;
    align-items: start;
  }
  .library {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .item {
    background: transparent;
    border: 1px solid transparent;
    text-align: left;
    padding: 4px 6px;
    cursor: pointer;
    display: flex;
    justify-content: space-between;
    color: var(--bone);
  }
  .item:hover {
    border-color: var(--line-bright);
  }
  .item.active {
    border-color: var(--amber);
    color: var(--amber);
  }
  .new {
    margin-top: 12px;
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    align-items: center;
  }
  .new .k {
    width: 100%;
    font-size: 10px;
  }
  .library .actions {
    margin-top: 12px;
    gap: 4px;
  }
  .work header {
    align-items: center;
  }
  .name {
    min-width: 280px;
    color: var(--amber);
  }
  .print {
    height: 44vh;
    min-height: 280px;
    border: 1px solid var(--line);
    background: #070706;
  }
  .picker {
    margin-top: 12px;
  }
  .picker tr.current td {
    color: var(--amber);
  }
  .hint,
  .blurb {
    margin-top: 12px;
  }
  .side {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .side input[type='range'] {
    margin: 2px 0 8px;
  }
  .side .row {
    align-items: center;
    margin-bottom: 4px;
  }
  .dial-row {
    display: flex;
    gap: 10px;
    align-items: center;
    margin-top: 8px;
  }
  .small {
    font-size: 10px;
  }
</style>
