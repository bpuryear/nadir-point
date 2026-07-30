/**
 * ENGINE PLUMES.
 *
 * This is a GAMEPLAY READ, not decoration. Plume length and brightness are driven by
 *
 *     throttle  x  engine-subsystem health  x  engine power channel
 *
 * so a destroyer whose drives you have shot out visibly stops burning, and you can
 * tell a stranded hull from a running one across two kilometres without a UI element.
 * The whole point of subsystem targeting is that the consequences are legible in the
 * world; a plume that keeps burning on a dead engine silently deletes that.
 *
 * One instanced ribbon for every drive on every ship in the scene. The ribbon is
 * rebuilt to face the camera per vertex, tapers along its length in the fragment
 * shader, and carries shock diamonds whose spacing tightens as the drive spools up.
 * A cold engine emits a short, dim idle glow; a dead one emits nothing at all.
 *
 * ===========================================================================
 * R4: THE DRIVES ARE A PRIMARY READ, AND THEY WERE 0.05 HULL LENGTHS LONG
 * ===========================================================================
 *
 * `docs/design/reference-frames.md` R4 asks for a plume of at least **1.5 hull
 * lengths at cruise** at a peak chroma of at least 0.30, off three Homeworld frames
 * where the engine trails are the strongest single read in the picture.
 *
 * Measured on the live game before this pass, straight off the instance buffers at
 * the shipped `engagement` pose: `maxLen 75.4 m` against a `1400 m` hull — **0.054
 * hull lengths**, and that is the IDLE figure because the ship is stationary in that
 * shot. At full burn the old expression gave `58 * (1.3 + 11.5) = 742 m`, or **0.53
 * hull lengths**, still a third of what R4 asks for.
 *
 * THE LENGTH WAS KEYED TO THE WRONG QUANTITY. It read `r * (1.3 + 11.5 * burn)`,
 * where `r` is the drive SUBSYSTEM's radius — so "how long is the plume" was answered
 * by "how big did somebody author the bell", and the same coefficient produced 0.53
 * hull lengths on the player cruiser (r 58, hull 1400) and 3.2 on a Coalition corvette
 * (r 8, hull ~90). A quantity R4 states in hull lengths is now computed in hull
 * lengths, and the whole fleet gets the same read at every scale.
 *
 * ===========================================================================
 * W6-C: WHAT THE ABOVE ACTUALLY BOUGHT, MEASURED, AND THE THREE THINGS IT MISSED
 * ===========================================================================
 *
 * All numbers below are off the live game at 1600x900 on hardware ANGLE/Metal. Plume
 * length is read straight out of `aParams.x` and divided by `classDef.length`; plume
 * chroma is `C = max(R,G,B) - min(R,G,B)` on the display-referred sRGB frame — the
 * SAME metric `tools/fieldcheck.mjs` grades R1/R2 in — taken over a mask built by
 * toggling this mesh's `visible` with the simulation PAUSED, so the two frames differ
 * by one boolean and by nothing else.
 *
 * 1. R4's LENGTH WAS ALREADY MET AT FLANK AND ONLY AT FLANK. A player cruiser under a
 *    move order settles at throttle 1.000 / 140 of 140 m/s after ~480 frames, giving
 *    2310 m = 1.65 hull lengths. But `sim/physics.js:171` records the fleet's MEASURED
 *    mean combat throttle as 0.54, and the ramp was linear in throttle, so the plume a
 *    player actually sees during a fight was 1312 m = 0.937 hull lengths — 62% of R4's
 *    floor. The ramp is now concave (`spool = sqrt(drive)`), which lifts the whole
 *    moving band without inflating flank: 0.30 throttle 0.565 -> 1.091 hull, 0.54
 *    throttle 0.937 -> 1.409, 1.00 throttle 1.650 -> 1.860.
 *
 * 2. THE CHROMA PUSH WAS ANNIHILATING A CHANNEL ON THREE FACTIONS OF FOUR. The comment
 *    this block replaces claimed `saturate()` is "hue- and luminance-preserving by
 *    construction". It is — until a channel hits the [0,1] clamp inside it, and at the
 *    shipped amount of 1.45 that had already happened everywhere except the player:
 *
 *      coalition  #ff6a12 -> #ff4900   blue 0.006 -> 0    hue 22.3 -> 17.2 deg
 *      concord    #49c6ff -> #00cbff   red  0.067 -> 0    hue 198.8 -> 192.2 deg
 *      derelict   #86b02a -> #76b600   blue 0.023 -> 0    hue 78.8 -> 81.1 deg
 *      player     #f0c898 -> #fdc574   no clamp           hue 32.7 -> 35.5 deg
 *
 *    That is chroma bought by deleting a channel, which is exactly the trap
 *    `docs/review/field-baseline.md` caught the sky dome in, and it costs R6 — faction
 *    identity is supposed to be legible as HUE. `chromaHeadroom()` below now pushes
 *    each drive to the most chroma ITS OWN hue can carry with nothing clamped.
 *
 * 3. THE PLAYER'S DRIVE WAS NOT A COLOUR DECISION. `#f0c898` is a pale cream at chroma
 *    0.345; the owner's rule off the Homeworld frames is that drives are not always
 *    complementary to the field but are ALWAYS a deliberate saturated colour. It now
 *    mixes 70% toward `yard.accent` — the Fitting Yard's work-light amber, this ship's
 *    home port — and then takes its chroma headroom: `#feb258`, chroma 0.651 (+89%),
 *    hue 32.5 deg against the authored 32.7. THE IDENTITY HUE IS PRESERVED TO 0.2 OF A
 *    DEGREE and only the chroma moves, which is what the old comment claimed and this
 *    one measured. Deliberately NOT cyan: `palette.js`'s player block records that the
 *    drive was moved warm on purpose ("bone-white lamps and a warm drive"), Concord
 *    already owns the saturated cyan drive, and a fourth temperature on this hull is
 *    the thing that document forbids.
 *
 * MEASURED A/B, one pose, simulation paused, throttle forced, the two trees differing
 * by this file alone. `mask` is the share of the 1600x900 frame the plume touches;
 * `p95` is the chroma ladder over that mask; R4's floor is 0.30.
 *
 *   throttle    length, hull lengths      mask, % of frame        p95 chroma
 *   0.00        0.100 -> 0.160            0.040 -> 0.048          0.275 -> 0.314
 *   0.30        0.565 -> 1.091            0.086 -> 0.158          0.412 -> 0.514
 *   0.54        0.937 -> 1.409            1.102 -> 1.590          0.325 -> 0.416
 *   1.00        1.650 -> 1.860            6.579 -> 8.507          0.333 -> 0.380
 *
 * Highlight clipping stays at 0.00% of frame at every row, so none of this was bought
 * on the ACES shoulder. R4 is met at cruise — 1.860 hull lengths and p95 0.380 — and
 * the row that moved most is 0.30, the throttle a capital ship holds while it fights.
 *
 * READ THE CHROMA COLUMN WITH ITS N. Length is exact and repeats to the metre. Chroma
 * does not: it is a percentile over the mask, film grain runs on the wall clock so two
 * captures of a paused frame are not identical, and the 0.00 row's mask is ~600 px.
 * Over three runs the 0.30/0.54/1.00 rows repeated to within 0.006 (1.00 was 0.380 all
 * three times); the 0.00 row moved 0.282 / 0.314 / 0.286. Do not quote it to 3 places.
 *
 * AND THE COUPLING IS INTACT, which is the point of the file: max plume metres on the
 * player cruiser reads 224 at zero throttle, 2604 at full, 819 at half engine health,
 * and EXACTLY 0 with the drives destroyed. Half-health over full is 0.315, against
 * 0.295 on the tree this replaces — the damage read is not compressed by the new curve,
 * because the curve is on throttle and the healths stay outside it.
 *
 * WHAT DID NOT CHANGE, DELIBERATELY: VERT and FRAG are byte-identical to the tree this
 * lands on. This file took every frame in the game to black once (D67, below) through
 * one line of fragment maths, so the whole of this pass is CPU-side constants plus a
 * non-finite guard on the instance data. Program count is therefore unchanged by
 * construction, not by hope: 60 before, 60 after.
 */

