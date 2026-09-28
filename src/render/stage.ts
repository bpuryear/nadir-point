import { AgXToneMapping, Color, DirectionalLight, Fog, HemisphereLight, Mesh, Plane, Raycaster, Scene, Vector2, Vector3, WebGPURenderer } from 'three/webgpu';
import { CameraRig, attachControls } from './camera-rig.ts';
import { EffectsView } from './effects.ts';
import { FleetView, LAYER_Y } from './fleet.ts';
import { addGround } from './ground.ts';
import { createPost, type PostControls } from './post.ts';
import { Poses, type Roster } from './roster.ts';
import { TracerView } from './tracers.ts';
import { patchWebGPUCompat } from './webgpu-compat.ts';
import { CRIPPLED } from '../sim/world.ts';
import { U_STATUS, U_STRIDE } from '../worker/snapshot.ts';

export interface StageOptions {
  container: HTMLElement;
  forceWebGL: boolean;
  /** Cap on devicePixelRatio for the 3D scene. UI text stays at full resolution. */
  dprCap: number;
}

interface Battle {
  roster: Roster;
  poses: Poses;
  fleet: FleetView;
  tracers: TracerView;
}

const BG = 0x080807;

export class Stage {
  readonly renderer: WebGPURenderer;
  readonly scene = new Scene();
  readonly rig: CameraRig;
  readonly backend: 'WebGPU' | 'WebGL2';
  private readonly post: PostControls;
  private readonly fog: Fog;
  private readonly key: DirectionalLight;
  private readonly effects: EffectsView;
  private readonly opts: StageOptions;
  private ground: Mesh | null = null;
  private battle: Battle | null = null;
  private readonly raycaster = new Raycaster();
  private readonly plane = new Plane(new Vector3(0, 1, 0), 0);
  private readonly v = new Vector3();

  private constructor(opts: StageOptions, renderer: WebGPURenderer) {
    this.opts = opts;
    this.renderer = renderer;
    const backend = renderer.backend as unknown as { isWebGPUBackend?: boolean };
    this.backend = backend.isWebGPUBackend ? 'WebGPU' : 'WebGL2';

    this.scene.background = new Color(BG);
    this.fog = new Fog(BG, 10000, 40000);
    this.scene.fog = this.fog;
    this.key = new DirectionalLight(0xfff0dc, 2.6);
    this.scene.add(this.key, this.key.target);
    this.scene.add(new HemisphereLight(0xb9b6ad, 0x0b0b0a, 0.55));
    this.effects = new EffectsView(this.scene);

    this.rig = new CameraRig(this.aspect(), 6000, 4000);
    attachControls(renderer.domElement, this.rig);
    this.post = createPost(renderer, this.scene, this.rig.camera);
    this.setMap(6000, 4000);

    window.addEventListener('resize', () => this.resize());
    this.resize();
  }

  static async create(opts: StageOptions): Promise<Stage> {
    patchWebGPUCompat();
    const renderer = new WebGPURenderer({ antialias: true, forceWebGL: opts.forceWebGL, powerPreference: 'high-performance' });
    renderer.toneMapping = AgXToneMapping;
    renderer.toneMappingExposure = 1.05;
    await renderer.init();
    opts.container.appendChild(renderer.domElement);
    return new Stage(opts, renderer);
  }

  get blur(): number {
    return this.post.blur.value;
  }

  set blur(v: number) {
    this.post.blur.value = v;
  }

  get pixelRatio(): number {
    return this.renderer.getPixelRatio();
  }

  get roster(): Roster | null {
    return this.battle?.roster ?? null;
  }

  setMap(mapW: number, mapH: number): void {
    if (this.ground) this.scene.remove(this.ground);
    this.ground = addGround(this.scene, mapW / 2, mapH / 2);
    this.key.position.set(mapW * 0.2, 9000, -3000);
    this.key.target.position.set(mapW / 2, 0, mapH / 2);
    this.rig.setBounds(mapW, mapH);
  }

  loadBattle(roster: Roster): void {
    this.clearBattle();
    this.battle = {
      roster,
      poses: new Poses(roster.count),
      fleet: new FleetView(this.scene, roster),
      tracers: new TracerView(this.scene, roster),
    };
  }

  clearBattle(): void {
    if (!this.battle) return;
    this.battle.fleet.dispose();
    this.battle.tracers.dispose(this.scene);
    this.effects.clear();
    this.battle = null;
  }

