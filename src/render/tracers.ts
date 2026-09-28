import { AdditiveBlending, BufferAttribute, BufferGeometry, Color, LineBasicMaterial, LineSegments, type Scene } from 'three/webgpu';
import { CLASSES } from '../sim/classes.ts';
import { S_ALIVE, S_CLS, S_SHOT_AGE, S_SHOT_HIT, S_SHOT_TARGET, S_SIDE, S_X, S_Y, STRIDE } from '../worker/snapshot.ts';

// White-hot tracer lines from shooter to target, fading over a few ticks.
const LIFE_TICKS = 4;
const TRACER_A = new Color(1.0, 0.86, 0.66).multiplyScalar(3);
const TRACER_B = new Color(1.0, 0.72, 0.68).multiplyScalar(3);
const LAYER_Y = [4, 24, 50];

export class TracerView {
  private readonly geom = new BufferGeometry();
  private readonly pos: Float32Array;
  private readonly col: Float32Array;

  constructor(scene: Scene, capacity: number) {
    this.pos = new Float32Array(capacity * 6);
    this.col = new Float32Array(capacity * 6);
    this.geom.setAttribute('position', new BufferAttribute(this.pos, 3));
    this.geom.setAttribute('color', new BufferAttribute(this.col, 3));
    const mat = new LineBasicMaterial({ vertexColors: true, transparent: true, blending: AdditiveBlending, depthWrite: false });
    const lines = new LineSegments(this.geom, mat);
    lines.frustumCulled = false;
    scene.add(lines);
  }

  update(data: Float32Array, count: number): void {
    let n = 0;
    for (let i = 0; i < count; i++) {
      const o = i * STRIDE;
      const age = data[o + S_SHOT_AGE];
      const t = data[o + S_SHOT_TARGET];
      if (!data[o + S_ALIVE] || age >= LIFE_TICKS || t < 0) continue;
      const to = t * STRIDE;
      const fade = 1 - age / LIFE_TICKS;
      const c = data[o + S_SIDE] === 0 ? TRACER_A : TRACER_B;

      let ex = data[to + S_X];
      let ez = data[to + S_Y];
      if (!data[o + S_SHOT_HIT]) {
        // Misses pass wide of the target by a fixed per-unit offset.
        ex += ((i * 37) % 60) - 30 + 25;
        ez += ((i * 53) % 60) - 30 - 25;
      }
      const p = n * 6;
      this.pos[p] = data[o + S_X];
      this.pos[p + 1] = LAYER_Y[data[o + S_CLS]];
      this.pos[p + 2] = data[o + S_Y];
      this.pos[p + 3] = ex;
      this.pos[p + 4] = LAYER_Y[data[to + S_CLS]] + CLASSES[data[to + S_CLS]].radius * 0.2;
      this.pos[p + 5] = ez;
      this.col[p] = c.r * fade * 0.25;
      this.col[p + 1] = c.g * fade * 0.25;
      this.col[p + 2] = c.b * fade * 0.25;
      this.col[p + 3] = c.r * fade;
      this.col[p + 4] = c.g * fade;
      this.col[p + 5] = c.b * fade;
      n++;
    }
    this.geom.setDrawRange(0, n * 2);
    (this.geom.attributes.position as BufferAttribute).needsUpdate = true;
    (this.geom.attributes.color as BufferAttribute).needsUpdate = true;
  }
}
