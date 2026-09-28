import { Color, DirectionalLight, Fog, HemisphereLight, Scene, WebGPURenderer, AgXToneMapping } from 'three/webgpu';
import { CameraRig, attachControls } from './camera-rig.ts';
import { FleetView } from './fleet.ts';
import { addGround } from './ground.ts';
import { createPost, type PostControls } from './post.ts';
import { TracerView } from './tracers.ts';
import { patchWebGPUCompat } from './webgpu-compat.ts';

export interface StageOptions {
  container: HTMLElement;
  mapW: number;
  mapH: number;
  capacity: number;
  forceWebGL: boolean;
  /** Cap on devicePixelRatio for the 3D scene. UI text stays at full resolution. */
  dprCap: number;
}

const BG = 0x080807;

export class Stage {
  readonly renderer: WebGPURenderer;
  readonly scene = new Scene();
  readonly rig: CameraRig;
  readonly fleet: FleetView;
  readonly tracers: TracerView;
  readonly backend: 'WebGPU' | 'WebGL2';
  private readonly post: PostControls;
  private readonly fog: Fog;
  private readonly opts: StageOptions;

  private constructor(opts: StageOptions, renderer: WebGPURenderer) {
    this.opts = opts;
    this.renderer = renderer;
    const backend = renderer.backend as unknown as { isWebGPUBackend?: boolean };
    this.backend = backend.isWebGPUBackend ? 'WebGPU' : 'WebGL2';

    this.scene.background = new Color(BG);
    this.fog = new Fog(BG, 10000, 40000);
    this.scene.fog = this.fog;

    const key = new DirectionalLight(0xfff0dc, 2.6);
    key.position.set(opts.mapW * 0.2, 9000, -3000);
    key.target.position.set(opts.mapW / 2, 0, opts.mapH / 2);
    this.scene.add(key, key.target);
    this.scene.add(new HemisphereLight(0xb9b6ad, 0x0b0b0a, 0.55));

    addGround(this.scene, opts.mapW / 2, opts.mapH / 2);
    this.fleet = new FleetView(this.scene, opts.capacity);
    this.tracers = new TracerView(this.scene, opts.capacity);

    this.rig = new CameraRig(this.aspect(), opts.mapW, opts.mapH);
    attachControls(renderer.domElement, this.rig);
    this.post = createPost(renderer, this.scene, this.rig.camera);

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

  render(): void {
    // Fog follows the zoom so distant layers fade to haze at any distance.
    this.fog.near = this.rig.dist * 0.85;
    this.fog.far = this.rig.dist * 2.4;
    this.post.pipeline.render();
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
