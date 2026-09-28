<script lang="ts">
  // Damage per second that bears at each 30° bearing. Bow to the right, port up,
  // to match the blueprint. The amber tick is the ship's firing bearing.
  let { dps, bearing }: { dps: number[]; bearing: number } = $props();

  const R = 52;
  const max = $derived(Math.max(1, ...dps));
  const points = $derived(
    dps
      .map((v, k) => {
        const a = (k * 30 * Math.PI) / 180;
        const r = (R * v) / max;
        return `${Math.cos(a) * r},${-Math.sin(a) * r}`;
      })
      .join(' '),
  );
  const tick = $derived.by(() => {
    const a = (bearing * Math.PI) / 180;
    return { x: Math.cos(a) * (R + 6), y: -Math.sin(a) * (R + 6) };
  });
</script>

<svg viewBox="-64 -64 128 128" class="dial" role="img" aria-label="Damage per second by bearing">
  <circle r={R} class="ring" />
  <circle r={R / 2} class="ring" />
  {#each [0, 30, 60, 90, 120, 150] as a (a)}
    <line
      x1={Math.cos((a * Math.PI) / 180) * R}
      y1={-Math.sin((a * Math.PI) / 180) * R}
      x2={-Math.cos((a * Math.PI) / 180) * R}
      y2={Math.sin((a * Math.PI) / 180) * R}
      class="spoke"
    />
  {/each}
  <polygon {points} class="shape" />
  <polygon points="9,0 -6,-4 -6,4" class="ship" />
  <line x1="0" y1="0" x2={tick.x} y2={tick.y} class="bearing" />
</svg>

<style>
  .dial {
    width: 128px;
    height: 128px;
  }
  .ring,
  .spoke {
    fill: none;
    stroke: var(--line);
    stroke-width: 0.7;
  }
  .shape {
    fill: rgba(201, 197, 184, 0.14);
    stroke: var(--bone);
    stroke-width: 1;
  }
  .ship {
    fill: var(--dim);
  }
  .bearing {
    stroke: var(--amber);
    stroke-width: 1.2;
  }
</style>
