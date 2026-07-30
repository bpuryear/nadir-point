/**
 * CELESTIAL COMPOSITION, PER POINT OF INTEREST.
 *
 * `CELESTIAL_SPECS` is the single source of truth for what is in the sky at a POI
 * *and* for where its light comes from. The lighting rig reads `sunDir` from here,
 * the star is drawn along `sunDir`, and the gas giant's terminator is computed from
 * `sunDir`. There is no second copy of that vector to fall out of sync.
 *
 * Every colour is derived from the POI's locked palette through `mix`/`shade`, so a
 * location's sky, its key light and its hull tints are all the same small set of
 * hues seen three different ways. That is why a frame from one POI is instantly
 * distinguishable from a frame from another.
 *
 *   giant-orbit  a banded blue giant filling a third of frame, ringed, half lit by a
 *                small off-frame sun; cold planetshine, a thin nebula band far away.
 *   graveyard    no near star. A pinprick sun low and cold, a derelict green nebula
 *                bank doing all the fill, and the same banded giant that `giant-orbit`
 *                sits over, 760 map units away and small. Dark, and coloured.
 *   near-star    the primary at five degrees across, wide halo, everything else
 *                crushed. A hot dust band and almost no visible stars.
 *
 * ===========================================================================
 * WHERE THE FIELD POINTS IS NOT A FREE CHOICE, AND IT WAS WRONG
 * ===========================================================================
 *
 * `docs/design/reference-frames.md` §0: in all six owner references the background is
 * a large, saturated, luminous object; in ours it was black. The graveyard authors
 * 7200 stars and a FOURTEEN-layer nebula and none of it read. It was not intensity.
 * Measured on the live game (background isolated by rendering each pose twice, once
 * normally and once with `world.scene` hidden, so the unchanged pixels ARE background):
 *
 *   shot          nebula centre off the view axis      background median luma
 *   engagement    116.4 deg  (BEHIND the camera)       0.0261
 *   close         147.7 deg  (BEHIND the camera)       0.0076
 *   wide           55.2 deg  (just off frame)          0.0146
 *
 * The tactical camera looks DOWN at the combat plane — its forward vector at the
 * shipped `engagement` pose is (-0.316, -0.586, -0.746) — and every nebula band in
 * this file was aimed at or above the horizon on a bearing nobody had checked against
 * a camera. A band you cannot see is worth exactly as much as no band.
 *
 * Two changes follow, and both are stated as directions here because this file is the
 * single source of truth for what is in the sky:
 *
 *   1. Every `nebula.centre` is aimed BELOW the horizon (y between -0.20 and -0.32),
 *      because that is where a camera pitched 12-36 degrees down spends most of its
 *      frame. `nebula.js#buildNebula` elongates a band along `centre x (0,1,0)`, which
 *      is horizontal for any centre that is not near-polar, so a low centre gives a
 *      band that lies ACROSS the frame rather than over the top of it.
 *   2. `dome` is new: one inward-facing sphere carrying a near-black vertical gradient
 *      in the POI's own hue plus a broad lobe on the band's axis. It is the coloured
 *      darkness, not a light. See `skydome.js` for the measurement it answers and for
 *      why a band alone cannot answer it (the camera's yaw is free; a band is not).
 */

import * as THREE from 'three';
import { getPOIPalette, NEUTRAL, mix, shade, saturate } from '../../art/palette.js';
import { buildStarfield } from './starfield.js';
import { buildNebula } from './nebula.js';
import { buildGasGiant } from './gasgiant.js';
import { buildStar } from './star.js';
import { buildSkyDome } from './skydome.js';
import { ORDER } from './common.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z).normalize();

/**
 * Build a gas giant colour ramp out of a POI palette. Bright zones first, deep belt
 * last; the planet shader indexes it and the polar hood blends towards the tail.
 */
function giantRamp(pal) {
  return [
    mix(NEUTRAL.ice, pal.accent, 0.34),                 // 0 bright zone
    mix(pal.accent, NEUTRAL.ice, 0.30),                 // 1 zone
    pal.accent,                                          // 2 mid belt
    mix(pal.accent, pal.fill.color, 0.68),              // 3 belt
    mix(pal.fill.color, pal.ibl.horizon, 0.62),         // 4 dark belt
    mix(pal.ibl.horizon, pal.shadow, 0.55),             // 5 deep / polar
  ];
}

