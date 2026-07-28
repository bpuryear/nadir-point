/**
 * LOCKED PALETTES.
 *
 * Every colour in Nadir Point comes from this file. Not "mostly" - every one. The
 * reason is not tidiness: the game's whole visual proposition is that a hull built
 * from mismatched salvage still reads as one object. That only survives if the
 * number of hues in frame is small and deliberate. One stream picking a nice blue
 * by eye is how a game ends up looking like a parts bin.
 *
 * Three faction identities that must be separable at a glance by hue, by material
 * behaviour and by emissive colour - all three, not just hue, because half the time
 * the ship is a silhouette against a gas giant:
 *
 *   coalition  heavy industrial. Warm grey-green steel, orange-amber emissives,
 *              riveted and utilitarian, wide roughness variance so it never reads
 *              as one clean surface.
 *   concord    sleek. Pale blue-white ceramic over metal, cyan-white emissives,
 *              larger cleaner panels, low roughness, tight variance.
 *   derelict   ancient. Desaturated bronze and oxide, sickly green-gold emissives,
 *              pitted and eroded, panel layout that does not obey human right
 *              angles.
 *   player     neutral gunmetal. Deliberately hue-free so bolted-on salvage from
 *              any faction sits on it without a fight.
 *
 * ENFORCEMENT
 *   isPaletteColor(hex)      - is this exact colour legal?
 *   assertPaletteColor(...)  - throw (strict) or record (dev) when it is not
 *   paletteAudit()           - everything illegal that has been seen this session
 *   auditMaterials(root)     - materials in a scene graph not stamped by the
 *                              material registry, i.e. built with `new THREE.…`
 *
 * Derived colours are legal, but only through `shade`/`mix`/`saturate` here, which
 * record their provenance. That way the audit can say "this near-black came from
 * derelict.baseDark darkened 0.4" rather than shrugging.
 *
 * TWO THINGS IN HERE ARE PHYSICS, NOT TASTE, AND BOTH LOOK WRONG UNTIL THEY DO NOT
 *
 * 1. Metal albedo is bright. For a metallic surface the albedo channel IS the
 *    specular reflectance F0 - iron is about 0.56 linear, aluminium 0.91. A
 *    "dark gunmetal" greeble authored at 0x40444a is not dark metal, it is a
 *    black hole, because metals have no diffuse term to fall back on. Anything
 *    with metalness above ~0.7 in this file is authored bright.
 *
 * 2. Painted hull is a dielectric. A coated warship plate is metalness ~0.1-0.3.
 *    Metal only appears where the coating is gone - which is why the wear layer
 *    raises metalness at plate edges instead of the palette raising it globally.
 *
 * POI `intensity` values are in three's physical light units (r155+, legacy
 * lighting removed): a directional light contributes irradiance = colour x
 * intensity, and diffuse out = albedo/PI x irradiance x NdotL. A 0.18-albedo hull
 * needs irradiance around 8 to land mid-frame after ACES. Numbers around 1-3 are
 * the old pre-r155 convention and will render everything as sludge.
 *
 * HOW THE FOUR LIGHT TERMS ARE STATED, AND WHY IT IS NOT LUMINANCE
 *
 * `key.intensity` is absolute. `fill`, `bounce` and `rim` are stated as the PEAK
 * CHANNEL of the irradiance they contribute, and the rig scales each colour so its
 * brightest channel lands on that number (see world/lighting/poi.js). This matters
 * because the fill colours here are deliberately saturated - planetshine is a
 * strongly blue light. Normalising a saturated fill by LUMINANCE, which is what an
 * earlier version of the rig did, silently multiplies its dominant channel by
 * 1/luminance: the 0x3f63b4 planetshine has Y=0.134, so a "6:1" fill arrived with a
 * blue channel two thirds as strong as the key's. That is exactly how a neutral
 * gunmetal hull ends up rendering as saturated cobalt with no terminator, which is
 * the single worst defect this file has ever caused. Peak-channel normalisation
 * keeps the hue and keeps the ratio.
 *
 * The numbers below are calibrated so that, on a 0.13-linear painted hull at
 * metalness 0.18, carried all the way through three's ACES (which pre-scales by
 * exposure/0.6) and the sRGB transfer:
 *   key face  0.72-0.80 in sRGB   (fully lit, NdotL = 1)
 *   45 deg    ~0.60
 *   shadow    near-black, held readable by the RIM and not by ambient
 * Three clean values plus a rim. If you raise the fill, you lose the terminator.
 * The measured check for this is `node tools/surface.mjs <png> --crop ...`, which
 * reports p25/median/p95 on the hull mask. Do not eyeball it.
 *
 * `fill.broad` is how much the fill's colour averages towards neutral because the
 * thing emitting it is an AREA thirty degrees across rather than a point. A gas
 * giant's disc is banded - deep blue belts, white zones, a cream storm - so the
 * light arriving from it is a pale blue, not the colour of its darkest belt. Using
 * the belt colour raw is what turns a neutral gunmetal hull's shadow side into
 * saturated primary blue. `fill.color` stays the location's identity colour, which
 * is what the celestial shader and the ramp derive from; `broad` is only the light.
 */

import * as THREE from 'three';
import { FACTIONS } from '../core/contracts.js';

export const PALETTE_VERSION = 'nadir-point/palette/1';

// ---------------------------------------------------------------------------
// Faction palettes
// ---------------------------------------------------------------------------

