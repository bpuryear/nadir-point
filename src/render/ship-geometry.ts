import { BoxGeometry, BufferGeometry, CylinderGeometry, ExtrudeGeometry, Float32BufferAttribute, Shape } from 'three/webgpu';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { HullDef, MountDef } from '../content/types.ts';
import type { CompiledDesign, CompiledModule } from '../sim/design.ts';

// Code-built ship meshes. One merged geometry per design: hull slab, deck
// structure, and a visible part for every installed module. Local frame:
// +x forward, +y up, +z port (matches the sim's +y port).

const HULL_SHADE = 0.42;
const DECK_SHADE = 0.55;
const MODULE_SHADE = 0.78;
const BARREL_SHADE = 0.34;

/** Height of the main deck above the ship origin. */
export function deckHeight(hull: HullDef): number {
  return hull.height * 0.5;
}

/** Where a module sits in the ship frame, for status lights and tracer origins. */
export function mountTop(hull: HullDef, mount: MountDef): [number, number, number] {
  const deck = deckHeight(hull);
  switch (mount.zone) {
    case 'dorsal':
      return [mount.x, deck + hull.height * 0.35, mount.y];
    case 'core':
      return [mount.x, deck + hull.height * 0.12, mount.y];
    case 'stern':
      return [mount.x, deck * 0.4, mount.y];
    default:
      return [mount.x, deck * 0.85, mount.y];
  }
}

function tint(g: BufferGeometry, shade: number): BufferGeometry {
  const n = g.getAttribute('position').count;
  const c = new Float32Array(n * 3).fill(shade);
  g.setAttribute('color', new Float32BufferAttribute(c, 3));
  return g.index ? g.toNonIndexed() : g;
}

function hullSlab(h: HullDef): BufferGeometry {
  const L = h.length;
  const B = h.beam;
  const taper = h.cls === 'frigate' ? 0.3 : h.cls === 'destroyer' ? 0.24 : 0.2;
  const s = new Shape();
  s.moveTo(-L / 2, -B / 2);
  s.lineTo(L / 2 - L * taper, -B / 2);
  s.lineTo(L / 2, -B * 0.16);
  s.lineTo(L / 2, B * 0.16);
  s.lineTo(L / 2 - L * taper, B / 2);
  s.lineTo(-L / 2, B / 2);
  s.closePath();
  const depth = h.height * 0.6;
  const g = new ExtrudeGeometry(s, { depth, bevelEnabled: true, bevelThickness: h.height * 0.08, bevelSize: B * 0.04, bevelSegments: 1 });
  // Extrusion runs along +z; stand it up so the slab's thickness is +y.
  g.rotateX(-Math.PI / 2);
  g.translate(0, -depth * 0.5, 0);
  return tint(g, HULL_SHADE);
}

function deckStructure(h: HullDef): BufferGeometry[] {
  const parts: BufferGeometry[] = [];
  const deck = deckHeight(h);
  // A long spine block and a few stacked plates: the industrial silhouette.
  const spine = new BoxGeometry(h.length * 0.55, h.height * 0.28, h.beam * 0.42);
  spine.translate(-h.length * 0.06, deck + h.height * 0.1, 0);
  parts.push(tint(spine, DECK_SHADE));
  const plates = h.cls === 'cruiser' ? 4 : h.cls === 'destroyer' ? 3 : 2;
  for (let k = 0; k < plates; k++) {
    const p = new BoxGeometry(h.length * 0.08, h.height * 0.12, h.beam * 0.86);
    p.translate(-h.length * 0.3 + k * h.length * 0.14, deck - h.height * 0.02, 0);
    parts.push(tint(p, HULL_SHADE * 1.15));
  }
  return parts;
}