export const CELESTIAL_SPECS = {
  // -------------------------------------------------------------------------
  'giant-orbit': {
    poiPalette: 'giant-orbit',
    // 96 degrees of elongation from the planet: a clean vertical terminator on the
    // giant AND a hard raking key on the fleet. Low (20 deg) for long shadows.
    sunDir: V(0.776, 0.347, -0.526),
    background: NEUTRAL.spaceBlack,
    starfield: { count: 7000, gain: 0.95, bandDensity: 0.50, bandAxis: [0.28, 0.82, -0.50] },
    star: { direction: V(0.776, 0.347, -0.526), distance: 26000, angularRadius: 0.0085, coreGain: 30, haloGain: 2.0, shells: 3 },
    /**
     * Centre y was +0.19 and is now -0.20: at the `wide` pose the band sat 55.2 deg
     * off the view axis, i.e. over the top of the frame. Below the horizon it comes to
     * 49.7 deg and its near edge crosses the frame. `close` (yaw 2.35) still cannot
     * see it at all — 138.7 deg — and nothing about a directional band can fix that;
     * the dome below is what carries that framing.
     */
    nebula: {
      centre: [0.2094, -0.20, -0.9572], spread: 0.58, layers: 10, dustLayers: 3,
      intensity: 0.72, radius: 22000, frontRadius: 4600, scale: 1.0,
    },
    /**
     * Cold blue field. Lobe on the band, ecliptic floor in the same hue.
     *
     * `close` is the framing this POI's floor is solved against, because it is the one
     * that can see NO lobe at all — the band sits 138.6 degrees off its view axis, so
     * everything it measures is the ecliptic term. Solved through the fitted response
     * `out = 1.111 * L^0.643`: a background median of 0.115 needs L = 0.0294 at the
     * `close` view direction, and `0.8*ground + 0.2*zenith` there is L = 0.0290 before
     * the band factor of 0.853. Hence baseGain 1.19.
     */
    dome: {
      axis: [0.2094, -0.20, -0.9572], spread: 1.20,
      core: saturate(mix(0x24406e, 0x8fb4ff, 0.34), 1.30),
      zenith: saturate(mix(0x0a1024, 0x24406e, 0.72), 1.25),
      ground: saturate(mix(0x070b16, 0x24406e, 0.62), 1.25),
      gain: 0.24, baseGain: 1.19,
    },
    giant: {
      // 34 degrees across at a 99 degree elongation: about a third of a 16:9 frame,
      // half lit, terminator running down the disc rather than clipping a limb.
      direction: V(-0.6007, -0.2603, -0.7559),
      distance: 9000, radius: 2740, rings: true,
      ringInner: 1.31, ringOuter: 2.14, spin: 1.9, gain: 1.0,
      // Sun 33 degrees above the ring plane (so the ring shadow lands on the LIT
      // hemisphere and is actually visible) and the plane only 15 degrees open to
      // the probe camera (so the rings stay a line, not a plate).
      axis: [0.013, 0.902, -0.431],
    },
  },

  // -------------------------------------------------------------------------
  graveyard: {
    poiPalette: 'graveyard',
    // Low, cold, and almost edge on. Everything here is silhouette and rim.
    sunDir: V(-0.905, 0.145, 0.400),
    background: 0x000000,
    starfield: { count: 7200, gain: 1.25, bandDensity: 0.62, bandAxis: [-0.20, 0.72, 0.66] },
    star: { direction: V(-0.905, 0.145, 0.400), distance: 30000, angularRadius: 0.0022, coreGain: 26, haloGain: 0.55, shells: 3 },
    /**
     * RE-AIMED, AND THIS IS THE SINGLE MEASURED CAUSE OF "THE BACKGROUND IS BLACK".
     *
     * The centre was `[-0.62, 0.10, 0.78]`. The tactical camera at the shipped
     * `engagement` pose looks along `(-0.316, -0.586, -0.746)`: the band was **116.4
     * degrees off the view axis**, which is to say behind the player's shoulder. All
     * fourteen layers of it rendered every frame into pixels nobody was looking at.
     *
     * It now runs on the bearing to `giant-orbit` — the graveyard sits at map
     * `[-190, 60]` and giant-orbit at `[-120, -700]`, and `world/system.js:312` maps
     * `pos` to `(x, 0, z)`, so that bearing is `(70, -760)` normalised to
     * `(0.0917, 0, -0.9958)` — dropped 14 degrees below the plane. Two reasons, both
     * of them checkable rather than aesthetic:
     *
     *   * BELOW, because `nebula.js` elongates the band along `centre x (0,1,0)`, so a
     *     low centre lays the band ACROSS a camera that is looking down at the plane
     *     instead of hanging it over the frame's top edge.
     *   * ON THAT BEARING, because the giant below is on it too. The nebula bank, the
     *     planet and the fill light are then one direction and one composition rather
     *     than three unrelated facts, and `world/lighting/pois.js` points the
     *     graveyard's fill at this same vector — which is what the palette's own
     *     comment ("the nebula IS the fill here") always claimed and never did.
     */
    nebula: {
      centre: [0.0890, -0.2419, -0.9662], spread: 0.78, layers: 14, dustLayers: 5,
      intensity: 1.30, radius: 20000, frontRadius: 4000, scale: 1.15,
      /**
       * Explicit tints, NOT derived from `fill` and `ibl.horizon` the way the other
       * POIs are. The graveyard palette's fill (0x4c6a4a) and horizon (0x14202e) are
       * near-black by design, so the generic derivation produces a nebula that is
       * literally invisible — and this is the one location whose fill light is
       * supposed to be coming from the nebula.
       *
       * THE COLD BLUE TINT IS GONE, and it cost the location its identity. R2 asks for
       * one hue owning the field inside a band 60 degrees wide. Measured on the hexes
       * that were here, the three tints sat at hue **88.3, 91.5 and 212.0 degrees** —
       * a 124 degree spread, because `mix(0xb6c6da, 0x1b2a3a, 0.55)` is a cold blue and
       * `r.int(0, 2)` gave it a third of every layer. Three greens at 86.9, 89.6 and
       * 128.2 degrees span 41. `saturate()` is the only thing raising chroma; every
       * hue below is a graveyard palette hue untouched, because saturate is
       * luminance-preserving and hue-preserving by construction.
       */
      tints: [
        saturate(mix(0x8fb04a, NEUTRAL.ice, 0.32), 1.30),
        saturate(mix(0x4c6a4a, 0x8fb04a, 0.45), 1.25),
        saturate(mix(0x14202e, 0x4c6a4a, 0.80), 1.25),
      ],
    },
    /**
     * Derelict green owns this field. `core` is the palette's own accent pushed on
     * chroma alone; the floor is the same family two stops down, so even the part of
     * the sky with nothing in it is green rather than black. That is the EVE Frontier
     * lesson from the reference set — the darkness is coloured, not absent.
     */
    dome: {
      axis: [0.0890, -0.2419, -0.9662], spread: 1.30,
      /**
       * THE FLOOR IS BUILT FROM THE ACCENT, NOT FROM `fill`, AND THAT IS A CHROMA
       * DECISION WITH A NUMBER BEHIND IT.
       *
       * `graveyard.fill` (0x4c6a4a) has r and b within 2/255 of each other, so no
       * amount of `saturate` gets much absolute chroma out of it — built from it the
       * background measured median chroma **0.0863** at median luma 0.0911, which is
       * within 1% of the arithmetic ceiling for that colour's own channel ratios.
       * `graveyard.accent` (0x8fb04a) has a blue channel at 0.42 of its green, and the
       * same solve gives 0.114 at luma 0.12. Both are graveyard palette hues and
       * `saturate` is hue-preserving, so this moves chroma and nothing else.
       *
       * See the stream report for why 0.18 absolute chroma — R2 as literally written —
       * is not reachable by ANY green-dominant field at R1's luma: green carries a
       * 0.7152 luminance weight, so a pure green at median luma 0.10 tops out at
       * chroma 0.14, and a realistic one at about 0.12.
       */
      core: saturate(0x8fb04a, 1.50),
      zenith: saturate(mix(0x4c6a4a, 0x8fb04a, 0.70), 1.50),
      ground: saturate(mix(0x4c6a4a, 0x8fb04a, 0.45), 1.55),
      /**
       * SOLVED AGAINST A MEASURED FRAME, NOT GUESSED, AND THE FIRST GUESS WAS 5x OVER.
       * At gain 0.17 / baseGain 1.05 the `engagement` background measured median luma
       * **0.3777** with 98.8% of the frame above 0.06 — a lit room, not a graveyard.
       * The fitted response `out = 1.111 * L^0.643` predicted 0.3896 for that dome's
       * L = 0.196, which is the model agreeing with the frame to 3%, so it can be
       * inverted. Re-solved for a 0.1225 median against the brighter floor colours
       * above (ground L 0.224 against the old 0.126).
       */
      gain: 0.049, baseGain: 0.170,
    },
    /**
     * THE OWNER RULED: KEEP THE GRAVEYARD, DRESS IT UP. THIS IS THE DRESSING.
     *
     * `giant: null` meant there was no large body in the sky at all, which is half of
     * why the wide read has no scale cue: a 1400 m hull against a starfield is a hull
     * against nothing, and nothing has no size.
     *
     * This is the SAME banded giant `giant-orbit` sits over, seen from 760 map units
     * away, so it is astronomically correct and it is a destination the player can see
     * and travel to. Direction is the in-plane bearing above, dropped 28 degrees below
     * the combat plane — the tactical camera pitches 12-36 degrees DOWN, so a body on
     * the horizon leaves the top of the frame; at -28 it lands at NDC (0.61, 0.20) in
     * the shipped `engagement` pose, right of centre and just above the middle.
     *
     * SMALL, DELIBERATELY: `asin(1630/24000)` is 3.9 degrees of angular radius, about
     * 150 px of disc in a 900 px frame with the ring line reaching 330 px. Big enough
     * to carry a terminator and a ring, far too small to take the frame off the ship —
     * `giant-orbit` is the place where the planet is the subject and this is not it.
     *
     * The axis is `giant-orbit`'s, unchanged, for continuity: it is the same planet.
     * `sunDir` is the graveyard's, so the terminator is lit by the pinprick sun that
     * lights everything else here and the disc is a phase rather than a flat coin.
     * 512 rather than 1024 texels: at 150 px of disc, 1024 is texture memory and boot
     * time spent on detail no frame can resolve.
     */
    giant: {
      direction: V(0.0810, -0.4695, -0.8792),
      distance: 24000, radius: 1630, rings: true,
      ringInner: 1.34, ringOuter: 2.14, spin: 2.6, gain: 0.90,
      axis: [0.013, 0.902, -0.431],
      textureSize: 512,
    },
  },

  // -------------------------------------------------------------------------
  'near-star': {
    poiPalette: 'near-star',
    // Just inside the frame edge so the god-ray pass has a real anchor.
    sunDir: V(0.560, 0.300, -0.772),
    background: 0x000000,
    starfield: { count: 2600, gain: 0.30, bandDensity: 0.35, bandAxis: [0.55, 0.60, 0.58] },
    star: {
      direction: V(0.560, 0.300, -0.772), distance: 16000, angularRadius: 0.042,
      coreGain: 40, haloGain: 1.7, shells: 3, wideHalo: true,
    },
    nebula: {
      centre: [0.2951, -0.24, -0.9245], spread: 0.85, layers: 8, dustLayers: 2,
      intensity: 0.36, radius: 19000, frontRadius: 4200, scale: 1.35,
    },
    /**
     * Hot dust. One warm hue, and the floor is the same rust two stops down.
     *
     * NOT MEASURED ON A FRAME, and that is stated rather than hidden: no shot in
     * `tools/shots.json` visits `near-star`, so this is carried on the arithmetic
     * that solved the other two — core L 0.104 x gain, ecliptic L ~0.028 x baseGain,
     * which puts it in the same band as `giant-orbit` before this POI's own exposure
     * 0.86 and vignette 0.52 pull it back down. It should be shot before anyone
     * quotes a number for it.
     */
    dome: {
      axis: [0.2951, -0.24, -0.9245], spread: 1.25,
      core: saturate(mix(0x5a2c12, 0xff7a2a, 0.30), 1.20),
      zenith: saturate(mix(0x120804, 0x5a2c12, 0.80), 1.20),
      ground: saturate(mix(0x1a0c05, 0x5a2c12, 0.72), 1.20),
      gain: 0.26, baseGain: 0.95,
    },
    giant: null,
  },
};

