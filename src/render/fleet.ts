import { BoxGeometry, BufferGeometry, Color, InstancedMesh, MeshBasicMaterial, MeshStandardMaterial, type Scene } from 'three/webgpu';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CLASSES } from '../sim/classes.ts';
import { S_ALIVE, S_CLS, S_HP, S_HX, S_HY, S_PHX, S_PHY, S_PX, S_PY, S_SIDE, S_X, S_Y, STRIDE } from '../worker/snapshot.ts';

// M0 placeholder hulls: slab, superstructure and engine block, forward along +x.
const HEIGHTS = [10, 14, 22];
const LAYER_Y = [0, 18, 40];

const HULL_A = new Color(0.56, 0.54, 0.5);
const HULL_B = new Color(0.34, 0.36, 0.38);
// Running lights carry the only faction colour. Values above 1 feed the bloom.
const LIGHT_A = new Color(1.0, 0.52, 0.14).multiplyScalar(5);
const LIGHT_B = new Color(0.95, 0.2, 0.16).multiplyScalar(5);

function hullGeometry(cls: number): BufferGeometry {
  const c = CLASSES[cls];
  const h = HEIGHTS[cls];
  const slab = new BoxGeometry(c.length, h * 0.6, c.beam);
  const deck = new BoxGeometry(c.length * 0.35, h * 0.5, c.beam * 0.55);
  deck.translate(-c.length * 0.12, h * 0.55, 0);
  const engine = new BoxGeometry(c.length * 0.14, h * 0.5, c.beam * 0.8);
  engine.translate(-c.length * 0.45, 0, 0);
  const prow = new BoxGeometry(c.length * 0.2, h * 0.35, c.beam * 0.5);
  prow.translate(c.length * 0.55, -h * 0.05, 0);
  const merged = mergeGeometries([slab, deck, engine, prow]);
  if (!merged) throw new Error('hull merge failed');
  return merged;
}

export class FleetView {
  private readonly hulls: InstancedMesh[] = [];
  private readonly lights: InstancedMesh;
  private readonly tmp = new Color();

  constructor(scene: Scene, capacity: number) {
    const mat = new MeshStandardMaterial({ color: 0xffffff, roughness: 0.78, metalness: 0.3, flatShading: true });
    for (let cls = 0; cls < CLASSES.length; cls++) {
      const mesh = new InstancedMesh(hullGeometry(cls), mat, capacity);
      mesh.frustumCulled = false;
      mesh.setColorAt(0, HULL_A);
      mesh.count = 0;
      scene.add(mesh);
      this.hulls.push(mesh);
    }
    this.lights = new InstancedMesh(new BoxGeometry(5, 4, 5), new MeshBasicMaterial({ color: 0xffffff }), capacity);
    this.lights.frustumCulled = false;
    this.lights.setColorAt(0, LIGHT_A);
    this.lights.count = 0;
    scene.add(this.lights);
  }

  update(data: Float32Array, count: number, alpha: number): void {
    const counts = [0, 0, 0];
    let nLights = 0;
    const lightM = this.lights.instanceMatrix.array as Float32Array;
    const lightC = this.lights.instanceColor!.array as Float32Array;

    for (let i = 0; i < count; i++) {
      const o = i * STRIDE;
      if (!data[o + S_ALIVE]) continue;
      const cls = data[o + S_CLS];
      const side = data[o + S_SIDE];
      const x = data[o + S_PX] + (data[o + S_X] - data[o + S_PX]) * alpha;
      const z = data[o + S_PY] + (data[o + S_Y] - data[o + S_PY]) * alpha;
      let hx = data[o + S_PHX] + (data[o + S_HX] - data[o + S_PHX]) * alpha;
      let hz = data[o + S_PHY] + (data[o + S_HY] - data[o + S_PHY]) * alpha;
      const len = Math.hypot(hx, hz) || 1;
      hx /= len;
      hz /= len;
      const y = LAYER_Y[cls];

      const mesh = this.hulls[cls];
      const k = counts[cls]++;
      writeMatrix(mesh.instanceMatrix.array as Float32Array, k * 16, hx, hz, x, y, z);
      const shade = 0.55 + 0.45 * data[o + S_HP];
      this.tmp.copy(side === 0 ? HULL_A : HULL_B).multiplyScalar(shade);
      this.tmp.toArray(mesh.instanceColor!.array as Float32Array, k * 3);

      // One running light at the stern.
      const back = CLASSES[cls].length * 0.52;
      writeMatrix(lightM, nLights * 16, hx, hz, x - hx * back, y + HEIGHTS[cls] * 0.2, z - hz * back);
      (side === 0 ? LIGHT_A : LIGHT_B).toArray(lightC, nLights * 3);
      nLights++;
    }

    for (let cls = 0; cls < this.hulls.length; cls++) {
      const mesh = this.hulls[cls];
      mesh.count = counts[cls];
      mesh.instanceMatrix.needsUpdate = true;
      mesh.instanceColor!.needsUpdate = true;
    }
    this.lights.count = nLights;
    this.lights.instanceMatrix.needsUpdate = true;
    this.lights.instanceColor!.needsUpdate = true;
  }
}

/** Column-major matrix: local +x along (hx, 0, hz), no scale, translated. */
function writeMatrix(m: Float32Array, o: number, hx: number, hz: number, x: number, y: number, z: number): void {
  m[o] = hx;
  m[o + 1] = 0;
  m[o + 2] = hz;
  m[o + 3] = 0;
  m[o + 4] = 0;
  m[o + 5] = 1;
  m[o + 6] = 0;
  m[o + 7] = 0;
  m[o + 8] = -hz;
  m[o + 9] = 0;
  m[o + 10] = hx;
  m[o + 11] = 0;
  m[o + 12] = x;
  m[o + 13] = y;
  m[o + 14] = z;
  m[o + 15] = 1;
}