function weaponPart(h: HullDef, m: CompiledModule): BufferGeometry[] {
  const size = m.def.size;
  const [x, y, z] = mountTop(h, m.mount);
  const baseR = [0, 3, 5, 8][size];
  const base = new CylinderGeometry(baseR, baseR * 1.15, baseR * 0.7, 8);
  base.translate(x, y, z);
  const parts = [tint(base, MODULE_SHADE)];

  const code = m.def.code;
  const twin = code.startsWith('AC') || code.startsWith('HG');
  const length = code.startsWith('MD') ? [0, 10, 18, 30][size] : code.startsWith('HG') ? 16 : [0, 6, 9, 12][size];
  const thick = [0, 0.9, 1.4, 2.2][size];
  const offsets = twin ? [-thick * 1.2, thick * 1.2] : [0];
  // rotateY turns +x toward -z; port is +z, so negate the facing angle.
  const angle = -Math.atan2(m.fy, m.fx);
  for (const off of offsets) {
    const barrel = new BoxGeometry(length, thick, thick);
    barrel.translate(length / 2, 0, off);
    barrel.rotateY(angle);
    barrel.translate(x, y + baseR * 0.3, z);
    parts.push(tint(barrel, BARREL_SHADE));
  }
  return parts;
}

function systemPart(h: HullDef, m: CompiledModule): BufferGeometry[] {
  const [x, y, z] = mountTop(h, m.mount);
  const size = m.def.size;
  const unit = [0, 4, 6, 9][size];
  switch (m.def.kind) {
    case 'reactor': {
      const housing = new BoxGeometry(unit * 1.6, unit * 0.7, unit * 1.4);
      housing.translate(x, y, z);
      const parts = [tint(housing, MODULE_SHADE * 0.9)];
      // Radiator fins across the beam.
      for (let k = -1; k <= 1; k++) {
        const fin = new BoxGeometry(unit * 0.18, unit * 0.5, h.beam * 0.7);
        fin.translate(x + k * unit * 0.5, y + unit * 0.3, z);
        parts.push(tint(fin, MODULE_SHADE * 0.7));
      }
      return parts;
    }
    case 'drive': {
      const bell = new CylinderGeometry(unit * 0.55, unit * 0.85, unit * 1.4, 10);
      bell.rotateZ(Math.PI / 2);
      bell.translate(x - unit * 0.4, y, z);
      return [tint(bell, BARREL_SHADE * 1.2)];
    }
    case 'bridge': {
      const tower = new BoxGeometry(unit * 1.3, unit * 1.4, unit * 1.1);
      tower.translate(x, y + unit * 0.5, z);
      const cap = new BoxGeometry(unit * 1.6, unit * 0.25, unit * 1.5);
      cap.translate(x, y + unit * 1.25, z);
      return [tint(tower, MODULE_SHADE), tint(cap, DECK_SHADE)];
    }
    case 'firecontrol': {
      const mast = new CylinderGeometry(unit * 0.12, unit * 0.12, unit * 1.6, 5);
      mast.translate(x, y + unit * 0.8, z);
      const dish = new CylinderGeometry(unit * 0.7, unit * 0.2, unit * 0.2, 10);
      dish.translate(x, y + unit * 1.6, z);
      return [tint(mast, MODULE_SHADE), tint(dish, MODULE_SHADE)];
    }
    case 'damagecontrol': {
      const block = new BoxGeometry(unit * 1.4, unit * 0.6, unit * 1.2);
      block.translate(x, y, z);
      const boom = new BoxGeometry(unit * 1.8, unit * 0.14, unit * 0.14);
      boom.translate(x + unit * 0.5, y + unit * 0.6, z);
      return [tint(block, MODULE_SHADE * 0.85), tint(boom, MODULE_SHADE)];
    }
    default:
      return [];
  }
}

export function buildDesignGeometry(d: CompiledDesign): BufferGeometry {
  const h = d.hull;
  const parts: BufferGeometry[] = [hullSlab(h), ...deckStructure(h)];
  for (const m of d.modules) parts.push(...(m.def.weapon ? weaponPart(h, m) : systemPart(h, m)));
  const merged = mergeGeometries(parts.map(stripUv));
  if (!merged) throw new Error(`Could not build geometry for ${d.design.name}`);
  merged.computeBoundingSphere();
  return merged;
}

/** Keep only the attributes every part shares, so the merge never fails on a mismatch. */
function stripUv(g: BufferGeometry): BufferGeometry {
  for (const name of Object.keys(g.attributes)) {
    if (name !== 'position' && name !== 'normal' && name !== 'color') g.deleteAttribute(name);
  }
  return g;
}