/**
 * Build the far-scene contents for a POI.
 *
 * @param {string} poiId
 * @param {Object} p
 * @param {import('../../core/rng.js').RNG} p.rng
 * @param {THREE.Scene} [p.far]   if given, the result is added to it
 * @param {Object} [p.overrides]  shallow-merged over the spec
 * @returns {{root:THREE.Group, sunDir:THREE.Vector3, spec:Object, parts:Object,
 *            update:Function, dispose:Function}}
 */
export function buildCelestials(poiId, { rng, far = null, overrides = {} } = {}) {
  const spec = { ...(CELESTIAL_SPECS[poiId] ?? CELESTIAL_SPECS['giant-orbit']), ...overrides };
  const pal = getPOIPalette(spec.poiPalette ?? poiId);
  const r = rng.fork(`celestials:${poiId}`);

  const root = new THREE.Group();
  root.name = `celestials:${poiId}`;

  const parts = {};

  /*
   * --- the coloured darkness, first and behind everything ------------------
   *
   * Built before the starfield so the scene graph reads in draw order; the actual
   * ordering is `ORDER.dome` (-1) with depth test off, not insertion order.
   */
  if (spec.dome) {
    parts.dome = buildSkyDome(spec.dome);
    root.add(parts.dome.object);
  }

  // --- starfield -----------------------------------------------------------
  parts.starfield = buildStarfield({ rng: r, ...spec.starfield });
  root.add(parts.starfield.object);

  // --- nebula --------------------------------------------------------------
  if (spec.nebula) {
    // Emission tints: the POI accent, the fill (its bounce colour) and one cooled
    // deep tone. Three hues, no more — the sky must not out-colour the ships.
    const tints = spec.nebula.tints ?? [
      mix(pal.accent, NEUTRAL.ice, 0.20),
      pal.fill.color,
      mix(pal.ibl.horizon, pal.accent, 0.35),
    ];
    parts.nebula = buildNebula({
      rng: r,
      tints,
      dustTint: shade(pal.shadow, 0.75),
      ...spec.nebula,
    });
    root.add(parts.nebula.object);
  }

  // --- the primary ---------------------------------------------------------
  if (spec.star) {
    parts.star = buildStar({
      rng: r,
      core: mix(pal.key.color, NEUTRAL.select, 0.10),
      halo: mix(pal.key.color, pal.accent, 0.28),
      ...spec.star,
    });
    root.add(parts.star.object);
  }

  // --- the hero ------------------------------------------------------------
  if (spec.giant) {
    parts.giant = buildGasGiant({
      rng: r,
      sunDir: spec.sunDir,
      ramp: spec.giant.ramp ?? giantRamp(pal),
      colors: {
        sun: pal.key.color,
        night: mix(pal.shadow, pal.fill.color, 0.55),
        rim: mix(pal.accent, NEUTRAL.ice, 0.35),
        aurora: mix(pal.accent, NEUTRAL.friendly, 0.30),
        storm: mix(NEUTRAL.select, pal.accent, 0.22),
        // Cool and dark. A warm bright ring next to a cold planet becomes the
        // brightest thing in frame and steals the composition from the hero.
        ringDust: mix(NEUTRAL.rock, NEUTRAL.rockDark, 0.42),
        ringIce: mix(NEUTRAL.ice, NEUTRAL.rock, 0.45),
        nightGain: 0.055,
        rimGain: 0.85,
        auroraGain: 0.30,
        haloGain: 0.55,
        ringGain: 0.60,
        ringAmbient: 0.055,
        ringTau: 0.72,
      },
      ...spec.giant,
    });
    root.add(parts.giant.object);
  }

  root.updateMatrixWorld(true);

  if (far) {
    far.add(root);
    far.background = new THREE.Color().setHex(spec.background ?? NEUTRAL.spaceBlack, THREE.SRGBColorSpace);
  }

  return {
    root,
    parts,
    spec,
    sunDir: spec.sunDir.clone(),
    palette: pal,
    /** Order constants, so callers can slot their own celestials into the stack. */
    ORDER,
    /** Refresh view-dependent uniforms. Cheap; safe to skip on a static shot. */
    update(farCamera) {
      parts.giant?.refresh(farCamera);
    },
    dispose() {
      root.parent?.remove(root);
      for (const k of Object.keys(parts)) parts[k]?.dispose?.();
    },
  };
}