import * as THREE from 'three';
import { scratch } from '../core/world.js';
import { getFactionPalette, saturate, mix, paletteColor } from '../art/palette.js';
import {
  instancedQuad, markVFXMaterial, factionVFX, FACTION_ORDER, shipForward, shipLocalToWorld,
  hdr, RangeUploader,
} from './common.js';

/**
 * Plume length as a FRACTION OF HULL LENGTH, which is the unit R4 is stated in, plus
 * the two shape constants that decide how that length is spent.
 *
 *   idle  0.16   a live drive is never dark, but a parked one is only a bell glow.
 *                224 m on the 1400 m cruiser, against 1.86 hull lengths at flank —
 *                an 11.6x live-to-flank read, and a DEAD drive still draws nothing.
 *   burn  1.70   1.86 hull lengths at flank, against R4's floor of 1.50.
 *   spool 0.5    the exponent on throttle. See item 1 in the header: R4 says "at
 *                cruise" and the fleet cruises at throttle 0.54, so a ramp that is
 *                linear in throttle spends its whole budget on the one throttle
 *                setting a capital ship almost never holds.
 *
 * GIRTH. The bell is still the bell at rest (0.85 of the drive radius), but a plume
 * that triples in length at a fixed width stops being a plume and becomes a wire: at
 * flank the old ribbon was 121.8 m across 2310 m, 19.0:1. Real exhaust expands into
 * vacuum and so does this one, to 1.40x the bell radius at flank — 162.4 m across
 * 2604 m, 16.0:1, measured off the instance buffers and not from these constants.
 */
