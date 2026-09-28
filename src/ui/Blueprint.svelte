<script lang="ts">
  import { MODULE_BY_ID } from '../content/modules.ts';
  import type { Design, HullDef, MountDef } from '../content/types.ts';

  // Top-down blueprint: bow to the right, port up. Line art after Deck & Conn's schematics.
  let {
    design,
    hull,
    selected,
    onSelect,
  }: { design: Design; hull: HullDef; selected: string | null; onSelect: (id: string) => void } = $props();

  const L = $derived(hull.length);
  const B = $derived(hull.beam);
  const taper = $derived(hull.cls === 'frigate' ? 0.3 : hull.cls === 'destroyer' ? 0.24 : 0.2);
  const outline = $derived(
    [
      [-L / 2, -B / 2],
      [L / 2 - L * taper, -B / 2],
      [L / 2, -B * 0.16],
      [L / 2, B * 0.16],
      [L / 2 - L * taper, B / 2],
      [-L / 2, B / 2],
    ]
      .map(([x, y]) => `${x},${-y}`)
      .join(' '),
  );
  const view = $derived(`${-L * 0.78} ${-L * 0.46} ${L * 1.56} ${L * 0.92}`);
  const unit = $derived(L * 0.045);
  const arcR = $derived(L * 0.42);

  function mountSize(m: MountDef): number {
    return [0, 0.055, 0.075, 0.1][m.size] * L;
  }

  function arcPath(m: MountDef): string {
    const cx = m.x;
    const cy = -m.y;
    if (m.arc >= 180) return `M ${cx - arcR} ${cy} a ${arcR} ${arcR} 0 1 0 ${arcR * 2} 0 a ${arcR} ${arcR} 0 1 0 ${-arcR * 2} 0`;
    const a0 = ((m.facing - m.arc) * Math.PI) / 180;
    const a1 = ((m.facing + m.arc) * Math.PI) / 180;
    const x0 = cx + Math.cos(a0) * arcR;
    const y0 = cy - Math.sin(a0) * arcR;
    const x1 = cx + Math.cos(a1) * arcR;
    const y1 = cy - Math.sin(a1) * arcR;
    const large = m.arc * 2 > 180 ? 1 : 0;
    return `M ${cx} ${cy} L ${x0} ${y0} A ${arcR} ${arcR} 0 ${large} 0 ${x1} ${y1} Z`;
  }

  function moduleOf(m: MountDef) {
    const id = design.modules[m.id];
    return id ? MODULE_BY_ID.get(id) : undefined;
  }
</script>

<svg class="blueprint" viewBox={view} role="img" aria-label="Ship blueprint">
  <defs>
    <pattern id="hatch" width={unit * 0.8} height={unit * 0.8} patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
      <line x1="0" y1="0" x2="0" y2={unit * 0.8} class="hatch" />
    </pattern>
  </defs>

  {#each hull.mounts as m (m.id)}
    {#if m.type === 'hardpoint' && (moduleOf(m) || selected === m.id)}
      <path d={arcPath(m)} class="arc" class:sel={selected === m.id} />
    {/if}
  {/each}

  <polygon points={outline} class="hull" />
  <polygon points={outline} class="hull-hatch" fill="url(#hatch)" />

  <text x={L * 0.62} y={unit * 0.4} class="facing" font-size={unit * 0.75}>BOW {design.armour[0]}</text>
  <text x={-L * 0.62} y={unit * 0.4} class="facing end" font-size={unit * 0.75}>STERN {design.armour[3]}</text>
  <text x="0" y={-B / 2 - unit * 1.4} class="facing mid" font-size={unit * 0.75}>PORT {design.armour[1]}</text>
  <text x="0" y={B / 2 + unit * 2.2} class="facing mid" font-size={unit * 0.75}>STARBOARD {design.armour[2]}</text>

  {#each hull.mounts as m (m.id)}
    {@const s = mountSize(m)}
    {@const mod = moduleOf(m)}
    <g
      class="mount {m.type}"
      class:sel={selected === m.id}
      class:empty={!mod}
      role="button"
      tabindex="0"
      onclick={() => onSelect(m.id)}
      onkeydown={(e) => e.key === 'Enter' && onSelect(m.id)}
    >
      <rect x={m.x - s / 2} y={-m.y - s / 2} width={s} height={s} />
      <text x={m.x} y={-m.y + s / 2 + unit * 1.1} class="code" font-size={unit * 0.62}>{mod ? mod.code : m.id}</text>
    </g>
  {/each}
</svg>

<style>
  .blueprint {
    width: 100%;
    height: 100%;
    display: block;
  }
  .hull {
    fill: #0c0c0b;
    stroke: var(--bone);
    stroke-width: 0.35%;
    vector-effect: non-scaling-stroke;
  }
  .hull-hatch {
    stroke: none;
    opacity: 0.35;
  }
  :global(.hatch) {
    stroke: var(--faint);
    stroke-width: 0.6;
    vector-effect: non-scaling-stroke;
  }
  .arc {
    fill: rgba(217, 130, 43, 0.05);
    stroke: rgba(217, 130, 43, 0.25);
    stroke-width: 1;
    vector-effect: non-scaling-stroke;
  }
  .arc.sel {
    fill: rgba(217, 130, 43, 0.16);
    stroke: var(--amber);
  }
  .facing {
    fill: var(--dim);
    letter-spacing: 0.15em;
  }
  .facing.end {
    text-anchor: end;
  }
  .facing.mid {
    text-anchor: middle;
  }
  .mount {
    cursor: pointer;
  }
  .mount rect {
    fill: #141412;
    stroke: var(--bone);
    stroke-width: 1.2;
    vector-effect: non-scaling-stroke;
  }
  .mount.internal rect {
    stroke: var(--dim);
  }
  .mount.engine rect {
    stroke: var(--dim);
  }
  .mount.empty rect {
    stroke-dasharray: 3 2;
    fill: transparent;
  }
  .mount.sel rect {
    stroke: var(--amber);
    fill: rgba(217, 130, 43, 0.25);
  }
  .mount .code {
    fill: var(--bone);
    text-anchor: middle;
    letter-spacing: 0.08em;
  }
  .mount.empty .code {
    fill: var(--faint);
  }
  .mount:focus {
    outline: none;
  }
</style>