/**
 * Installer, in the shape `game.js` calls. Idempotent: a second call returns the
 * instance already installed rather than stacking a second sky on the first.
 *
 *   installCelestials(world, 'giant-orbit', ctx)
 *
 * Registers a render-rate system (order 60) that refreshes the gas giant's
 * view-dependent uniforms. It runs at render rate, not sim rate, because the far
 * camera moves while paused.
 */
export function installCelestials(world, poiId = 'giant-orbit', ctx = {}) {
  if (world.systems.celestials) return world.systems.celestials;

  const sky = buildCelestials(poiId, {
    rng: ctx.rng ?? world.rng.fork(`celestials:${poiId}`),
    far: world.far,
  });

  const system = {
    name: 'celestials',
    order: 60,
    update() { sky.update(world.renderer?.farCamera ?? null); },
  };
  world.engine?.addRender(system);

  const api = {
    ...sky,
    dispose() {
      sky.dispose();
      const list = world.engine?.renderSystems;
      if (list) {
        const i = list.indexOf(system);
        if (i >= 0) list.splice(i, 1);
      }
      delete world.systems.celestials;
    },
  };
  world.register('celestials', api);
  return api;
}

export { buildStarfield, buildNebula, buildGasGiant, buildStar, buildSkyDome, ORDER };