const PLUME = { idle: 0.16, burn: 1.70, spool: 0.5, girth: 0.85, flare: 0.55 };

/** How far the player's drive is mixed toward the yard's work-light amber. */
const DRIVE_GOLD = 0.70;

const _hue = new THREE.Color();

/**
 * The largest amount `art/palette.js#saturate` can be given for this colour before ANY
 * channel hits the [0,1] clamp inside it — i.e. the point past which it stops being a
 * chroma move and becomes a hue rotation, or worse, a deleted channel.
 *
 * `saturate` works on LINEAR components about the linear-luminance point, so the bound
 * is per channel: a channel above the luminance runs out at `(1 - l) / (c - l)`, one
 * below it runs out at `l / (l - c)`. The 0.985 is headroom for the hex round-trip
 * `saturate` does on the way out; without it the quantised result can land one LSB
 * past the clamp. A neutral colour has no bound at all, hence the finite check.
 *
 * BUILD TIME ONLY — four calls, in the constructor. The array literal below allocates,
 * which is why this says so rather than claiming the file's no-allocation rule applies
 * to it; that rule is about `sample()` and everything it reaches.
 */
function chromaHeadroom(hex) {
  _hue.setHex(hex, THREE.SRGBColorSpace);
  const l = _hue.r * 0.2126 + _hue.g * 0.7152 + _hue.b * 0.0722;
  let a = Infinity;
  for (const c of [_hue.r, _hue.g, _hue.b]) {
    if (c > l) a = Math.min(a, (1 - l) / (c - l));
    else if (c < l) a = Math.min(a, l / (l - c));
  }
  return Number.isFinite(a) ? Math.max(1, a * 0.985) : 1;
}

const VERT = /* glsl */ `
  uniform float uTime;

  attribute vec3 aOrigin;
  attribute vec3 aDir;      // unit, points AFT - the way the plume extends
  attribute vec4 aParams;   // length, radius, intensity, seed
  attribute vec3 aColor;

  varying vec2 vUv;
  varying vec3 vColor;
  varying float vIntensity;
  varying float vSeed;

  void main() {
    vUv = uv;
    vColor = aColor;
    vIntensity = aParams.z;
    vSeed = aParams.w;

    vec3 a = aOrigin;
    vec3 b = aOrigin + normalize(aDir) * aParams.x;

    vec3 av = (modelViewMatrix * vec4(a, 1.0)).xyz;
    vec3 bv = (modelViewMatrix * vec4(b, 1.0)).xyz;
    vec3 axis = bv - av;
    float len = length(axis);
    vec3 d = len > 1e-4 ? axis / len : vec3(0.0, 1.0, 0.0);

    vec3 mid = mix(av, bv, position.y + 0.5);
    vec3 toEye = normalize(-mid);
    vec3 side = cross(d, toEye);
    float sl = length(side);
    side = sl > 1e-4 ? side / sl : vec3(1.0, 0.0, 0.0);

    // The quad is authored at the widest section; the taper is done in the fragment
    // so the silhouette stays soft instead of showing a hard triangular edge.
    vec3 p = mid + side * (position.x * aParams.y * 2.0);
    gl_Position = projectionMatrix * vec4(p, 1.0);
  }
`;

