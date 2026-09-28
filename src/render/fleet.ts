import { BoxGeometry, Color, InstancedMesh, MeshBasicMaterial, MeshStandardMaterial, type Scene } from 'three/webgpu';
import { CRIPPLED, DESTROYED, ESCAPED } from '../sim/world.ts';
import { M_HP, M_STRIDE, U_STATUS, U_STRIDE, U_STRUCT } from '../worker/snapshot.ts';
import type { Poses, Roster } from './roster.ts';
import { buildDesignGeometry, mountTop } from './ship-geometry.ts';

// Ships drawn from their designs, one instanced mesh per design, plus one
// status light per module: lit in the side's colour while it works, dark once lost.

/** Capital ships ride higher than escorts, so the diorama has layers. */
export const LAYER_Y = [0, 16, 36];

const HULL_A = new Color(0.66, 0.63, 0.57);
const HULL_B = new Color(0.17, 0.18, 0.2);
// Moderate intensity: brighter lights bleach toward white under the tone map.
const LIGHT_A = new Color(1.0, 0.5, 0.12).multiplyScalar(2.2);
const LIGHT_B = new Color(1.0, 0.12, 0.08).multiplyScalar(2.2);
const LIGHT_OFF = new Color(0.03, 0.03, 0.03);
const DRIVE_A = new Color(1.0, 0.66, 0.32).multiplyScalar(3);
const DRIVE_B = new Color(1.0, 0.32, 0.22).multiplyScalar(3);

export class FleetView {
  private readonly roster: Roster;
  private readonly meshes: InstancedMesh[] = [];
  /** Instance slot of each unit within its design's mesh. */
  private readonly slot: Int32Array;
  private readonly lights: InstancedMesh;
  private readonly tmp = new Color();
  private readonly pos = new Float32Array(3);
  private readonly scene: Scene;

  constructor(scene: Scene, roster: Roster) {
    this.scene = scene;
    this.roster = roster;
    const perDesign = new Int32Array(roster.designs.length);
    this.slot = new Int32Array(roster.count);
    for (let i = 0; i < roster.count; i++) this.slot[i] = perDesign[roster.unitDesign[i]]++;

    const mat = new MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.8, metalness: 0.35, flatShading: true });
    roster.designs.forEach((d, k) => {
      const mesh = new InstancedMesh(buildDesignGeometry(d), mat, Math.max(1, perDesign[k]));
      mesh.frustumCulled = false;
      mesh.setColorAt(0, HULL_A);
      mesh.count = perDesign[k];
      scene.add(mesh);
      this.meshes.push(mesh);
    });

    this.lights = new InstancedMesh(new BoxGeometry(1, 1, 1), new MeshBasicMaterial({ color: 0xffffff }), Math.max(1, roster.moduleCount));
    this.lights.frustumCulled = false;
    this.lights.setColorAt(0, LIGHT_OFF);
    scene.add(this.lights);
  }

  dispose(): void {
    for (const m of this.meshes) {
      this.scene.remove(m);
      m.geometry.dispose();
    }
    this.scene.remove(this.lights);
    this.lights.geometry.dispose();
  }

  update(units: Float32Array, modules: Float32Array, poses: Poses): void {
    const r = this.roster;
    const pos = this.pos;
    for (let i = 0; i < r.count; i++) {
      const o = i * U_STRIDE;
      const status = units[o + U_STATUS];
      const d = r.designs[r.unitDesign[i]];
      const mesh = this.meshes[r.unitDesign[i]];
      const k = this.slot[i];
      const gone = status === DESTROYED || status === ESCAPED;
      const y = LAYER_Y[d.cls];
      writeMatrix(mesh.instanceMatrix.array as Float32Array, k * 16, poses.hx[i], poses.hz[i], poses.x[i], y, poses.z[i], gone ? 0 : 1);
      const base = r.unitSide[i] === 0 ? HULL_A : HULL_B;
      const structure = Math.max(0, units[o + U_STRUCT]);
      const shade = status === CRIPPLED ? 0.3 : 0.55 + 0.45 * structure;
      this.tmp.copy(base).multiplyScalar(shade);
      this.tmp.toArray(mesh.instanceColor!.array as Float32Array, k * 3);

      const start = r.modStart[i];
      for (let s = 0; s < d.modules.length; s++) {
        const m = start + s;
        const mod = d.modules[s];
        const [lx, ly, lz] = mountTop(d.hull, mod.mount);
        const isDrive = mod.def.kind === 'drive';
        poses.toWorld(i, isDrive ? lx - mod.def.size * 4 : lx, y + ly + (isDrive ? 0 : mod.def.size * 1.5 + 1.5), lz, pos, 0);
        const lit = !gone && status !== CRIPPLED && modules[m * M_STRIDE + M_HP] > 0;
        const size = gone ? 0 : isDrive ? 2 + mod.def.size * 1.6 : 1.4 + mod.def.size * 0.5;
        writeMatrix(this.lights.instanceMatrix.array as Float32Array, m * 16, poses.hx[i], poses.hz[i], pos[0], pos[1], pos[2], size);
        const c = !lit ? LIGHT_OFF : isDrive ? (r.unitSide[i] === 0 ? DRIVE_A : DRIVE_B) : r.unitSide[i] === 0 ? LIGHT_A : LIGHT_B;
        c.toArray(this.lights.instanceColor!.array as Float32Array, m * 3);
      }
    }
    for (const mesh of this.meshes) {
      mesh.instanceMatrix.needsUpdate = true;
      mesh.instanceColor!.needsUpdate = true;
    }
    this.lights.instanceMatrix.needsUpdate = true;
    this.lights.instanceColor!.needsUpdate = true;
  }
}

/** Column-major matrix: local +x along (hx, 0, hz), local +z to port, uniform scale. */
function writeMatrix(m: Float32Array, o: number, hx: number, hz: number, x: number, y: number, z: number, s: number): void {
  m[o] = hx * s;
  m[o + 1] = 0;
  m[o + 2] = hz * s;
  m[o + 3] = 0;
  m[o + 4] = 0;
  m[o + 5] = s;
  m[o + 6] = 0;
  m[o + 7] = 0;
  m[o + 8] = -hz * s;
  m[o + 9] = 0;
  m[o + 10] = hx * s;
  m[o + 11] = 0;
  m[o + 12] = x;
  m[o + 13] = y;
  m[o + 14] = z;
  m[o + 15] = 1;
}