/**
 * @typedef {Object} SurfaceSpec
 * @property {number} metalness   base metalness, 0..1
 * @property {number} roughness   base roughness, 0..1
 * @property {number} variance    how far roughness swings panel-to-panel, 0..1
 */

export const FACTION_PALETTES = {
  coalition: {
    id: 'coalition',
    name: 'Coalition',
    blurb: 'Heavy industrial. Built to be repaired in the field by someone angry.',

    // --- albedo ---
    base: 0x707c66,        // warm grey-green steel
    baseAlt: 0x5d6a51,     // second plate tone, for panel-to-panel variance
    baseDark: 0x373b31,    // recessed structure
    plating: 0x828d74,     // secondary armour, slightly brighter
    greeble: 0x9aa094,     // small mechanical detail - METAL, so a bright F0
    trim: 0xc4671b,        // the identity carrier: safety orange
    glass: 0x0a0e11,
    burn: 0x171512,        // carbon scoring
    bare: 0xc6c0af,        // bare metal revealed by edge wear

    // --- emissive ---
    emissive: 0xff9126,    // amber running lights and panel glow
    emissiveHot: 0xffc978,  // core of an emissive, hotter than the halo
    engine: 0xff6a12,      // thruster plume
    warn: 0xff3a18,

    // --- surface behaviour ---
    // A painted warship hull is a DIELECTRIC. Coating over steel is metalness ~0.2,
    // not 0.8. Getting this wrong is why so much sci-fi art reads as dark grey
    // sludge: at high metalness there is no diffuse term, so the faction's albedo
    // stops contributing and every hull collapses to the colour of the sky.
    // Bare metal appears where the coating has worn off - the wear layer raises
    // metalness locally, which is what makes edge wear read as metal and not paint.
    surface: {
      hull: { metalness: 0.22, roughness: 0.62, variance: 0.18 },
      hullDark: { metalness: 0.30, roughness: 0.74, variance: 0.16 },
      plating: { metalness: 0.26, roughness: 0.52, variance: 0.18 },
      greeble: { metalness: 0.86, roughness: 0.42, variance: 0.20 },
      trim: { metalness: 0.10, roughness: 0.54, variance: 0.12 },
    },

    // --- plating layout ---
    /**
     * `tileM` is metres of hull per texture repeat, NOT plate size: a tile holds a
     * dozen or so plates, so a 22 m tile is a ~6 m plate, which is what a yard
     * actually welds. It was raised from 17 because at hero distance the seam
     * DENSITY, not the plate size, is what made the hull read as masonry.
     *
     * `plateContrast` scales every albedo step this layer is allowed to make - the
     * base/alt tone difference, the seam darkening and the recess darkening. At 1.0
     * a hull reads as a brick wall from 400 m. Real plating is nearly one value
     * with thin lines in it; the relief does the work, not the paint.
     *
     * `calm` is the fraction of the tile that is left as plain plate. Homeworld's
     * hulls are roughly 60% calm, 30% medium, 10% dense; ours was 100% medium,
     * which is why no part of the hull could ever earn the eye's attention.
     */
    panel: {
      tileM: 22,           // metres of hull one texture tile covers
      grooveM: 0.28,       // seam width in METRES. Review cap: <= 0.3, no bevel.
      weldM: 0.60,         // proud weld bead width, metres
      weld: 0.40,          // fraction of seams that are a bead rather than a groove
      step: 0.12,          // fraction of plates that step proud or sunk
      stepM: 0.42,         // step height, metres
      rivets: 0.85,        // 0..1 how many strake seams carry a fastener row
      rivetPitchM: 2.2,
      skew: 0.0,           // non-orthogonal panel bias; humans build square
      toneSpread: 0.035,   // per-plate albedo variance, capped at +/-4% by review
      plateContrast: 0.42,
      calm: 0.60,
    },

    // --- weathering ---
    wear: { edge: 0.80, streak: 0.86, grime: 0.58, pit: 0.18, oxide: 0x353120 },

    // --- markings ---
    marking: { ink: 0xd9d3c3, inkDark: 0x161513, hazardA: 0xd6981c, hazardB: 0x191712 },
  },

  concord: {
    id: 'concord',
    name: 'Concord',
    blurb: 'Sleek. Ceramic over metal, built by people who never expect a boarding action.',

    /**
     * PALE IS A RENDERED VALUE, NOT AN AUTHORED ONE, AND THIS PALETTE HAD IT BACKWARDS.
     *
     * These were 0xc6cfd6 / 0xb0bcc6 / 0xd7dee3 - 78% reflectance, near-white paint.
     * That was survivable only because the keys were calibrated two stops low. Carried
     * through ACES at the solved key of 14.0, a fully lit Concord face landed at sRGB
     * **0.955** against the player hull's 0.765: not "pale ceramic" but a white
     * silhouette with no form in it, which the material chart showed as a blown row the
     * moment the key was fixed (docs/probes/materials.png).
     *
     * The lesson is the one already at the top of this file about metal albedo, running
     * the other way: what the player sees is the RENDERED value, and the authored hex
     * only gets there through the light. Solved for a fully lit face at 0.88 - still
     * comfortably the palest faction in the game against player 0.765 and coalition
     * 0.800, and still holding a gradient instead of clipping. The blue-white hue ratio
     * of the original (198 : 207 : 214) is preserved exactly.
     *
     * `greeble` and `bare` are NOT brought down with them: both are metals, where the
     * albedo channel is F0 reflectance rather than a diffuse colour, and darkening a
     * metal's F0 makes it a black hole. That distinction is the whole first note in
     * this file.
     */
    base: 0x868c91,
    baseAlt: 0x7b8185,
    baseDark: 0x495561,
    plating: 0x8f969b,
    greeble: 0xbcc5cd,
    trim: 0x2f7fa8,
    glass: 0x080d14,
    burn: 0x14161a,
    bare: 0xc2ccd4,

    emissive: 0x7fe4ff,
    emissiveHot: 0xd6f6ff,
    engine: 0x49c6ff,
    warn: 0xff5a4a,

    // Ceramic over metal: almost pure dielectric with a tight, low roughness. The
    // structural members underneath (hullDark) are exposed alloy and read metallic,
    // which is the contrast the whole faction identity rests on.
    surface: {
      hull: { metalness: 0.07, roughness: 0.30, variance: 0.10 },
      hullDark: { metalness: 0.60, roughness: 0.38, variance: 0.12 },
      plating: { metalness: 0.05, roughness: 0.21, variance: 0.08 },
      greeble: { metalness: 0.90, roughness: 0.28, variance: 0.15 },
      trim: { metalness: 0.16, roughness: 0.26, variance: 0.09 },
    },

    panel: {
      tileM: 28,
      grooveM: 0.18,       // tighter tolerances than anyone else in the game
      weldM: 0.40,
      weld: 0.12,          // Concord dresses its welds flush and does not show them
      step: 0.06,
      stepM: 0.30,
      rivets: 0.0,         // no rivets. Concord does not admit to fasteners.
      rivetPitchM: 2.4,
      skew: 0.0,
      toneSpread: 0.025,
      plateContrast: 0.30, // ceramic is one value with a line in it
      calm: 0.70,
    },

    wear: { edge: 0.30, streak: 0.26, grime: 0.20, pit: 0.05, oxide: 0x2b3038 },

    marking: { ink: 0x223442, inkDark: 0x0d1319, hazardA: 0x39a0c8, hazardB: 0x101820 },
  },

  derelict: {
    id: 'derelict',
    name: 'Derelict',
    blurb: 'Ancient. Nothing about the panel layout was decided by a person.',

    base: 0x836b3c,
    baseAlt: 0x6b5730,
    baseDark: 0x332c1e,
    plating: 0x917943,
    greeble: 0x9a8a5e,
    trim: 0x8f9a35,
    glass: 0x0b0f09,
    burn: 0x120f0b,
    bare: 0xb5a67e,

    emissive: 0x9fbe33,    // sickly green-gold
    emissiveHot: 0xd8ea7a,
    engine: 0x86b02a,
    warn: 0xc4d24a,

    // Bronze that has been oxidising for a very long time: partly metal, partly
    // its own corrosion product, and rougher than anything a shipyard would sign
    // off on. The wide variance is doing real work - no two plates agree.
    surface: {
      hull: { metalness: 0.40, roughness: 0.76, variance: 0.26 },
      hullDark: { metalness: 0.30, roughness: 0.88, variance: 0.22 },
      plating: { metalness: 0.46, roughness: 0.68, variance: 0.24 },
      greeble: { metalness: 0.74, roughness: 0.60, variance: 0.26 },
      trim: { metalness: 0.34, roughness: 0.62, variance: 0.20 },
    },

    // A 3.4 km hulk with one weave at one density has no scale hierarchy at all, so
    // the tile is the largest in the game and the calm fraction is the highest: the
    // asymmetric arcs and vanes are the read, not the surface.
    panel: {
      tileM: 34,
      grooveM: 0.55,       // eroded open, not a machined joint
      weldM: 0.90,
      weld: 0.30,
      step: 0.30,          // plates have lifted and sunk over a very long time
      stepM: 0.80,
      rivets: 0.0,
      rivetPitchM: 3.0,
      skew: 0.42,          // strake edges ramp off-axis. Not human.
      toneSpread: 0.06,    // corrosion earns more variance than a painted hull
      plateContrast: 0.52,
      calm: 0.55,
    },

    wear: { edge: 0.62, streak: 0.58, grime: 0.86, pit: 0.85, oxide: 0x2f2a12 },

    marking: { ink: 0x8a8f63, inkDark: 0x100e08, hazardA: 0x7f8a2c, hazardB: 0x14140c },
  },

  player: {
    id: 'player',
    name: 'Nadir',
    blurb: 'Neutral gunmetal. Whatever you bolt on has to look like it belongs.',

    // Authored one stop darker than the obvious choice. A 0.44-sRGB grey lit
    // correctly by a 13.5 key lands at 0.82 and the hull reads as white paper with
    // a blue shadow, which is a plastic model kit, not a warship. At 0.37 the same
    // light puts the lit deck at ~0.74, which leaves the running lights, the bare
    // metal at plate edges and the rim somewhere to be brighter THAN, and a value
    // is only bright relative to something.
    base: 0x666d75,
    baseAlt: 0x585f67,
    baseDark: 0x2e323a,
    plating: 0x727982,
    greeble: 0xa4aab0,
    trim: 0xa8a294,        // bone, not a hue. Reads as "unfactioned".
    glass: 0x090c10,
    burn: 0x151517,
    bare: 0xc3c9ce,

    emissive: 0xd9e6ee,    // cool neutral white
    emissiveHot: 0xf4fbff,
    engine: 0xa9d4ee,
    warn: 0xff4a2a,

    // Half-stripped gunmetal: more bare metal showing than either faction, because
    // this hull is repaired in the field with whatever is to hand.
    /**
     * The player hull was authored at metalness 0.40, which contradicts this file's
     * own opening note that a painted warship plate is a dielectric at 0.1-0.3. At
     * 0.40 more than half the surface response came from the environment rather than
     * from the key, so faces pointing in completely different directions returned
     * almost the same value and the hull had no readable light direction at all.
     * Bare metal still appears - the wear layer raises metalness at plate edges,
     * which is where a repaired hull actually shows metal.
     */
    surface: {
      hull: { metalness: 0.18, roughness: 0.54, variance: 0.16 },
      hullDark: { metalness: 0.28, roughness: 0.68, variance: 0.14 },
      plating: { metalness: 0.24, roughness: 0.46, variance: 0.16 },
      greeble: { metalness: 0.88, roughness: 0.36, variance: 0.18 },
      trim: { metalness: 0.12, roughness: 0.50, variance: 0.12 },
    },

    panel: {
      tileM: 26,
      grooveM: 0.26,
      weldM: 0.55,
      weld: 0.34,
      step: 0.10,
      stepM: 0.35,
      rivets: 0.40,
      rivetPitchM: 2.4,
      skew: 0.0,
      toneSpread: 0.035,
      plateContrast: 0.38,
      calm: 0.62,
    },

    wear: { edge: 0.55, streak: 0.62, grime: 0.40, pit: 0.12, oxide: 0x2b2a24 },

    marking: { ink: 0xc9ccd0, inkDark: 0x131417, hazardA: 0xbfa53a, hazardB: 0x16171a },
  },
};