const FRAG = /* glsl */ `
  uniform float uTime;

  varying vec2 vUv;
  varying vec3 vColor;
  varying float vIntensity;
  varying float vSeed;

  void main() {
    // 0 at the bell, 1 at the tail.
    //
    // THE CLAMP IS LOAD-BEARING. It used to be a bare vUv.y, and the pow(t, 0.72) a few
    // lines down is undefined for a negative base in GLSL -- it returns NaN. A NaN in an
    // additively-blended plume poisons everything composited after it, so the whole frame
    // went black rather than the plume merely looking wrong.
    //
    // That is defect D67, and it is why the 'close' shot in tools/shots.json -- the frame
    // the hull's surface is judged from, and the evidence for D-INT1 -- rendered at
    // contrast 0.0129 with 99.31% near-black pixels for two full waves of work. That
    // framing contains no visible engine plume at all, which is exactly why nobody looked
    // here: the geometry at fault is off-screen and it still took the picture down.
    //
    // Measured by: node tools/widediag.mjs close --assert
    // which patches this one line into the live material at runtime and re-measures.
    // Guards fired without it: FRAME IS FLAT OR EMPTY, FRAME IS ESSENTIALLY BLACK.
    // Guards fired with it: none.
    float t = clamp(vUv.y, 0.0, 1.0);
    float across = abs(vUv.x * 2.0 - 1.0);

    // Bell-mouth flare then a long taper. Fully parabolic looks like a cone of
    // light; the small flare at t=0 is what makes it read as coming OUT of something.
    float flare = 0.55 + 0.45 * smoothstep(0.0, 0.10, t);
    float halfW = flare * (1.0 - pow(t, 0.72)) + 0.02;
    float edge = 1.0 - across / max(halfW, 1e-3);
    if (edge <= 0.0) discard;

    float core = pow(edge, 6.0);
    float glow = pow(edge, 1.7);

    // Shock diamonds - the tell that this is a throttled drive and not a lamp.
    //
    // CONFINED TO THE BELL, and stated at a frequency that assumes it. They used to be
    // 0.82 + 0.18 * sin(t * 34.0) spread over the WHOLE plume, which was survivable
    // at 742 m and is not at 2310 m: five diamonds over 2.3 km is one every 430
    // metres, which is not a shock train, it is a barber pole. exp(-t * 7.0) puts
    // them in the first seventh of the plume where a real one has them, and the
    // frequency goes up to keep the spacing in METRES roughly where it was.
    float diamonds = 1.0 + 0.20 * exp(-t * 7.0) * sin(t * 88.0 - uTime * 2.2 + vSeed * 6.28);
    // Combustion flicker, low amplitude; big flicker reads as a broken shader.
    float flicker = 0.93 + 0.07 * sin(uTime * 23.0 + vSeed * 51.0);

    // 0.95, not 1.10: the plume is three times longer than it was, and the old
    // exponent spent that length on pixels too dim to see. R4 wants the trail read at
    // range, which is a question about the last third of it.
    float along = pow(1.0 - t, 0.95);

    // Weighted towards glow rather than core. The core term is pow(edge, 6.0) -- a
    // two-pixel centreline -- and at hdr x2.9 it lands on the ACES shoulder as white,
    // so the old 0.55/1.25 split made a white wire with a coloured skirt and R4's
    // "peak chroma" had nowhere to live. 1.15/0.85 makes the ribbon a broad coloured
    // band that still has a hot line down the middle.
    vec3 col = vColor * (glow * 1.15 + core * 0.85) * along * diamonds * flicker;
    // White-hot throat: hottest right at the bell, gone by a third of the way down.
    // 1.30, not 1.70: this term is achromatic by construction, so every unit of it is
    // chroma removed from the one measurement R4 makes of the plume's colour. Measured
    // over the plume mask, p95 absolute chroma was 0.290 at the close pose against
    // R4's floor of 0.30; the throat is what was eating it.
    col += vec3(1.0, 0.97, 0.93) * core * pow(1.0 - t, 4.5) * 1.30 * flicker;

    gl_FragColor = vec4(col * vIntensity, 1.0);
  }
`;

