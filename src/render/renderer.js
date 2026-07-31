import * as THREE from 'three';
import { CAMERA, FAR_SCENE } from '../core/units.js';
import { PostChain } from './postfx.js';
import { runPendingBakes } from './bakes.js';

/**
 * OPTION B-PRIME — far-camera pitch compression. `space-backgrounds.md` §7.
 *
 * THE OWNER RULED ON THIS FORK: move the celestials to where the camera looks, and
 * SEPARATELY prototype compressing only the FAR camera's pitch. The tactical camera's
 * pitch curve is explicitly not to be touched — `ORBIT.pitchFloorMax` exists to
 * enforce a plan view at strategic zoom, every capital ship is plane-locked to y = 0
 * (`ARCHITECTURE.md` §1), and the plan view is what makes ranges and formations
 * legible. The backdrop is not allowed to buy from that.
 *
 * The mechanism: `syncFarCamera` copies the main camera's quaternion outright, so the
 * sky tracks the tactical camera's 104-degree pitch sweep with a 46-degree frame. At
 * the shipped `engagement` pose the far-scene horizon — where `skydome.js`'s ecliptic
 * band peaks — sits 10.55 degrees ABOVE the top of the frame, and the frame sees a
 * mean of 50.2% of the band's own peak (`field-baseline.md` §3, measured, not
 * modelled). Scaling only the pitch term of that quaternion puts the band back in
 * frame at every zoom without the gameplay camera moving at all.
 *
 * 1.0 IS IDENTITY AND IT IS WHAT SHIPS. This is a prototype with numbers attached,
 * not a decision taken on the owner's behalf. MEASURED BY FLIPPING THE CONSTANT BELOW
 * AND RE-RUNNING `node tools/fieldcheck.mjs engagement,close,wide,cinematic --report`
 * on this tree, hardware raster, field only, N = 1 440 000 px per statistic. Both rows
 * of every pair differ by that one constant and nothing else:
 *
 *   shot         factor  median luma  % above 0.06  median chroma  hue band
 *   engagement    1.00     0.1271        89.83%        0.1373       32 deg
 *   engagement    0.65     0.1871        92.13%        0.2196       12 deg
 *   close         1.00     0.1071        86.53%        0.2784        5 deg
 *   close         0.65     0.1127        91.21%        0.2941        4 deg
 *   wide          1.00     0.1405        86.44%        0.3058        5 deg
 *   wide          0.65     0.1425        86.63%        0.3097        5 deg
 *   cinematic     1.00     0.1202        94.29%        0.1295       29 deg
 *   cinematic     0.65     0.1647        96.04%        0.1962       10 deg
 *
 * SO IT WORKS, and it works hardest exactly where the baseline said the problem was.
 * `engagement` and `cinematic` are the two shots whose pose puts the dome's band out
 * of frame, and they move +47% and +37% of median luma; `close` and `wide`, which
 * `field-baseline.md` §3 measured as ALREADY seeing 79.1% and 81.5% of the band peak,
 * move +5% and +1%. R1 and R2 pass at all four shots at both factors.
 *
 * IT IS NOT ON, AND THERE ARE TWO REASONS, THE SECOND OF WHICH IS THE INTERESTING ONE.
 *
 * First, it is a large luminance change. +47% at `engagement` needs every `dome.gain`
 * and `dome.baseGain` in `world/celestials/index.js` re-solved DOWNWARD, because those
 * numbers were solved against a measured frame at factor 1.0. Shipping the field
 * structure and this in one commit would make it impossible to say which one moved the
 * frame.
 *
 * Second, AND THIS IS THE COST NOBODY COSTED: it partly undoes the owner's ruling.
 * Compressing the pitch pulls the dome's green lobe INTO frame, which dilutes the rust
 * that the dust lanes put in the dark tier. Measured at `engagement`, same command:
 *
 *   factor  dark tier hue  bright tier hue  dark-to-bright separation
 *   1.00      45.6 deg        89.1 deg          43.5 deg
 *   0.65      61.7 deg        88.0 deg          26.3 deg
 *
 * The frame gets brighter and more saturated and LESS separated — the hue band
 * narrows 32 -> 12 degrees because the field is more uniformly green. That is a
 * straight trade of the rust/green value separation for luminance, and it is the
 * owner's call, not this file's.
 *
 * The consequence the owner should also weigh is that the sky stops tracking the
 * camera rigidly, so tilting slides the sky at a different rate than the world. At a
 * 46-degree FOV that is visible and it may read as "the sky is on rails". It remains
 * the ONLY option in §7 that puts the field in frame at every zoom level.
 *
 * IF THIS IS TURNED ON, RE-SOLVE THE GAINS AND RE-RUN `fieldcheck`. Changing this
 * number without doing so reproduces the exact failure `skydome.js`'s header records —
 * a dome shipped at a gain nobody measured.
 */
const FAR_PITCH_COMPRESSION = 1.0;

/** Scratch for the pitch decomposition. Module scope: no allocation per frame. */
const _farEuler = new THREE.Euler(0, 0, 0, 'YXZ');

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
    if (FAR_PITCH_COMPRESSION === 1.0) {
      this.farCamera.quaternion.copy(this.camera.quaternion);
    } else {
      // YXZ is yaw-pitch-roll for a camera, so `.x` IS the pitch and nothing else is.
      // Scaling it leaves yaw and roll bit-identical to the main camera's.
      _farEuler.setFromQuaternion(this.camera.quaternion, 'YXZ');
      _farEuler.x *= FAR_PITCH_COMPRESSION;
      this.farCamera.quaternion.setFromEuler(_farEuler);
    }
    this.farCamera.fov = this.camera.fov;
    this.farCamera.aspect = this.camera.aspect;
    // A whisper of parallax so celestials are not perfectly nailed to the view.
    this.farCamera.position.copy(this.camera.position).multiplyScalar(FAR_SCENE.parallax);
    this.farCamera.updateProjectionMatrix();
    this.farCamera.updateMatrixWorld();
  }

  render() {
    /**
     * ONE-SHOT OFFSCREEN BAKES, DRAINED BEFORE `info.reset()` AND NOT AFTER.
     *
     * `bakes.js` queues work that needs a renderer — today, the sky dome's
     * field cube (`space-backgrounds.md` item 4). It cannot happen where item 4 puts
     * it, inside `buildCelestials`, because none of the five call sites for that
     * function holds a renderer; it happens here instead, which reaches the game and
     * every probe by the same path. `runPendingBakes` returns immediately on an empty
     * queue, so the steady-state cost is a length check.
     *
     * THE ORDER OF THESE TWO LINES IS THE WHOLE CONTRACT. `info.autoReset` is false
     * (see the constructor), so counters accumulate until something resets them. A
     * bake issues six draws. Drained BEFORE the reset, those six are wiped and never
     * appear in a frame's statistics; drained after, they would land in the counters
     * `tools/bench.mjs` takes the PEAK of, and a one-frame +6 on a peak is permanent.
     * That is `space-backgrounds.md` item 4's landmine 2, and `bakes.js#withBakeState`
     * also resets `info` on its own way out, so it is guarded twice.
     */
    runPendingBakes(this.renderer);

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