// ---------------------------------------------------------------------------
// POI palettes
// ---------------------------------------------------------------------------

/**
 * One per point of interest. This is the whole lighting identity of a location:
 * a key, a bounce, a shadow floor, the tint the distance fades towards, and one
 * accent that everything artificial in the location is allowed to glow.
 *
 * `ibl` drives the procedurally generated environment map. `grade` is the post
 * chain's per-POI override, consumed by the lighting stream.
 */
export const POI_PALETTES = {
  'giant-orbit': {
    id: 'giant-orbit',
    name: 'Gas Giant Orbit',
    /*
     * KEY INTENSITY IS SOLVED, NOT GUESSED.
     *
     * This was 13.5, and cutting the fill terms to a 17:1 ratio did not fix the white
     * hull, because the key alone was already overdriving it. Working it through:
     * the hull albedo 0x666d75 is 0.133 linear, so a Lambertian face pointing at the
     * key returns 0.133/PI * I. Through the ACES curve at exposure 1.0 that lands a
     * fully-lit face at sRGB 0.83 for I = 13.5 - white paper before a single
     * highlight is added, which is exactly what the review frames showed.
     *
     *   I = 13.5 -> 0.83    I = 8 -> 0.72    I = 6 -> 0.65    I = 4.6 -> 0.57
     *
     * THEN IT WAS MEASURED, AND 4.6 UNDERSHOT.
     *
     * The model above is a bare Lambertian face and nothing else. The real pixel has
     * also been through cavity AO in the ORM map, the GTAO pass at blendIntensity 1,
     * the macro layer's value drift (±13%), and the grade's lift. Measured on the
     * hull mask of `close` at 1280x720, I = 4.6 put the 90th percentile of lit hull
     * at sRGB 0.403 and the 99th at 0.538 - i.e. the brightest armour face in the
     * frame was 0.52, against a target of 0.55-0.62 for a fully-lit face. The frame
     * read dark and the whole hull sat in the lower third of the curve.
     *
     * THEN THE MODEL ITSELF WAS RUN PROPERLY, BECAUSE 6.0 STILL UNDERSHOT.
     *
     * The original solve dropped two terms. A painted hull is metalness 0.18, so only
     * 82% of the albedo is available to the diffuse lobe; and three's ACES pre-scales
     * by exposure/0.6, then applies RRTAndODTFit, then the sRGB transfer. Carried all
     * the way through for albedo 0x666d75 (0.133 linear) on a face at NdotL = 1:
     *
     *   I = 4.6 -> 0.465    I = 6.0 -> 0.541    I = 6.8 -> 0.572    I = 8.0 -> 0.61
     *
     * So the 0.57 attributed to 4.6 above was really 0.465, which is why the frame
     * measured dark, and why raising it to 6.0 moved the measured hull only from 0.403
     * to 0.431 at the 90th percentile - the ACES shoulder is already compressing. 6.8
     * puts a fully-lit face at 0.572.
     *
     * THEN THE TARGET BAND ITSELF WAS WRONG, WHICH IS WHY 6.8 STILL READ FLAT.
     *
     * 0.55-0.62 was chosen to leave headroom. Measured against real frames it does
     * not: over matched crops the Star Citizen Stanton hull runs 0.28 -> 0.744 and
     * the HW3 hull 0.182 -> 0.681, while ours ran p25 0.226 -> p95 0.481 with a max
     * of 0.78 that belonged to a running light. Nothing on the ship landed anywhere
     * near white, so the top two stops of the curve were simply unused and the hull
     * was a low-contrast mid-grey object floating on black. The frame was NOT too
     * dark overall - it measured 41% near-black against Stanton's 48%.
     *
     * The band is now 0.72-0.80 for a FULLY LIT face, and the same solve gives:
     *
     *   I = 8 -> 0.623   I = 10 -> 0.683   I = 12 -> 0.729
     *   I = 14 -> 0.765  I = 16 -> 0.793   I = 20 -> 0.835
     *
     * 14.0 lands at 0.765, the middle of the band. THE AMBIENT TERMS ARE NOT RAISED
     * WITH IT: fill, bounce and rim are unchanged, so the key-to-fill ratio goes
     * 17:1 -> 35:1 and the shadow end stays exactly where it was, which is where
     * the review said it should be. The frame does not get brighter; its top two
     * stops get used.
     *
     * This also buys the deck/flank split that geometry alone could not. sunDir here
     * is (0.776, 0.347, -0.526) - 20 degrees of elevation - so a starboard flank
     * returns NdotL 0.78 and the deck 0.35. At I = 6.8 those landed at 0.51 and 0.36,
     * fifteen points apart in the compressive toe of the sRGB curve and reading as
     * one value. At I = 14 they land at 0.70 and 0.51, which is a genuine two-value
     * split from the same geometry and the same light direction.
     *
     * Celestials are in the far scene and carry their own lighting, so this does not
     * brighten the gas giant.
     */
    key: { color: 0xfff0d8, intensity: 14.0, angularRadius: 0.009 },
    /*
     * KEY-TO-FILL RATIO IS THE WHOLE LOOK, AND IT WAS WRONG.
     *
     * These were fill 2.30, bounce 0.90, rim 1.25, ibl 0.78 - together about 38% of
     * the key. Every non-key source is omnidirectional or near-omnidirectional, so
     * that sum lands on EVERY face regardless of which way it points. The result was
     * exactly what the review found: a hull whose top faces and flanks read the same
     * value, no terminator, and no readable light direction, on a build whose own
     * palette comments describe an intended cream-and-blue two-temperature frame.
     *
     * Exposure was not the problem - the frame measured 0% clipped and still looked
     * like white paper. Flat is not the same failure as blown out, and fixing the
     * second does nothing for the first.
     *
     * Now roughly 6% of key for the ambient terms. That is a ~17:1 key-to-fill ratio,
     * which is what produces near-black shadows. The shadow side is kept READABLE by
     * the rim rather than by ambient: a kicker is directional, so it separates the
     * silhouette edge without lifting the faces behind it. That distinction is the
     * difference between "shadowed regions retain readable value separation" and
     * "ambient wash", which the criteria list as opposite outcomes.
     */
    /*
     * `broad` was 0.42 and that is what made the cobalt.
     *
     * Blind review called out "saturated cobalt-blue as flat full-face fills on
     * apparently arbitrary panels", and the panels were not arbitrary: they are the
     * faces at 70-110 degrees to the key, which receive NO key at all and are
     * therefore lit entirely by the fill. Whatever hue the fill carries, those faces
     * become, at full saturation, with no value variation across them - which is the
     * exact signature of a decal on styrene.
     *
     * The physical answer is the one already written above: the light arriving from
     * a disc thirty degrees across is the average of the whole disc, and a banded
     * giant's average is a PALE blue, not the colour of its deepest belt. At 0.62 the
     * fill is close to ice with a blue cast, the two-temperature read survives, and
     * the faces it owns keep a value rather than becoming a colour.
     */
    fill: { color: 0x3f63b4, intensity: 0.40, broad: 0.62 },
    bounce: { color: 0x6f8ed8, intensity: 0.16 },
    // The kicker. Tracks the camera, sits behind the subject, and is the only thing
    // separating a grey hull from a black sky when the key is on the far side. It is
    // the second half of the cobalt problem - on a face the key misses, the rim is
    // the ONLY light - so it broadens too, less far, because a kicker is allowed to
    // be cold and it is directional enough to describe an edge rather than fill a
    // face. Stepped down with the key raised: 0.82 against 6.0 is a 7:1 ratio where
    // 0.95 against 4.6 was 5:1.
    rim: { color: 0x8fb4ff, intensity: 0.82, broad: 0.30 },
    shadow: 0x050912,
    fog: { color: 0x16223c, density: 0.000012 },
    accent: 0x8fb4ff,
    ibl: { zenith: 0x0a1024, horizon: 0x24406e, ground: 0x070b16, sun: 0xfff3e0, sunSize: 0.055, intensity: 0.16 },
    grade: {
      exposure: 1.0, bloom: 0.42, godrays: 0.30, vignette: 0.44,
      /**
       * Cold in the toe, cream in the shoulder. This is what puts the rocks, the
       * hull and the giant on one grade instead of three.
       *
       * `gainAmount` STAYS AT 0.30, and the reason is recorded because the argument
       * for lowering it was good and wrong. The grade's shoulder weight is
       * `smoothstep(0.24, 0.95, luma)` (render/postfx.js), so it scales with how
       * bright the frame already is: raising the key from 6.8 to 14.0 takes a lit hull
       * face from luma 0.36 to 0.67 and its shoulder weight from 0.10 to 0.60 — six
       * times as much cream applied to the same constant. That predicts a warm cast on
       * a hull whose stated identity is neutral gunmetal, which is exactly the
       * out-of-family colour round-one review flagged on the stern fins.
       *
       * Measured instead of assumed, on a hull-only crop of
       * `docs/review/look-surface/three-quarter.png` (`tools/surface.mjs`): mean colour
       * RGB(0.386, 0.387, 0.385), **chroma 0.006**. The hull is neutral to within a
       * quarter of a percent. The 0.069 chroma that shows up on the bridge tower's
       * key-facing chamfer is the cream KEY (0xfff0d8) landing on a face pointing at
       * it, which is what a cream key is for.
       *
       * Lowering it would have been tuning a constant against a hunch that the
       * measurement contradicts, which is the failure mode this project keeps logging.
       */
      lift: 0x35558c, gain: 0xffe8c8, liftAmount: 0.045, gainAmount: 0.30, saturation: 1.02,
    },
  },

  belt: {
    id: 'belt',
    name: 'The Belt',
    /**
     * SOLVED, not scaled. Every key below is the intensity that puts a fully lit
     * PLAYER hull face (0x666d75, metalness 0.18) at the target sRGB after this POI's
     * own key COLOUR and its own grade exposure, carried through three's ACES. The
     * first attempt at this pass scaled all six by the same factor as giant-orbit and
     * got four of the six wrong by 20-30%, because a 0xb6c6da key and a 0xfff0d8 key
     * do not deliver the same irradiance at the same intensity.
     *
     * Fill, bounce and rim are deliberately NOT raised with them, so every location's
     * key-to-fill ratio improves: the belt goes 5:1 -> 7.6:1, station 4.5:1 -> 7.4:1.
     */
    key: { color: 0xffe2b6, intensity: 15.9, angularRadius: 0.014 },
    fill: { color: 0x6b5a44, intensity: 2.10, broad: 0.30 },  // dust bouncing off a million rocks
    bounce: { color: 0x8a7350, intensity: 0.82 },
    rim: { color: 0xd89a4a, intensity: 0.95 },
    shadow: 0x0a0806,
    fog: { color: 0x2a2018, density: 0.000042 },
    accent: 0xd89a4a,
    ibl: { zenith: 0x0b0a08, horizon: 0x2e2418, ground: 0x100c08, sun: 0xffe6bc, sunSize: 0.07, intensity: 0.66 },
    grade: {
      exposure: 1.0, bloom: 0.38, godrays: 0.48, vignette: 0.46,
      lift: 0x6b5a44, gain: 0xffe8c8, liftAmount: 0.040, gainAmount: 0.26, saturation: 1.02,
    },
  },

  graveyard: {
    id: 'graveyard',
    name: 'The Graveyard',
    key: { color: 0xb6c6da, intensity: 20.0, angularRadius: 0.006 },
    // The nebula IS the fill here, and it is the only reason anything in this POI
    // is visible at all. Stated brighter than it looks because the key is weak.
    fill: { color: 0x4c6a4a, intensity: 1.55, broad: 0.34 },
    bounce: { color: 0x2b3c4e, intensity: 0.78 },
    // Sick derelict green off the nebula, and the strongest rim in the game: this
    // location is defined as "everything is silhouette", and a silhouette with no
    // rim is just black.
    rim: { color: 0x8fb04a, intensity: 1.05 },
    shadow: 0x02040a,
    fog: { color: 0x0e1620, density: 0.000030 },
    accent: 0x8fb04a,                                // derelict light, leaking
    ibl: { zenith: 0x03060c, horizon: 0x14202e, ground: 0x04070c, sun: 0xc2d2e4, sunSize: 0.035, intensity: 0.62 },
    grade: {
      exposure: 1.0, bloom: 0.46, godrays: 0.22, vignette: 0.50,
      // A dim frame needs MORE value separation, not less: lift the floor off zero
      // so wreckage separates from the void instead of merging with it.
      lift: 0x4c6a4a, gain: 0xdfeee0, liftAmount: 0.075, gainAmount: 0.16, saturation: 1.06,
    },
  },

  yard: {
    id: 'yard',
    name: 'Fitting Yard',
    key: { color: 0xffd9a0, intensity: 17.3, angularRadius: 0.02 },  // work lights, not a star
    fill: { color: 0x2b3442, intensity: 2.10, broad: 0.38 },
    bounce: { color: 0x4a5468, intensity: 0.82 },
    rim: { color: 0xffa93c, intensity: 0.85 },
    shadow: 0x05070c,
    fog: { color: 0x1a212c, density: 0.000022 },
    accent: 0xffa93c,
    ibl: { zenith: 0x060a12, horizon: 0x232c3a, ground: 0x0a0d14, sun: 0xffdcae, sunSize: 0.10, intensity: 0.72 },
    grade: {
      exposure: 1.0, bloom: 0.40, godrays: 0.28, vignette: 0.38,
      lift: 0x3c5170, gain: 0xffe8c8, liftAmount: 0.042, gainAmount: 0.26, saturation: 1.02,
    },
  },

  'near-star': {
    id: 'near-star',
    name: 'Near Star',
    /**
     * Solved like the rest, but against a target of 0.82 rather than 0.765: this is
     * the one location allowed to sit on the shoulder, and the grade's own
     * exposure 0.86 is carried through the solve rather than argued around.
     */
    key: { color: 0xfff6ea, intensity: 20.3, angularRadius: 0.05 },  // brutal
    fill: { color: 0x7a4226, intensity: 1.90, broad: 0.16 },
    bounce: { color: 0xa85c2e, intensity: 0.70 },
    rim: { color: 0xff7a2a, intensity: 1.30 },
    shadow: 0x0c0603,
    fog: { color: 0x3c1e0e, density: 0.000055 },
    accent: 0xff7a2a,
    ibl: { zenith: 0x120804, horizon: 0x5a2c12, ground: 0x1a0c05, sun: 0xfffaf0, sunSize: 0.16, intensity: 1.05 },
    grade: {
      exposure: 0.86, bloom: 0.62, godrays: 0.66, vignette: 0.52,
      lift: 0x7a4226, gain: 0xffe8c8, liftAmount: 0.036, gainAmount: 0.24, saturation: 1.0,
    },
  },

  station: {
    id: 'station',
    name: 'Station Approach',
    key: { color: 0xdce8f4, intensity: 15.5, angularRadius: 0.008 },
    fill: { color: 0x27374e, intensity: 2.10, broad: 0.40 },
    bounce: { color: 0x3c5170, intensity: 0.82 },
    rim: { color: 0x59c8ff, intensity: 0.95 },
    shadow: 0x04070e,
    fog: { color: 0x141e2c, density: 0.000018 },
    accent: 0x59c8ff,
    ibl: { zenith: 0x050912, horizon: 0x1c2c42, ground: 0x070b12, sun: 0xe6f0fa, sunSize: 0.04, intensity: 0.80 },
    grade: {
      exposure: 1.0, bloom: 0.42, godrays: 0.20, vignette: 0.40,
      lift: 0x27374e, gain: 0xf0f6ff, liftAmount: 0.042, gainAmount: 0.20, saturation: 1.02,
    },
  },
};