  addEvents(events: number[]): void {
    if (events.length) this.effects.add(events, performance.now());
  }

  /** Draw one frame. Pass the latest snapshot buffers, or nulls to draw only the scene. */
  frame(units: Float32Array | null, modules: Float32Array | null, alpha: number): void {
    const b = this.battle;
    if (b && units && modules) {
      b.poses.update(units, b.roster.count, alpha);
      b.fleet.update(units, modules, b.poses);
      b.tracers.update(modules, b.poses);
    }
    this.effects.update(performance.now());
    // Fog follows the zoom so distant layers fade to haze at any distance.
    this.fog.near = this.rig.dist * 0.85;
    this.fog.far = this.rig.dist * 2.4;
    this.post.pipeline.render();
  }

  /** The unit under a screen point, or -1. */
  pick(clientX: number, clientY: number): number {
    const b = this.battle;
    if (!b) return -1;
    const hit = this.groundPoint(clientX, clientY);
    if (!hit) return -1;
    let best = -1;
    let bestD = Infinity;
    for (let i = 0; i < b.roster.count; i++) {
      const r = b.roster.designs[b.roster.unitDesign[i]].hull.radius * 1.8;
      const d = Math.hypot(b.poses.x[i] - hit.x, b.poses.z[i] - hit.z);
      if (d < r && d < bestD) {
        best = i;
        bestD = d;
      }
    }
    return best;
  }

  /** The point on the battle plane under a screen point. */
  groundPoint(clientX: number, clientY: number): Vector3 | null {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const ndc = new Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.rig.camera);
    return this.raycaster.ray.intersectPlane(this.plane, new Vector3());
  }

  /** Screen position (CSS px) of unit i, or null if it is behind the camera. */
  project(i: number): { x: number; y: number } | null {
    const b = this.battle;
    if (!b || i < 0) return null;
    const cls = b.roster.designs[b.roster.unitDesign[i]].cls;
    return this.projectPoint(b.poses.x[i], LAYER_Y[cls], b.poses.z[i]);
  }

  /** Bounding box of the ships still in the fight, or null if none. */
  fightBounds(units: Float32Array): { cx: number; cz: number; w: number; h: number } | null {
    const b = this.battle;
    if (!b) return null;
    let x0 = Infinity;
    let x1 = -Infinity;
    let z0 = Infinity;
    let z1 = -Infinity;
    for (let i = 0; i < b.roster.count; i++) {
      if (units[i * U_STRIDE + U_STATUS] >= CRIPPLED) continue;
      x0 = Math.min(x0, b.poses.x[i]);
      x1 = Math.max(x1, b.poses.x[i]);
      z0 = Math.min(z0, b.poses.z[i]);
      z1 = Math.max(z1, b.poses.z[i]);
    }
    if (x0 === Infinity) return null;
    return { cx: (x0 + x1) / 2, cz: (z0 + z1) / 2, w: x1 - x0, h: z1 - z0 };
  }

  /** Distance between two units on the battle plane, metres. */
  distance(a: number, b: number): number {
    const p = this.battle?.poses;
    if (!p) return -1;
    return Math.hypot(p.x[a] - p.x[b], p.z[a] - p.z[b]);
  }

  /** A unit's hull radius in screen pixels at the current zoom. */
  pixelRadius(i: number): number {
    const b = this.battle;
    if (!b) return 0;
    const r = b.roster.designs[b.roster.unitDesign[i]].hull.radius;
    const y = LAYER_Y[b.roster.designs[b.roster.unitDesign[i]].cls];
    const c = this.projectPoint(b.poses.x[i], y, b.poses.z[i]);
    const e = this.projectPoint(b.poses.x[i] + r, y, b.poses.z[i]);
    return c && e ? Math.hypot(e.x - c.x, e.y - c.y) : 0;
  }

  projectPoint(x: number, y: number, z: number): { x: number; y: number } | null {
    this.v.set(x, y, z).project(this.rig.camera);
    if (this.v.z > 1) return null;
    const el = this.renderer.domElement;
    return { x: ((this.v.x + 1) / 2) * el.clientWidth, y: ((1 - this.v.y) / 2) * el.clientHeight };
  }

  private aspect(): number {
    const el = this.opts.container;
    return el.clientWidth / Math.max(1, el.clientHeight);
  }

  private resize(): void {
    const el = this.opts.container;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, this.opts.dprCap));
    this.renderer.setSize(el.clientWidth, el.clientHeight);
    this.rig.setAspect(this.aspect());
  }
}