export class EngineVFX {
  constructor(world, { capacity = 96, rng } = {}) {
    this.world = world;
    this.capacity = capacity;
    this.rng = rng;
    this.count = 0;
    /** Instances dropped this frame because live state handed `push` a non-finite float. */
    this.rejected = 0;

    this.origin = new Float32Array(capacity * 3);
    this.dir = new Float32Array(capacity * 3);
    this.params = new Float32Array(capacity * 4);
    this.col = new Float32Array(capacity * 3);
    this.seeds = new Float32Array(capacity);
    for (let i = 0; i < capacity; i++) this.seeds[i] = rng ? rng.next() : i * 0.113;

    const geo = instancedQuad(capacity);
    this.aOrigin = new THREE.InstancedBufferAttribute(this.origin, 3);
    this.aDir = new THREE.InstancedBufferAttribute(this.dir, 3);
    this.aParams = new THREE.InstancedBufferAttribute(this.params, 4);
    this.aColor = new THREE.InstancedBufferAttribute(this.col, 3);
    geo.setAttribute('aOrigin', this.aOrigin);
    geo.setAttribute('aDir', this.aDir);
    geo.setAttribute('aParams', this.aParams);
    geo.setAttribute('aColor', this.aColor);
    geo.instanceCount = 0;

    this.material = markVFXMaterial(new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 } },
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: true,
      side: THREE.DoubleSide,
    }), 'plumes');

    this.mesh = new THREE.Mesh(geo, this.material);
    this.mesh.name = 'vfx:plumes';
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 10;

    /**
     * `factionVFX(f).engine` is the faction's engine hex at hdr x2.9. The plume takes a
     * derived hex instead — see items 2 and 3 in the header. Everything else on the
     * shared palette (muzzle, tracer, shield) is untouched, because R4 is about drives
     * and a chroma push applied to every effect in the game is a grade.
     *
     * The intensity stays at 2.9, the same as every other consumer of `p.engine`, and
     * that was a measurement rather than an omission. Sweeping the same gold at 2.9 and
     * 3.8 at the flank pose: mask 91,314 -> 127,882 px (+40%) for p95 chroma 0.365 ->
     * 0.380 (+0.015). Nearly all of that growth is bloom skirt — veiling glare laid over
     * the field the background streams are building — so the plume's read is bought here
     * in length and girth, which are its own pixels, and not in exposure.
     */
    this.palettes = Object.create(null);
    const gold = paletteColor('yard.accent');
    for (const f of FACTION_ORDER) {
      const vfx = factionVFX(f);
      const authored = getFactionPalette(f).engine;
      // Only the player's drive is re-hued, and only because it is the only one that
      // was not already a saturated colour. The other three needed the clamp removed,
      // not a new hue: theirs are their faction identity.
      const base = f === 'player' ? mix(authored, gold, DRIVE_GOLD) : authored;
      this.palettes[f] = {
        ...vfx,
        engine: hdr(saturate(base, chromaHeadroom(base)), 2.9, `vfx.enginePlume.${f}`),
      };
    }

    this._upload = new RangeUploader([this.aOrigin, this.aDir, this.aParams, this.aColor]);
    this._fwd = new THREE.Vector3();
  }

  /**
   * Throttle demand, 0..1, from whichever body type the ship has. Plane-locked hulls
   * carry an explicit throttle; free bodies (strike craft, missiles) do not, so their
   * burn is inferred from how hard they are actually moving.
   */
  static throttleOf(ship) {
    const b = ship.body;
    if (!b) return 0;
    if (b.throttle !== undefined && ship.planeLocked) return Math.max(0, Math.min(1, b.throttle));
    const max = b.maxSpeed || 1;
    return Math.max(0, Math.min(1, b.velocity.length() / max));
  }

  /** 0..1 health of a ship's drives. Destroyed subsystems read exactly zero. */
  static engineHealth(ship) {
    if (!ship.subsystems || ship.subsystems.size === 0) return ship.dead ? 0 : 1;
    let hp = 0, max = 0, found = false;
    for (const s of ship.subsystems.values()) {
      if (s.def.kind !== 'engine') continue;
      found = true;
      hp += s.destroyed ? 0 : s.hp;
      max += s.maxHP;
    }
    if (!found) return ship.dead ? 0 : 1;
    return max > 0 ? Math.max(0, Math.min(1, hp / max)) : 0;
  }

  begin() { this.count = 0; this.rejected = 0; }

  /**
   * @returns {boolean} true if the instance was written.
   *
   * A NON-FINITE INSTANCE IS A DIFFERENT AND MILDER FAILURE THAN D67, AND THIS SAYS SO
   * BECAUSE IT WAS MEASURED RATHER THAN ASSUMED. `body.throttle = NaN` was injected into
   * the live game at full burn on the UNGUARDED tree, the one this lands on: the frame
   * did NOT go black. Mean luma over a 160x90 sample went 0.1350 -> 0.1287 -> 0.1347 as
   * the NaN went in and came out, and the plume simply VANISHED. The vertex stage eats it —
   * `len > 1e-4` is false for NaN so the branch takes the fallback, `mid` comes out
   * non-finite, and a non-finite `gl_Position` produced no fragments on this rasteriser.
   * D67 was worse precisely because it was born AFTER rasterisation, where discard
   * cannot reach it.
   *
   * So this guard is not a fix for a black frame. It buys two smaller things. It makes
   * the failure COUNTED instead of invisible — a drive that quietly stops drawing is how
   * you lose the subsystem read without anyone noticing — and it stops relying on
   * "a NaN clip coordinate happens to be culled", which is implementation-defined and
   * was verified on exactly one GPU.
   *
   * `docs/review/field-baseline.md` measured 0 non-finite floats over 2 live instances,
   * so in normal play the guard drops nothing. Under the same injection WITH the guard:
   * live instances 2 -> 0, `rejected` 0 -> 2, both restored on the frame after.
   *
   * The colours are not checked. They are per-faction constants built once in the
   * constructor from palette hexes; the arguments below are the ones that come from
   * live simulation state, which is where a NaN can actually be born.
   */
  push(x, y, z, dx, dy, dz, length, radius, intensity, color) {
    if (this.count >= this.capacity) return false;
    if (!(Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z)
      && Number.isFinite(dx) && Number.isFinite(dy) && Number.isFinite(dz)
      && Number.isFinite(length) && Number.isFinite(radius) && Number.isFinite(intensity))) {
      this.rejected++;
      return false;
    }
    const i = this.count++;
    const i3 = i * 3, i4 = i * 4;
    this.origin[i3] = x; this.origin[i3 + 1] = y; this.origin[i3 + 2] = z;
    this.dir[i3] = dx; this.dir[i3 + 1] = dy; this.dir[i3 + 2] = dz;
    this.params[i4] = length;
    this.params[i4 + 1] = radius;
    this.params[i4 + 2] = intensity;
    this.params[i4 + 3] = this.seeds[i];
    this.col[i3] = color.r; this.col[i3 + 1] = color.g; this.col[i3 + 2] = color.b;
    return true;
  }

  /** Rebuild every plume in the scene from live ship state. */
  sample(time) {
    this.begin();
    const ships = this.world.ships;
    for (let s = 0; s < ships.length; s++) this.pushShip(ships[s]);
    this.commit(time);
  }

  pushShip(ship) {
    if (!ship || ship.dead) return;
    const pal = this.palettes[ship.faction] ?? this.palettes.player;

    const health = EngineVFX.engineHealth(ship);
    if (health <= 0.001) return;          // dead drives do not burn. This is the read.

    let throttle = EngineVFX.throttleOf(ship);
    // Power routing starves the drive as well as damaging it.
    if (ship.power?.unlocked) throttle *= Math.max(0.25, Math.min(1.4, ship.power.factor('engines')));

    const drive = Math.max(0, Math.min(1.25, throttle));
    const burn = Math.max(0, Math.min(1.25, drive * health));
    // Idle glow: a live drive is never completely dark, but it is only a bell glow.
    const level = 0.12 + burn * 0.88;

    /**
     * LENGTH AND GIRTH ONLY. `burn` above still owns BRIGHTNESS, linearly, and that is
     * the gameplay read this file exists for — see the module header.
     *
     * The curve is on the throttle demand and the healths stay OUTSIDE it, deliberately.
     * Curving `burn` itself would compress the damage read: a drive at half health would
     * draw 0.71 of its full length instead of 0.50, and "you shot the destroyer's engines
     * out" has to stay legible as a length as well as a brightness. Health enters here
     * linearly and again as `subHealth` at the call, exactly as it did before.
     *
     * SAFE OVER THE WHOLE DOMAIN, and this is the file where that sentence has to be
     * earned. `drive` is clamped to [0, 1.25] one line above, so `Math.pow` never sees a
     * negative base — which is the ENTIRE mechanism of D67, in `FRAG` above, where
     * `pow()` of a negative returned NaN in GLSL and took every frame in the game with
     * it. The only non-finite input here is a non-finite `throttle`, which the clamp
     * propagates as NaN exactly as the old multiply did, and which `push()` now rejects.
     * Verified, not asserted: a 201^3 grid over throttle x health x subHealth crossed
     * with the power-factor extremes, 8,282,205 samples, ZERO non-finite outputs, length
     * bounded 224.00 .. 2884.92 m and intensity 0.0350 .. 1.2250. Over the pathological
     * set {NaN, +-Infinity, -0, -1, 1e-320, 1e308, MAX_VALUE} x power x health the new
     * expression yields 54 non-finite results of 96 and the SHIPPED one yields 61, so
     * this is strictly no worse than what it replaces, and every one of the 54 is now
     * dropped by `push()`. Numbers are in the W6-C report.
     */
    const spool = Math.pow(drive, PLUME.spool) * health;
    const girth = PLUME.girth + PLUME.flare * spool;

    const fwd = shipForward(ship, this._fwd);
    const dx = -fwd.x, dy = -fwd.y, dz = -fwd.z;

    /**
     * THE UNIT R4 IS STATED IN. `length` is the class's hull length in metres; the
     * fallback is the old bell-relative figure so a class that somehow has drives and
     * no length still gets a plume rather than a zero-length one.
     */
    const hullLen = ship.classDef?.length ?? 0;

    let found = false;
    if (ship.subsystems) {
      for (const sub of ship.subsystems.values()) {
        if (sub.def.kind !== 'engine' || sub.destroyed) continue;
        found = true;
        const subHealth = Math.max(0, Math.min(1, sub.hp / sub.maxHP));
        const r = sub.def.radius;
        const L = hullLen > 0 ? hullLen : r * 12;
        // The cached world position is only refreshed on a sim step; recompute so
        // plumes do not lag the hull between steps.
        const [lx, ly, lz] = sub.def.position;
        shipLocalToWorld(ship, lx, ly, lz, scratch.v1);
        this.push(
          scratch.v1.x + dx * r * 0.4, scratch.v1.y + dy * r * 0.4, scratch.v1.z + dz * r * 0.4,
          dx, dy, dz,
          // Length in hull lengths, because that is the unit R4 is stated in. Radius is
          // still anchored to the bell — it is the bell that sets the scale — but it
          // opens with the spool, because an exhaust that is 2.6 km long and 122 m wide
          // is a wire and not a plume.
          L * (PLUME.idle + PLUME.burn * spool * subHealth),
          r * girth,
          (0.10 + 0.90 * burn) * (0.35 + 0.65 * subHealth),
          pal.engine,
        );
      }
    }

    if (!found) {
      // No declared drives (strike craft, probe stand-ins): one plume at the stern.
      const len = hullLen > 0 ? hullLen : 60;
      shipLocalToWorld(ship, 0, 0, -len * 0.46, scratch.v1);
      this.push(
        scratch.v1.x, scratch.v1.y, scratch.v1.z, dx, dy, dz,
        len * (PLUME.idle + PLUME.burn * spool), len * 0.10 * girth, level, pal.engine,
      );
    }
  }

  commit(time) {
    this.material.uniforms.uTime.value = time;
    this.mesh.geometry.instanceCount = this.count;
    if (this.count === 0) return;
    this._upload.upload(0, this.count - 1);
  }

  dispose() {
    this.mesh.geometry.dispose();
    this.material.dispose();
  }
}