export const POI_IDS = Object.keys(POI_PALETTES);
export const DEFAULT_POI = 'giant-orbit';

/**
 * Colours that belong to no faction and no location: pure structural values, the
 * UI's hostile red, the salvage cyan. Kept short on purpose.
 */
export const NEUTRAL = {
  void: 0x000000,
  spaceBlack: 0x02030a,
  hostile: 0xff4433,
  friendly: 0x54e08a,
  salvage: 0x39d7d0,
  select: 0xf2e9c8,
  shieldHit: 0x76c6ff,
  scorchCore: 0x0d0b09,
  scorchRim: 0x30241a,
  ice: 0xcfe4f2,
  rock: 0x4f4a42,
  rockDark: 0x1d1a17,
  rockOre: 0x8a6a3c,
};

// ---------------------------------------------------------------------------
// Indexing + validation
// ---------------------------------------------------------------------------

/**
 * Leaf keys that hold a colour. Explicit rather than inferred: a heuristic that
 * guesses "integers over 0x100000 are probably colours" is the kind of thing that
 * silently stops enforcing anything the day someone adds `hp: 2400000`.
 */
const COLOR_KEYS = new Set([
  'base', 'baseAlt', 'baseDark', 'plating', 'greeble', 'trim', 'glass', 'burn', 'bare',
  'emissive', 'emissiveHot', 'engine', 'warn', 'oxide',
  'ink', 'inkDark', 'hazardA', 'hazardB',
  'color', 'shadow', 'accent',
  'zenith', 'horizon', 'ground', 'sun',
  'lift', 'gain',
  'void', 'spaceBlack', 'hostile', 'friendly', 'salvage', 'select', 'shieldHit',
  'scorchCore', 'scorchRim', 'ice', 'rock', 'rockDark', 'rockOre',
]);

