import { AdditiveBlending, BufferAttribute, BufferGeometry, Color, LineBasicMaterial, LineSegments, type Scene } from 'three/webgpu';
import { M_HIT, M_SHOT_AGE, M_STRIDE, M_TARGET } from '../worker/snapshot.ts';
import { LAYER_Y } from './fleet.ts';
import type { Poses, Roster } from './roster.ts';
import { mountTop } from './ship-geometry.ts';

// White-hot tracer lines from each gun's mount to its target, fading over a few ticks.
const LIFE_TICKS = 5;
const TRACER_A = new Color(1.0, 0.88, 0.7).multiplyScalar(3);
const TRACER_B = new Color(1.0, 0.74, 0.7).multiplyScalar(3);

export class TracerView {
  private readonly geom = new BufferGeometry();
  private readonly pos: Float32Array;
  private readonly col: Float32Array;
  private readonly lines: LineSegments;
  private readonly roster: Roster;

  constructor(scene: Scene, roster: Roster) {
    this.roster = roster;
    const n = Math.max(1, roster.moduleCount);
    this.pos = new Float32Array(n * 6);
    this.col = new Float32Array(n * 6);
    this.geom.setAttribute('position', new BufferAttribute(this.pos, 3));
    this.geom.setAttribute('color', new BufferAttribute(this.col, 3));
    const mat = new LineBasicMaterial({ vertexColors: true, transparent: true, blending: AdditiveBlending, depthWrite: false });
    this.lines = new LineSegments(this.geom, mat);
    this.lines.frustumCulled = false;
    scene.add(this.lines);
  }

  dispose(scene: Scene): void {
    scene.remove(this.lines);
    this.geom.dispose();
  }

  update(modules: Float32Array, poses: Poses): void {
    const r = this.roster;
    let n = 0;
    for (let m = 0; m < r.moduleCount; m++) {
      const o = m * M_STRIDE;
      const age = modules[o + M_SHOT_AGE];
      const t = modules[o + M_TARGET];
      if (age >= LIFE_TICKS || t < 0) continue;
      const i = r.mUnit[m];
      const d = r.designs[r.unitDesign[i]];
      const mod = d.modules[r.mSlot[m]];
      if (!mod.def.weapon) continue;
      const fade = 1 - age / LIFE_TICKS;
      const c = r.unitSide[i] === 0 ? TRACER_A : TRACER_B;
      const [lx, ly, lz] = mountTop(d.hull, mod.mount);
      const p = n * 6;
      poses.toWorld(i, lx, LAYER_Y[d.cls] + ly + 2, lz, this.pos, p);

      const td = r.designs[r.unitDesign[t]];
      let ex = poses.x[t];
      let ez = poses.z[t];
      if (!modules[o + M_HIT]) {
        // Misses pass wide by a fixed offset per gun, so the picture is stable.
        const spread = td.hull.radius * 1.4;
        ex += (((m * 37) % 100) / 100 - 0.5) * 2 * spread;
        ez += (((m * 61) % 100) / 100 - 0.5) * 2 * spread;
      }
      this.pos[p + 3] = ex;
      this.pos[p + 4] = LAYER_Y[td.cls] + td.hull.height * 0.5;
      this.pos[p + 5] = ez;
      const heavy = mod.def.size === 3 ? 1.6 : 1;
      this.col[p] = c.r * fade * 0.2;
      this.col[p + 1] = c.g * fade * 0.2;
      this.col[p + 2] = c.b * fade * 0.2;
      this.col[p + 3] = c.r * fade * heavy;
      this.col[p + 4] = c.g * fade * heavy;
      this.col[p + 5] = c.b * fade * heavy;
      n++;
    }
    this.geom.setDrawRange(0, n * 2);
    (this.geom.attributes.position as BufferAttribute).needsUpdate = true;
    (this.geom.attributes.color as BufferAttribute).needsUpdate = true;
  }
}
