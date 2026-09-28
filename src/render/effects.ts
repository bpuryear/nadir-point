import { AdditiveBlending, Color, InstancedMesh, MeshBasicMaterial, SphereGeometry, type Scene } from 'three/webgpu';
import { EVENT_BREACH } from '../sim/world.ts';

// Explosion flashes from sim events: a bright core that swells and fades.
// Breaches are larger and hotter than ordinary kills.

const MAX_FLASHES = 64;
const LIFE_MS = 1400;
const BREACH = new Color(1.0, 0.62, 0.28).multiplyScalar(5);
const KILL = new Color(1.0, 0.5, 0.25).multiplyScalar(3);

interface Flash {
  x: number;
  z: number;
  radius: number;
  kind: number;
  born: number;
}

export class EffectsView {
  private readonly mesh: InstancedMesh;
  private readonly flashes: Flash[] = [];
  private readonly tmp = new Color();

  constructor(scene: Scene) {
    const mat = new MeshBasicMaterial({ color: 0xffffff, transparent: true, blending: AdditiveBlending, depthWrite: false });
    this.mesh = new InstancedMesh(new SphereGeometry(1, 12, 8), mat, MAX_FLASHES);
    this.mesh.frustumCulled = false;
    this.mesh.setColorAt(0, KILL);
    this.mesh.count = 0;
    scene.add(this.mesh);
  }

  clear(): void {
    this.flashes.length = 0;
    this.mesh.count = 0;
  }

  add(events: number[], now: number): void {
    for (let k = 0; k + 3 < events.length; k += 4) {
      if (this.flashes.length >= MAX_FLASHES) this.flashes.shift();
      this.flashes.push({ x: events[k], z: events[k + 1], radius: events[k + 2], kind: events[k + 3], born: now });
    }
  }

  update(now: number): void {
    let n = 0;
    const m = this.mesh.instanceMatrix.array as Float32Array;
    const c = this.mesh.instanceColor!.array as Float32Array;
    for (let k = this.flashes.length - 1; k >= 0; k--) {
      const f = this.flashes[k];
      const t = (now - f.born) / LIFE_MS;
      if (t >= 1) {
        this.flashes.splice(k, 1);
        continue;
      }
      const breach = f.kind === EVENT_BREACH;
      const size = f.radius * (breach ? 0.5 + 0.8 * t : 0.6 + 1.4 * t);
      const o = n * 16;
      m.fill(0, o, o + 16);
      m[o] = size;
      m[o + 5] = size * 0.35;
      m[o + 10] = size;
      m[o + 12] = f.x;
      m[o + 13] = 20;
      m[o + 14] = f.z;
      m[o + 15] = 1;
      const fade = (1 - t) * (1 - t);
      this.tmp.copy(breach ? BREACH : KILL).multiplyScalar(fade);
      this.tmp.toArray(c, n * 3);
      n++;
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.mesh.instanceColor!.needsUpdate = true;
  }
}