/** hex -> dotted provenance path, e.g. 12345 -> 'coalition.trim'. */
const _index = new Map();
/** hex -> provenance for colours produced by shade/mix/saturate. */
const _derived = new Map();
/** Illegal colours seen this session: [{hex, where}]. */
const _foreign = [];
let _strict = false;

function indexTree(obj, path, out) {
  for (const [k, v] of Object.entries(obj)) {
    const p = path ? `${path}.${k}` : k;
    if (v && typeof v === 'object') {
      indexTree(v, p, out);
    } else if (COLOR_KEYS.has(k)) {
      if (!Number.isInteger(v) || v < 0 || v > 0xffffff) {
        throw new Error(`[palette] "${p}" is declared a colour key but holds ${JSON.stringify(v)}`);
      }
      if (!out.has(v)) out.set(v, p);
    } else if (Number.isInteger(v) && v >= 0x100000 && v <= 0xffffff) {
      // Almost certainly a colour under a key nobody added to COLOR_KEYS.
      throw new Error(`[palette] "${p}" looks like a colour (0x${v.toString(16)}) but "${k}" is not in COLOR_KEYS`);
    }
  }
}

indexTree(FACTION_PALETTES, '', _index);
indexTree(POI_PALETTES, '', _index);
indexTree(NEUTRAL, 'neutral', _index);

