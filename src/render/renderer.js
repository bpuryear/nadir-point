import * as THREE from 'three';
import { CAMERA, FAR_SCENE } from '../core/units.js';
import { PostChain } from './postfx.js';

/**
 * The renderer owns two scenes and two cameras.
 *
 * `far` holds celestials - gas giant, star, nebula shells, starfield. They are
 * effectively at infinity, so they render first into a cleared buffer with their
 * own camera and their own compressed distance range. Depth is then cleared and
 * `scene` (everything the player can touch) renders on top.
 *
 * This is what lets a gas giant fill a third of the frame while a fighter 40 m away
 * still z-sorts correctly against the cruiser hull. One scene with a 1e9 far plane
 * would shred depth precision; a logarithmic depth buffer would cost us fill rate we
 * have already committed elsewhere. Two scenes cost one extra depth clear.
 */
export class Renderer {
  constructor(canvas, opts = {}) {
    this.canvas = canvas;

    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: false, // SMAA in the post chain instead; MSAA does not survive HDR
      powerPreference: 'high-performance',
      stencil: false,
      depth: true,
      alpha: false,
      preserveDrawingBuffer: opts.preserveDrawingBuffer ?? false,
    });

    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap; // PCFSoft is deprecated in r185
    this.renderer.shadowMap.autoUpdate = true;
    this.renderer.autoClear = false;
    this.renderer.info.autoReset = false;

    /** Gameplay scene: ships, modules, debris, VFX, everything with real metres. */
    this.scene = new THREE.Scene();
    /** Celestial backdrop scene. */
    this.far = new THREE.Scene();

    this.camera = new THREE.PerspectiveCamera(CAMERA.fov, 1, CAMERA.near, CAMERA.far);
    this.camera.position.set(0, 1800, 2600);
    this.camera.lookAt(0, 0, 0);

    this.farCamera = new THREE.PerspectiveCamera(CAMERA.fov, 1, 1, FAR_SCENE.radius * 4);

    /*
     * Quality is resolved BEFORE the post chain is built, because PostChain's second
     * constructor argument defaults to 'high'.
     *
     * It used to be assigned after this line, so `new PostChain(this)` always took that
     * default and `opts.quality` was stored on the renderer and read by nothing. The
     * `?quality=` query parameter — which main.js and probe.js both parse and forward —
     * therefore had no effect on GTAO, godrays, bloom or SMAA for the whole life of the
     * project. That is why `npm run bench -- --quality medium` returned draw-call counts
     * identical to `high` (423 both ways), and why acceptance.md's standing question of
     * how much of the count is GTAO's depth-normal prepass could never be answered.
     */
    this.quality = opts.quality ?? 'high';
    this.post = new PostChain(this, this.quality);

    this._size = new THREE.Vector2(1, 1);
    this._resizeObserver = null;

    this.setSize(canvas.clientWidth || 1280, canvas.clientHeight || 720);
  }

  setSize(width, height) {
    const w = Math.max(1, Math.floor(width));
    const h = Math.max(1, Math.floor(height));
    this._size.set(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.farCamera.aspect = w / h;
    this.farCamera.updateProjectionMatrix();
    this.renderer.setSize(w, h, false);
    this.post.setSize(w, h, this.renderer.getPixelRatio());
  }

  observeCanvasSize() {
    const apply = () => this.setSize(window.innerWidth, window.innerHeight);
    apply();
    window.addEventListener('resize', apply);
    return apply;
  }

  /** Keep the celestial camera locked to the main camera's orientation. */
  syncFarCamera() {
    this.farCamera.quaternion.copy(this.camera.quaternion);
    this.farCamera.fov = this.camera.fov;
    this.farCamera.aspect = this.camera.aspect;
    // A whisper of parallax so celestials are not perfectly nailed to the view.
    this.farCamera.position.copy(this.camera.position).multiplyScalar(FAR_SCENE.parallax);
    this.farCamera.updateProjectionMatrix();
    this.farCamera.updateMatrixWorld();
  }

  render() {
    this.renderer.info.reset();
    this.syncFarCamera();
    this.post.render();
  }

  /** Draw-call and triangle accounting for the benchmark tooling. */
  get frameStats() {
    const info = this.renderer.info;
    return {
      calls: info.render.calls,
      triangles: info.render.triangles,
      points: info.render.points,
      lines: info.render.lines,
      programs: info.programs?.length ?? 0,
      geometries: info.memory.geometries,
      textures: info.memory.textures,
    };
  }

  dispose() {
    this.post.dispose();
    this.renderer.dispose();
  }
}