/** Every faction in the shared contract must actually have a palette. */
for (const f of FACTIONS) {
  if (!FACTION_PALETTES[f]) throw new Error(`[palette] contracts declares faction "${f}" with no palette`);
}

export const PALETTE_COLOR_COUNT = _index.size;

export function getFactionPalette(id) {
  const p = FACTION_PALETTES[id];
  if (!p) throw new Error(`[palette] unknown faction "${id}" (have: ${Object.keys(FACTION_PALETTES).join(', ')})`);
  return p;
}

export function getPOIPalette(id = DEFAULT_POI) {
  const p = POI_PALETTES[id];
  if (!p) throw new Error(`[palette] unknown POI palette "${id}" (have: ${POI_IDS.join(', ')})`);
  return p;
}

/** Look a colour up by dotted path: paletteColor('coalition.trim'). Throws if absent. */
export function paletteColor(path) {
  const roots = { ...FACTION_PALETTES, ...POI_PALETTES, neutral: NEUTRAL };
  let node = roots;
  for (const part of path.split('.')) {
    node = node?.[part];
    if (node === undefined) throw new Error(`[palette] no colour at path "${path}"`);
  }
  if (!Number.isInteger(node)) throw new Error(`[palette] path "${path}" is not a colour`);
  return node;
}

export function isPaletteColor(hex) {
  const v = hex | 0;
  return _index.has(v) || _derived.has(v);
}

export function paletteProvenance(hex) {
  const v = hex | 0;
  return _index.get(v) ?? _derived.get(v) ?? null;
}

/**
 * Dev-mode gate. In strict mode an off-palette colour throws where it was used,
 * which is the only time that information is cheap to act on. Otherwise it is
 * recorded for `paletteAudit()`.
 */
export function assertPaletteColor(hex, where = '<unknown>') {
  if (isPaletteColor(hex)) return hex;
  const rec = { hex, hexString: '#' + (hex >>> 0).toString(16).padStart(6, '0'), where };
  _foreign.push(rec);
  if (_strict) {
    throw new Error(`[palette] off-palette colour ${rec.hexString} used at ${where}`);
  }
  return hex;
}

export function setStrict(on) { _strict = !!on; }
export function isStrict() { return _strict; }
export function resetAudit() { _foreign.length = 0; }

// ---------------------------------------------------------------------------
// Derivation - the only legal way to make a colour that is not literally listed
// ---------------------------------------------------------------------------

const _c1 = new THREE.Color();
const _c2 = new THREE.Color();

function register(hex, provenance) {
  const v = hex | 0;
  if (!_index.has(v) && !_derived.has(v)) _derived.set(v, provenance);
  return v;
}

/** Multiply value. shade(hex, 0.4) is 40% as bright, shade(hex, 1.6) is brighter. */
export function shade(hex, factor) {
  _c1.setHex(hex, THREE.SRGBColorSpace);
  _c1.multiplyScalar(factor);
  _c1.r = Math.min(1, _c1.r); _c1.g = Math.min(1, _c1.g); _c1.b = Math.min(1, _c1.b);
  return register(_c1.getHex(THREE.SRGBColorSpace), `shade(${paletteProvenance(hex) ?? hexStr(hex)}, ${factor})`);
}

/** Linear blend in sRGB. t=0 is a, t=1 is b. */
export function mix(a, b, t) {
  _c1.setHex(a, THREE.SRGBColorSpace);
  _c2.setHex(b, THREE.SRGBColorSpace);
  _c1.lerp(_c2, t);
  return register(_c1.getHex(THREE.SRGBColorSpace),
    `mix(${paletteProvenance(a) ?? hexStr(a)}, ${paletteProvenance(b) ?? hexStr(b)}, ${t})`);
}

/** Push saturation. amount < 1 desaturates towards luminance. */
export function saturate(hex, amount) {
  _c1.setHex(hex, THREE.SRGBColorSpace);
  const l = _c1.r * 0.2126 + _c1.g * 0.7152 + _c1.b * 0.0722;
  _c1.setRGB(
    Math.min(1, Math.max(0, l + (_c1.r - l) * amount)),
    Math.min(1, Math.max(0, l + (_c1.g - l) * amount)),
    Math.min(1, Math.max(0, l + (_c1.b - l) * amount)),
  );
  return register(_c1.getHex(THREE.SRGBColorSpace), `saturate(${paletteProvenance(hex) ?? hexStr(hex)}, ${amount})`);
}

export function hexStr(hex) { return '#' + ((hex >>> 0) & 0xffffff).toString(16).padStart(6, '0'); }

/** THREE.Color from a palette hex, validated. Allocates - not for hot loops. */
export function color(hex, where = 'palette.color') {
  assertPaletteColor(hex, where);
  return new THREE.Color().setHex(hex, THREE.SRGBColorSpace);
}

/**
 * An emissive colour scaled past 1.0 so the bloom threshold (1.05) actually
 * catches it. Returns a THREE.Color, allocating - call it at build time.
 */
export function emissiveColor(hex, intensity = 1, where = 'palette.emissiveColor') {
  assertPaletteColor(hex, where);
  const c = new THREE.Color().setHex(hex, THREE.SRGBColorSpace);
  return c.multiplyScalar(intensity);
}

// ---------------------------------------------------------------------------
// Audits
// ---------------------------------------------------------------------------

/**
 * Walk a scene graph and report every material that was not stamped by the
 * material registry. A material without `userData.__paletteKey` was built with a
 * bare `new THREE.MeshStandardMaterial`, which means it dodges palette
 * enforcement, dodges the texture cache and breaks instancing batching.
 */
export function auditMaterials(root) {
  const offenders = [];
  const seen = new Set();
  root?.traverse?.((o) => {
    const mats = Array.isArray(o.material) ? o.material : (o.material ? [o.material] : []);
    for (const m of mats) {
      if (!m || seen.has(m.uuid)) continue;
      seen.add(m.uuid);
      if (!m.userData?.__paletteKey) {
        offenders.push({
          uuid: m.uuid,
          type: m.type,
          name: m.name || '<unnamed>',
          on: o.name || o.type,
          color: m.color ? hexStr(m.color.getHex(THREE.SRGBColorSpace)) : null,
        });
      }
    }
  });
  return offenders;
}

/**
 * Everything the enforcement layer knows. Print this in dev before shipping a
 * stream; `foreign` and `materialsOutsideRegistry` must both be empty.
 */
export function paletteAudit(root = null) {
  return {
    version: PALETTE_VERSION,
    strict: _strict,
    colors: _index.size,
    derived: _derived.size,
    foreign: _foreign.slice(),
    materialsOutsideRegistry: root ? auditMaterials(root) : [],
    factions: Object.keys(FACTION_PALETTES),
    pois: POI_IDS,
  };
}

/** Human-readable one-liner list, for a console.table in dev. */
export function paletteTable() {
  const rows = [];
  for (const [hex, path] of _index) rows.push({ path, hex: hexStr(hex), kind: 'declared' });
  for (const [hex, path] of _derived) rows.push({ path, hex: hexStr(hex), kind: 'derived' });
  return rows;
}
