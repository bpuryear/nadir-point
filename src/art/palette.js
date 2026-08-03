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
 *
 * ===========================================================================
 * PASS 10: THE COLOUR IDENTITY IS WARM AMBER / BONE / NEAR-BLACK
 * ===========================================================================
 * look-target.md §1 gives Beta Decay the SURFACE AND IDENTITY half of the hybrid,
 * and reference-ui-language.md §1 states it as severely as it can be stated: "the
 * whole screen is black, amber, and bone. Our locked palette already has the right
 * idea, but our frames carry neutral-grey hull, blue planet, warm-brown asteroids
 * and cobalt accents - four temperatures. This reference carries one."
 *
 * Measured on the hull mask of `docs/review/surf-before/close.png`, the shipped
 * frame's mean hull colour was RGB(0.556, 0.537, 0.498) - i.e. the hull was already
 * being dragged warm by the cream key, while every ALBEDO in this file was authored
 * COOL (player base 0x666d75 is hue 212 degrees, B > G > R). The hull's own material
 * was fighting the location it lives in, and the two cancelled to grey.
 *
 * THE ROTATION IS LUMINANCE-PRESERVING, AND THAT IS THE WHOLE REASON IT IS SAFE.
 *
 * Every key intensity in the POI table below was solved against a specific LINEAR
 * LUMINANCE - "albedo 0x666d75 is 0.133 linear, so a Lambertian face returns
 * 0.133/PI * I" - and re-hueing an albedo without holding that number would silently
 * invalidate six solved keys and hand the lighting stream a regression it did not
 * cause. Each colour below was therefore rotated onto a warm chromaticity at CONSTANT
 * linear luminance (0.2126 R + 0.7152 G + 0.0722 B, computed in linear space, held to
 * within 1%):
 *
 *   player.base      0x666d75 -> 0x716c63   Y 0.1505 -> 0.1514
 *   player.plating   0x565d66 -> 0x605c54   Y 0.1077 -> 0.1078
 *   player.greeble   0xa4aab0 -> 0xada9a2   Y 0.3978 -> 0.3987
 *   coalition.base   0x707c66 -> 0x7d786e   Y 0.1882 -> 0.1892
 *
 * So the frame's VALUE structure - which is what the key solve, the three-value read
 * and the surface measurements are all about - is unchanged to within a fifth of a
 * percent, and only its temperature moves. This is the identity half of the hybrid
 * and it is deliberately NOT the grade half: the grade is the deferred lighting pass.
 *
 * THE THIRD VALUE IS NEAR-BLACK, AND IT WAS NOT NEAR ANYTHING.
 *
 * "Warm amber / bone / near-black" is three values, and `baseDark` - the recessed
 * structure every faction hangs off `hullDark` - was authored at 0x3a3f47 (player),
 * 0x495561 (concord), 0x373b31 (coalition): Y = 0.049, 0.088, 0.042. Those are MIDS.
 * Carried through the rig they land near 0.42 sRGB, which is why blind review kept
 * finding that "hulls read at a single value" - the palette had a light value and a
 * slightly-less-light value and called the second one dark. Every `baseDark` is now
 * a genuine near-black (Y 0.015-0.025) in the faction's own temperature. That gives
 * the ALBEDO a three-value read that survives any lighting pass, rather than asking
 * the key-to-fill ratio to supply one.
 *
 * SATURATED FILLS ARE GONE FROM THE FILL COLOURS AND MOVED INTO THE MARKS.
 *
 * ship-language.md §4 and the Falling Frontier note in closest-comparables.md both
 * say the same thing: accent follows STRUCTURE - edges, hazard zones, functional
 * markings, recesses - never an arbitrary whole face. Two colours in this file were
 * being used as whole-face fills by the fleet surface tables (ships/common.js maps
 * `trim` and `dark` straight onto merged meshes):
 *
 *   concord.trim     0x2f7fa8  saturated cobalt, ~1.9 stops of chroma
 *   concord.baseDark 0x495561  saturated navy
 *
 * Both are now near-neutral slate. The accent they used to carry moves into
 * `marking.hazardA`, which the macro layer draws only at edges, hatches and hazard
 * zones and which `hullMaps.js#variantSpec('trim')` now draws only as a marked EDGE
 * BAND on the trim surface rather than as its fill.
 *
 * ONE SEMANTIC RULE, ADOPTED FROM FALLING FRONTIER (closest-comparables.md):
 *
 *   marking.hazardA  ORANGE  = ACCESS AND MAINTENANCE. Hatches, bays, tubes, mount
 *                             pads, drive wells, anything that opens, moves or is
 *                             serviced. Applied identically on every faction,
 *                             because it is a FUNCTION and not an identity.
 *   marking.sensor   WHITE   = SENSORS. Arrays, masts, apertures, the bridge band.
 *                             Bone rather than pure white, per §1 of the reference.
 *   marking.ink      NEUTRAL = registry lettering, sigils, repair-patch outlines.
 *
 * Faction identity survives in hull VALUE, in `emissive`, and in `trim` - which is
 * where look-target.md §1 puts it ("faction hue survives as the one identity
 * exception"). Concord is still the palest faction in the game and still cool; what
 * it no longer has is a cobalt panel.
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
    /**
     * Rotated off grey-green onto the warm axis at constant linear luminance (see
     * the pass-10 note at the top of the file). Coalition is the faction the
     * identity is easiest on: it was already the warm one, it just carried a GREEN
     * cast (G > R) that put it a third temperature away from both the amber
     * emissives it wears and the bone the rest of the game is moving to.
     */
    /**
     * PASS 13: COALITION AND PLAYER WERE THE SAME HUE, AND R6 IS ABOUT HUE.
     *
     * reference-frames.md R6 asks for "faction identity legible as HUE at two
     * hull-lengths, not only as outline". Measured before this pass, player `base`
     * was 0x716c63 and coalition `base` 0x7d786e: chroma 0.124 and 0.120, linear R/B
     * 1.32 and 1.32. Two of the four factions were the SAME near-neutral warm grey at
     * two values. Value is not identity — a Coalition frigate half-lit reads as the
     * player's own hull.
     *
     * THE GREEN DOES NOT COME BACK, and that is deliberate. Pass 10 removed this
     * faction's G > R cast with a written argument — it was a third temperature
     * against the amber emissives it wears — and reference-frames.md §1 backs that
     * argument rather than overturning it ("EVE Frontier ... ONE hue owning the entire
     * frame" is named as the closest model for the ship). So the separation is taken
     * INSIDE the warm family: Coalition goes red-oxide (hue ~24 degrees, which is what
     * heavy industry primes steel with) against the player's yellow-bone (~38
     * degrees), at a higher chroma because this is the faction that paints.
     *
     * Constant linear luminance, byte-solved, same rule as everything else here:
     *   base      0x7d786e -> 0x897562   Y 0.18919 -> 0.18923  chroma 0.120 -> 0.285
     *   baseAlt   0x6a655d -> 0x766250   Y 0.13162 -> 0.13166  chroma 0.123 -> 0.322
     *   baseDark  0x2b2620 -> 0x2f251a   Y 0.02004 -> 0.02002  chroma 0.256 -> 0.447
     *   plating   0x8f887e -> 0x9c856d   Y 0.24954 -> 0.24947  chroma 0.119 -> 0.301
     */
    base: 0x897562,        // red-oxide industrial steel
    baseAlt: 0x766250,     // second plate tone, for panel-to-panel variance
    /**
     * NEAR-BLACK, and it used to be a mid. 0x373b31 is Y = 0.0416 linear, which the
     * rig lands near 0.40 sRGB - i.e. the "dark" value was three quarters as bright
     * as the hull and the ship read at one value. 0x2f251a is Y = 0.0200.
     */
    baseDark: 0x2f251a,    // recessed structure - the near-black of the three
    plating: 0x9c856d,     // secondary armour, slightly brighter
    greeble: 0xa19c92,     // small mechanical detail - METAL, so a bright F0
    trim: 0xc4671b,        // the identity carrier: safety orange
    glass: 0x0a0e11,
    burn: 0x120f0a,        // carbon scoring
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
      greeble: { metalness: 0.58, roughness: 0.48, variance: 0.20 },
      trim: { metalness: 0.10, roughness: 0.54, variance: 0.12 },
      radiator: { metalness: 0.12, roughness: 0.90, variance: 0.10 },
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
    /**
     * `hazardA` IS ACCESS ORANGE ON EVERY FACTION. It was 0xd6981c, a mustard that
     * split the difference between a warning and a paint colour and matched nothing
     * else in the frame. It now sits on the faction's own trim orange, so an access
     * hatch on a Coalition hull and an access hatch on a Concord hull are the same
     * colour - which is the whole point of a semantic rule.
     * `sensor` is the second family: bone-white, for arrays and apertures.
     */
    marking: {
      ink: 0xd9d3c3, inkDark: 0x161513,
      hazardA: 0xc4671b, hazardB: 0x191712,
      sensor: 0xe9e3d6,
    },
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
    /**
     * CONCORD IS THE FACTION-HUE EXCEPTION AND KEEPS ITS COOL PALE CERAMIC.
     * look-target.md §1: "faction hue survives as the one identity exception".
     * `base`, `baseAlt` and `plating` are unchanged - they are near-neutral pale
     * already (chroma under 0.05) and they are the thing that separates this faction
     * from Coalition at 5 km.
     *
     * WHAT CHANGED ARE THE TWO SATURATED FULL-FACE FILLS.
     *
     * `ships/common.js#SURFACES` maps the logical surfaces `dark` and `trim` onto
     * `hullDark` and `trim` and applies them to whole merged meshes. So every square
     * metre of Concord structure that geometry called "dark" was painted 0x495561 -
     * a saturated navy - and every square metre it called "trim" was painted
     * 0x2f7fa8, a saturated cobalt. That is EXACTLY the finding: "saturated
     * navy/cobalt is applied as full-face fills on whole panels, which reads as a
     * plastic model kit", and it is a palette bug, not a lighting one - D24 already
     * cleared the fill light of it.
     *
     * Both are now near-neutral cool slate. Measured chroma ((max-min)/max in sRGB):
     * trim 0.720 -> 0.098, baseDark 0.247 -> 0.182 - and baseDark's remaining chroma
     * is carried at Y = 0.021 instead of Y = 0.088, i.e. it is a near-black with a
     * cool cast rather than a mid navy, which is a different object entirely.
     * Concord's identity moves to hull VALUE (still the palest faction in the game)
     * and to its cyan emissives; its accent moves into the marks, where §4 puts it.
     */
    base: 0x868c91,
    baseAlt: 0x7b8185,
    baseDark: 0x24282c,
    plating: 0x8f969b,
    greeble: 0xbcc5cd,
    trim: 0x6f767b,
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
      greeble: { metalness: 0.62, roughness: 0.34, variance: 0.15 },
      trim: { metalness: 0.16, roughness: 0.26, variance: 0.09 },
      radiator: { metalness: 0.08, roughness: 0.84, variance: 0.07 },
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

    /**
     * ACCESS ORANGE, ON THE COOLEST FACTION IN THE GAME, ON PURPOSE.
     *
     * `hazardA` was 0x39a0c8 - Concord's own cyan - which meant a hatch on a Concord
     * hull and a hatch on a Coalition hull were different colours and neither could
     * be recognised as "a hatch" without reading the shape. The Falling Frontier rule
     * in closest-comparables.md is that the mark colour encodes the FUNCTION, and a
     * function does not change nationality: orange is access and maintenance
     * everywhere. Concord keeps its identity in hull value, emissive and trim.
     *
     * Slightly cooler and lighter than Coalition's, because it is sprayed over pale
     * ceramic rather than over industrial steel and a yard mixes to what it covers.
     */
    marking: {
      ink: 0x223442, inkDark: 0x0d1319,
      hazardA: 0xc4761f, hazardB: 0x101820,
      sensor: 0xeef2f5,
    },
  },

  derelict: {
    id: 'derelict',
    name: 'Derelict',
    blurb: 'Ancient. Nothing about the panel layout was decided by a person.',

    /**
     * =====================================================================
     * THIS FACTION'S DARKNESS WAS IN A NOISE MASK AND IS NOW IN ITS PAINT
     * =====================================================================
     * `base` and `baseAlt` are scaled by 0.82 in sRGB, which is a scale by 0.82^2.2 in
     * linear and therefore an EXACT hold of chromaticity — the R:G:B ratio, the hue and
     * the saturation are unchanged to a byte, and only the value moves. The derelict is
     * still the same bronze it always was.
     *
     *   base      0x836b3c -> 0x6b5831   Y 0.1567 -> 0.1033   R/G 1.224 -> 1.216
     *   baseAlt   0x6b5730 -> 0x584727   Y 0.1016 -> 0.0673   R/G 1.230 -> 1.239
     *
     * WHY, AND IT IS AN ARITHMETIC CONSEQUENCE OF THE OTHER TWO CHANGES IN THIS PASS
     * RATHER THAN A TASTE CALL. `textures/hullMaps.js` now bands the corrosion layer
     * into the detail field and lifts the corrosion floor off `baseDark * 0.7` onto
     * `pal.wear.oxide`. Both of those HAND VALUE BACK to this faction: they are the two
     * ways the derelict was being made dark by a mask instead of by paint, and removing
     * a mask that was doing 0.3 stops of work makes the hulk 0.3 stops brighter.
     *
     * Measured on the graveyard's own gate, `node tools/derelictcheck.mjs`, each change
     * applied ALONE to a clean checkout of `a22dad3` and then in combination — hero
     * shot, 1280x720, hardware raster, clean worktrees throughout:
     *
     *   tree                          maskLift  maskPct  darkPct   gate
     *   a22dad3                          1.30    16.54     4.68    6/6
     *   + corrosion banding              1.29    16.83     3.86    6/6
     *   + pit floor -> oxide             1.31    16.82     4.10    6/6
     *   + both, no palette change        1.34    17.51     2.76    5/6  FAILS darkPct
     *   + both + this palette change     1.30    16.90     5.15    6/6
     *
     * The fourth row is the whole argument. `darkPct` is the fraction of the subject
     * still in shadow — the shadow terminator the owner watched wash out — and its
     * floor is 3.20. Two changes that each cost 0.6-0.8 of it cost 1.9 together, and
     * this is what pays it back. Landing any one of the three without the other two is
     * not a smaller version of this pass; it is a different and worse render.
     *
     * WHAT THE FACTION LOOKS LIKE AFTER IT. Measured with `node tools/matsurface.mjs
     * --rows fleet`, `derelict mod` (what `modules/kit.js:90` asks for): linear meanY
     * 0.0578 -> 0.0563, i.e. the tier lands 0.04 stops from where it started, while its
     * surface goes from 1.2% calm to 90.4% and its frequency against the cruiser hull
     * from 9.05x to 4.94x. The mechanism by which this faction is dark moved from noise
     * into paint; the amount of dark did not move.
     *
     * NO KEY SOLVE DEPENDS ON THIS. The six POI intensities this file keeps warning
     * about are solved against `player.base`'s linear Y and are named in the player
     * block; no lighting number anywhere is solved against a derelict albedo.
     *
     * NOT AN INSTRUMENT FIX. `tools/surface.mjs`'s frequency operator is a gradient
     * magnitude on non-normalised luma, so darkening ANY surface lowers its measured
     * frequency for free. That is a real hazard and it is why this scale is chosen to
     * hold the tier's rendered value and the gate's shadow fraction, not to move
     * `meanTile`: on its own it buys only 0.0742 -> 0.0597 of the frequency, a fifth of
     * what this pass delivers, and it is not carried here for that.
     */
    base: 0x6b5831,
    baseAlt: 0x584727,
    // Near-black, same correction as the other three: 0x332c1e was Y = 0.0294 and
    // read as a mid brown against a 0.18 hull. 0x221c11 is Y = 0.0128.
    baseDark: 0x221c11,
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
      greeble: { metalness: 0.55, roughness: 0.64, variance: 0.26 },
      trim: { metalness: 0.34, roughness: 0.62, variance: 0.20 },
      radiator: { metalness: 0.18, roughness: 0.92, variance: 0.14 },
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

    /**
     * The derelict is the one faction the ACCESS rule does not apply to, and that is
     * the point: whatever the marks on an ancient hull mean, they do not mean "a
     * person opens this here". Its `hazardA` stays the sickly gold it always was, so
     * finding a derelict still reads as finding something that was not built for you.
     */
    marking: {
      ink: 0x8a8f63, inkDark: 0x100e08,
      hazardA: 0x7f8a2c, hazardB: 0x14140c,
      sensor: 0xc8cfa0,
    },
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
    /**
     * THREE VALUES, NOT THREE NAMES.
     *
     * Round-two review, on the controlled material chart: "The player HULL, HULLDARK
     * and PLATING swatches are visually indistinguishable near-white spheres ... Three
     * named surfaces that cannot be told apart on a controlled chart under a controlled
     * light will never separate on a hull." They could not be told apart because
     * `plating` was 0x727982 and `hull` 0x666d75 — 45% against 40% reflectance, an
     * eighth of a stop, which the ACES shoulder then compressed to nothing.
     *
     * `plating` now sits a genuine half-stop BELOW `hull` rather than a whisker above
     * it, and the direction matters as much as the size. The calm armour belt is the
     * ship's lightest large surface and the medium plating is its mid; that makes the
     * belt/spine split a VALUE split that survives to LOD2, instead of a texture
     * difference that dies with the first mip. Measured through the rig's ACES at
     * key 11.5 a fully lit face reads: hull 0.71, plating 0.63, hullDark 0.42.
     */
    /**
     * WARM BONE, NOT COOL GUNMETAL, AND THE VALUES ARE THE SAME VALUES.
     *
     * Every hex below is the old hex rotated onto the warm axis at constant linear
     * luminance - the figures are in the pass-10 note at the top of the file. The
     * three-value relationship this block's own comment describes is preserved
     * exactly: `plating` still sits a genuine half-stop BELOW `hull` so the belt /
     * spine split is a value split that survives to LOD2.
     *
     * The reason it had to move: look-target.md gives Beta Decay the identity half of
     * the hybrid and reference-ui-language.md §1 measures that identity as "black,
     * amber and bone, with essentially no third hue anywhere in frame". A hull
     * authored at hue 212 degrees under a cream key (0xfff0d8) is two temperatures
     * fighting, and they cancelled: the shipped frame measured a hull mask at
     * RGB(0.556, 0.537, 0.498) - dead neutral - on a ship the palette described as
     * gunmetal and the target describes as bone. Now the albedo and the key agree and
     * the frame has ONE temperature, which is the single most transferable thing the
     * reference has.
     *
     * `baseDark` is the near-black of "amber / bone / near-black" and it was not near
     * black: 0x3a3f47 is Y = 0.0491, three quarters of the hull's own 0.0666 once you
     * account for the ACES toe. 0x2b2722 was a genuine third value that exists in the
     * ALBEDO and therefore survives whatever the deferred lighting pass decides to do.
     * (That hex measures Y = 0.0207 on this tree's own luminance operator, not the
     * 0.0217 written here at the time; the difference is a rounding of the sRGB
     * decode and it changes nothing about the argument. Pass 11 below holds the same
     * luminance and spends the change on hue - see `baseDark` in the table.)
     */
    /**
     * ===================================================================
     * PASS 11: THE TWO TIERS THAT OWN THE SHIP WERE 0.31 STOPS APART
     * ===================================================================
     * Pass 10 (the note above) fixed the TEMPERATURE and fixed `baseDark`. What it
     * did not do, because nothing could render a legible close frame until D67 was
     * found, is check that the tiers separate in a picture. Measured on this tree,
     * on the first legible close frame the project has had:
     *
     * WHERE THE SHIP'S SURFACE AREA ACTUALLY IS (real triangle area, m^2, LOD0,
     * summed off `cruiser.js#hullParts`, which is pure and can be imported):
     *
     *   hull      1 438 286 m^2   36.5 %      plating   1 402 227 m^2   35.6 %
     *   dark        735 518 m^2   18.7 %      greeble     274 885 m^2    7.0 %
     *   radiator     85 900 m^2    2.2 %
     *
     * So `hull` and `plating` are 72.1 % of the ship between them - they ARE the
     * ship - and the generated albedo maps measured 0.1320 and 0.1061 mean linear Y.
     * That is 0.31 STOPS. Two tiers covering three quarters of a 1.4 km hull, a third
     * of a stop apart, is one value with a texture change in it, and it is why every
     * framing of this ship reads as a single bone object however it is lit.
     *
     * IT IS AN ALBEDO PROBLEM AND NOT AN EXPOSURE ONE, AND THAT WAS MEASURED, NOT
     * ASSUMED. Rendering the cruiser probe three times at one pose - the real frame,
     * a flat material-key ID pass, and a world-normal pass - and then comparing tiers
     * only WITHIN a matched N.L bucket (so geometry and light direction are held
     * fixed and the only thing left is the material):
     *
     *   N.L bucket        hull    plating   hullDark    authored albedo separation
     *   0.85 - 1.0       0.799     0.786          -     0.31 / 1.80 stops
     *   0.60 - 0.85      0.732     0.686      0.627
     *   0.35 - 0.60      0.654     0.589      0.530
     *
     *   rendered separation: hull->plating 0.21-0.34 stops, hull->hullDark 0.50-0.67
     *
     * The mid tier passes through the rig at roughly 1:1 - 0.31 stops authored comes
     * out as 0.21-0.34 stops rendered - so authoring more separation buys separation,
     * predictably, with no lighting change at all. (The near-black tier passes only
     * about a third of its authored depth, because a dielectric's F0 = 0.04 specular
     * floor under an 11.5 key does not scale with albedo. That floor is a KEY
     * intensity consequence, it cannot be fixed from this file, and it is filed as a
     * request to the lighting stream rather than worked around here.)
     *
     * So `plating` moves and `base` DOES NOT. Every key intensity in the POI table
     * below is solved against `base`'s linear luminance, and re-hueing or re-valuing
     * it would silently invalidate six solved keys and hand the lighting stream a
     * regression it did not cause - the same rule pass 10 wrote and the same reason.
     * `base` is the anchor; everything else moves relative to it.
     *
     *   plating   0x605c54 -> 0x544f46   Y 0.1078 -> 0.0798   (map 0.1061 -> 0.0785)
     *
     * which puts the generated maps at hull 0.1320 / plating 0.0785 / hullDark 0.0364
     * - a 0.75-stop and 1.11-stop ladder where it was 0.31 and 1.49. An EVEN ladder,
     * which is what a three-value read is; the old one was two values that touched
     * plus a third nothing could reach.
     *
     * WARM IS IN THE ALBEDO NOW, NOT ONLY IN THE KEY.
     *
     * The shipped frame measures a hull-mask chroma of 0.157-0.171, which looks like
     * the warm identity is already there - but it is not in the MATERIAL. Measured on
     * the generated albedo canvases, warmth (mean sRGB R minus B) was hull 0.050,
     * plating 0.045, hullDark 0.036, greeble 0.038: essentially neutral. All of that
     * 0.16 chroma is the cream key (0xfff0d8) landing on the hull, so the ship's
     * "identity" was a property of one POI's light and would vanish the moment the
     * deferred lighting pass touched it. look-target.md gives Beta Decay the IDENTITY
     * half of the hybrid, and an identity that lives in the key is not an identity.
     *
     * Where the warm goes is ship-language.md §4's rule, not taste: the big armour
     * belts stay BONE (they are the calm reserve and a saturated fill across them is
     * the model-kit read §4 names), and the warm goes on the near-black, on the
     * machinery and on the WEAR - the surfaces whose warmth has a physical cause.
     * `baseDark` becomes a warm oxide near-black at the same luminance, and
     * `wear.oxide` - which was 0x2b2a24, warmth 0.027, i.e. a grey pretending to be
     * corrosion - becomes an actual rust. That last one is the highest-leverage
     * colour in the file for "over-used industrial object", because grime and streaks
     * are drawn from it on EVERY tier at every wear level, and it costs no geometry
     * and no detail density (ARCHITECTURE.md:24-26).
     *
     * `greeble` comes down 0.5 stops. It was 1.40 stops ABOVE the hull - the
     * machinery on a working salvager was the brightest surface on it. It is still
     * 0.90 stops above, so the round-two finding this brightness was raised to fix
     * ("the one dense element ... is far darker than everything around it, so it
     * reads as a decal boundary") does not come back, and at metalness 0.52 it keeps
     * a real metallic response - the file's opening note about F0 is respected, it is
     * just not being used to argue the machinery must be the lightest thing in frame.
     */
    /**
     * ===================================================================
     * PASS 13: THE SHIP HAD VALUE STRUCTURE AND NO PAINT
     * ===================================================================
     * reference-frames.md R6, which was NOT STARTED: "hulls carry painted colour
     * blocking, not only value and wear — faction identity legible as HUE at two
     * hull-lengths". And §4 item 3, which is the same defect measured from the other
     * end: "at engagement range the ship reads mean RGB 0.216 / 0.244 / 0.238 — COOL —
     * because at that distance it is lit almost entirely by blue fill and rim."
     *
     * MEASURED FIRST, on the generated albedo canvases at exactly the options
     * `cruiser.js#SURFACE` asks for, before this pass. `warmth` is mean sRGB R minus
     * mean sRGB B; `sat%` is the share of texels above l 0.15 whose HSV saturation
     * clears 0.5, i.e. tools/surface.mjs's own accent operator run on the TEXTURE:
     *
     *   variant     meanY    warmth   chroma   sat%   linear R/B
     *   hull       0.1186     0.050    0.126     0.0      1.32
     *   plating    0.0608     0.049    0.172     0.0      1.45
     *   hullDark   0.0141     0.051    0.375     0.0      2.18
     *   greeble    0.1647     0.076    0.163     0.0      1.46
     *
     * NOT ONE SATURATED TEXEL ANYWHERE ON THE SHIP. Every scrap of colour in a shipped
     * frame was the cream key (0xfff0d8) landing on a near-neutral hull, which is why
     * the same hull measures chroma 0.296 at giant-orbit and goes cool the moment the
     * light does. That is not an identity; it is a property of one POI.
     *
     * THE ARITHMETIC THAT SETS THE TARGET, AND IT IS NOT A TASTE NUMBER.
     *
     * A diffuse surface returns albedo x light, per channel. The graveyard key is
     * 0xb6c6da = linear (0.462, 0.564, 0.702), i.e. the LIGHT itself carries
     * B/R = 1.52. A hull whose albedo is linear R/B = 1.32 therefore comes back at
     * B/R = 1.15 — cool — however warm the palette says it is. To land warm under that
     * key the albedo needs R/B comfortably past 1.52; at 1.85-2.0 the product reads
     * R > B with margin, and at 2.5 (the mid tier) it stays warm under anything in the
     * POI table. That is the whole design rule for the numbers below.
     *
     * WHERE THE CHROMA GOES: UP AS THE VALUE GOES DOWN. reference-frames.md R5 —
     * "dark masses carry the warm accent" — and it is also the only physically honest
     * option, because a light paint cannot hold chroma (you cannot have a saturated
     * near-white) while a dark surface on a working ship is oxide, soot and burnt
     * coating, all of which are warm. So:
     *
     *   tier        chroma   what it is
     *   greeble       0.16   bare hardware. UNCHANGED, and it is the colour BLOCK:
     *                        unpainted machinery stays neutral against painted hull.
     *   hull          0.20   warm bone. The calm armour reserve.
     *   plating       0.28   the ship's mid; the tier that carries repairs.
     *   hullDark      0.38   warm oxide. The near-black, unchanged in hue.
     *
     * EVERY ONE OF THESE IS A ROTATION AT CONSTANT LINEAR LUMINANCE, held to better
     * than 0.1% by a byte-level solve, for the reason pass 10 wrote and pass 11 kept:
     * six POI keys are solved against `base`'s linear Y and re-valuing it would hand
     * the lighting stream a regression it did not cause.
     *
     *   base       0x716c63 -> 0x736c5c   Y 0.15137 -> 0.15143  (+0.04%)  R/B 1.32 -> 1.60
     *   baseAlt    0x625e56 -> 0x645e4f   Y 0.11274 -> 0.11279  (+0.05%)  R/B 1.31 -> 1.63
     *   plating    0x544f46 -> 0x564f3e   Y 0.07919 -> 0.07918  (-0.01%)  R/B 1.45 -> 1.93
     *   baseDark   0x282319 UNCHANGED — see below
     *
     * HOW FAR THE ROTATION GOES WAS SET BY A MEASUREMENT, AND THE FIRST ATTEMPT WAS
     * TOO FAR. Tried at base 0x776b58 / plating 0x594e3e / baseDark 0x2b2218 (R/B 1.89
     * / 2.07 / 2.65), which is where the "R/B past 1.85" argument above points, and
     * measured `tools/surface.mjs --frame ship` on three fresh cruiser probes:
     * SATURATED ACCENT 1.5% -> 13.7%, against §4's 3.5% budget and the 1.8-7.0%
     * reference range. That is nearly twice the top of a range measured off shipped
     * reference games, and reference-frames.md §5 is explicit that Everspace's
     * saturation is the thing NOT to take. Backed off to the numbers above, which
     * measure 5.5%: inside the reference range, over the older budget, and the reason
     * is stated rather than hidden — that operator counts the HULL'S OWN PAINT, which
     * is precisely what R6 asks us to add, not only the accent marks.
     *
     * `baseDark` DOES NOT MOVE, and its chroma 0.375 remains the highest on the ship,
     * so the chroma-rises-as-value-falls rule holds. It was rotated to 0.442 in the
     * first attempt and put back: at 16.1% of the ship's pixels its RENDERED chroma
     * went 0.417 -> 0.509, i.e. straight across the 0.5 threshold the accent operator
     * counts on, and it was worth about half of the 13.7% on its own.
     *
     * `greeble` and `bare` are deliberately NOT rotated. Both are metals, where the
     * albedo channel is F0 reflectance rather than a diffuse colour, and both are the
     * thing the painted tiers are supposed to be legible AGAINST.
     *
     * WHAT IT BOUGHT, measured on the LIVE GAME with the player hull masked by a
     * material-key ID pass (the `--frame scene` mask is nebula now, not ship), same
     * frozen tree, only these four files differing:
     *
     *   shot         mean RGB (off)        mean RGB (on)         warmth   verdict
     *   engagement   0.226/0.251/0.235     0.242/0.248/0.212     -0.009 -> +0.030
     *                                                            COOL   -> WARM
     *   close        0.448/0.399/0.321     0.471/0.397/0.296      0.127 -> 0.175
     *
     * The engagement row is reference-frames.md §4 item 3 closed: the ship no longer
     * goes cool when the key does. The luminance ladder over the same masks moves by
     * at most 0.004 at any percentile, which is the constant-Y claim above verified on
     * a rendered frame rather than asserted from the hexes.
     */
    /**
     * ===================================================================
     * PASS 14: PASS 13 ROTATED THE WRONG RATIO, AND THE SHIP IS STILL GREEN
     * ===================================================================
     * Pass 13, immediately above, closed `reference-frames.md` §4 item 3 on the
     * strength of one number — warmth, defined as mean sRGB R minus mean sRGB B —
     * going from -0.009 to +0.030 at engagement range. Its own table records the
     * frame it was measuring:
     *
     *     engagement   0.226/0.251/0.235  ->  0.242/0.248/0.212
     *
     * READ THE MIDDLE CHANNEL. 0.242 < 0.248. Green was the peak channel before and
     * green was still the peak channel after. §4 item 3 says the ship "reads mean RGB
     * 0.216 / 0.244 / 0.238 — COOL"; the defect is that the hull's own hue does not
     * survive the location, and R minus B cannot see it, because in that row R minus B
     * moves while the hull stays green. The item was reported closed and was not.
     *
     * RE-MEASURED ON HEAD, with the player hull isolated by a flat unlit material-key
     * ID pass rendered from the same camera (the `--frame scene` mask is a luma
     * threshold, which on a lit field is nebula and rocks as much as it is ship), at
     * 1600x900, `engagement`:
     *
     *   tier         px    share   mean RGB                  peak
     *   hull       6313   51.34%   0.2474 0.2637 0.2318      G
     *   plating    2597   21.12%   0.2672 0.2798 0.2424      G
     *   hullDark   1158    9.42%   0.1462 0.1569 0.1277      G
     *   greeble     949    7.72%   0.2667 0.2953 0.2684      G
     *   SHIP      12297  100.00%   0.2348 0.2501 0.2154      G   hue 86.5 deg
     *
     * Every tier on the ship renders green-dominant. The frame's own field measures
     * hue 94.4 deg (`docs/review/field-baseline.md`), so R3's "mean hull hue >= 60 deg
     * from mean background hue" is missed by 52 degrees: the separation is 7.9.
     *
     * WHY R/B IS THE WRONG RATIO, AND R/G IS THE RIGHT ONE.
     *
     * A diffuse surface returns albedo x irradiance PER CHANNEL, so the peak channel
     * of a rendered hull is decided by albedo_c x light_c. Pass 13 derived its target
     * from the graveyard key's B/R = 1.52 and stopped there. The same key, 0xb6c6da,
     * is linear (0.4735, 0.5647, 0.7011) — blue first and GREEN SECOND — so beating
     * blue is not enough. Red only becomes the peak channel if
     *
     *     albedo R/G  >  0.5647 / 0.4735  =  1.192
     *
     * before the graveyard's green fill (0x4c6a4a), its green rim (0x8fb04a) and its
     * green grade lift (0x4c6a4a at 0.038) are added. Measured on HEAD, the generated
     * albedo canvases at exactly the options `cruiser.js#SURFACE` asks for:
     *
     *   variant     mean linear R    G        B       R/G     R/B    peak under the key
     *   hull            0.13537  0.11851  0.08351   1.142   1.621    GREEN
     *   plating         0.07062  0.05915  0.03699   1.194   1.909    red, barely
     *   hullDark        0.02001  0.01609  0.00921   1.244   2.173    red
     *   greeble         0.20082  0.17905  0.13603   1.122   1.476    GREEN
     *
     * Pass 13 drove R/B from 1.32 to 1.60-1.93 and left R/G at 1.12-1.24. The tier
     * that owns 36.5% of the ship's surface area sits at 1.142 against a 1.192 break-
     * even, so the largest surface on the hull was authored to lose. That is the whole
     * defect, and it is arithmetic rather than taste.
     *
     * THE RENDERED THRESHOLD IS HIGHER THAN THE KEY'S, AND IT WAS MEASURED. Dividing
     * the rendered linear tier colour by its albedo linear colour on the frame above
     * gives the system transfer, red-normalised: (1, 1.296, 1.427) on `hull`, (1,
     * 1.308, ...) on `plating`, (1, 1.424, ...) on `hullDark`. Green is amplified
     * MORE than the key alone predicts, because the fill, the rim and the grade lift
     * are all green as well. So:
     *
     *   albedo R/G >= 1.30   the tier stops rendering green-dominant
     *   albedo R/G >= 1.37   rendered hue drops below 34 deg, which is R3's 60 deg
     *                        of separation from a 94 deg field
     *
     * THE ROTATION IS FREE, AND THAT IS THE POINT. Pass 13 spent CHROMA to buy
     * warmth, measured its first attempt at 13.7% saturated accent against a 3.5%
     * budget, and had to back off. Hue and chroma are different axes and only one of
     * them had ever been spent. `tools/surface.mjs`'s accent operator counts a texel
     * whose HSV saturation (max-min)/max clears 0.5, and its `chroma` column is the
     * same quantity on the mask mean — NEITHER IS A FUNCTION OF HUE. So every hex
     * below is solved at
     *
     *     constant linear luminance   (0.2126R + 0.7152G + 0.0722B, held to 0.36%)
     *     constant sRGB chroma        ((max-min)/max, held to 0.0044)
     *     constant channel ordering   (R > G > B)
     *
     * and the change comes out of GREEN and goes into RED AND BLUE together, in the
     * proportion that holds (max-min)/max fixed. Luminance is held for the reason pass
     * 10 wrote and passes 11 and 13 kept: six POI keys below are solved against
     * `base`'s linear Y and re-valuing it hands the lighting stream a regression it
     * did not cause.
     *
     *   hex        from        Y         R/G    chroma   hue      to          Y         R/G    chroma   hue
     *   base       0x736c5c  0.15143   1.143   0.200   41.7    0x7a6962  0.15123   1.378   0.197   17.5
     *   baseAlt    0x645e4f  0.11279   1.139   0.210   42.9    0x6b5b55  0.11264   1.405   0.206   16.4
     *   plating    0x564f3e  0.07918   1.190   0.279   42.5    0x5b4d42  0.07925   1.410   0.275   26.4
     *   baseDark   0x282319  0.01723   1.262   0.375   40.0    0x2d211c  0.01729   1.725   0.378   17.6
     *   greeble    0x989080  0.28180   1.126   0.158   40.0    0x9f8d86  0.28142   1.302   0.157   16.8
     *   bare       0xd0c7b6  0.57634   1.104   0.125   39.2    0xd5c5ba  0.57624   1.192   0.127   24.4
     *
     * `wear.oxide` (0x34291d) IS ALREADY AT R/G 1.549 and is not touched — it was the
     * one colour pass 11 rotated far enough, and it is why the grime and streak layers
     * were the warmest thing on the ship.
     *
     * `greeble` AND `bare` ARE ROTATED THIS TIME, and pass 13's reason for exempting
     * them does not survive the measurement. The argument was that both are metals,
     * where the albedo channel is F0 reflectance rather than a diffuse colour. True,
     * and irrelevant to hue: a coloured F0 multiplies the incoming light exactly the
     * same way a diffuse albedo does, so a metal authored at R/G 1.12 renders green
     * under this key just as a paint does — measured above at 0.2667/0.2953/0.2684,
     * the greenest tier on the ship. What the exemption was really protecting is the
     * COLOUR BLOCK, i.e. that unpainted machinery stays legible against painted hull,
     * and that block is carried by CHROMA (0.157 against the paint's 0.197-0.378) and
     * by metalness, neither of which moves here. `reference-ui-language.md` §1's "no
     * third hue anywhere in frame" argues the other way outright.
     *
     * `trim` (0xb39152) IS ALREADY AT R/G 1.592 and stays; it is still not rendered on
     * the player cruiser, per the note below, and is not credited with anything.
     *
     * WHAT THE OTHER FACTIONS MEASURE, stated because it is the surprise: coalition is
     * at R/G 1.406 / 1.417 / 1.537 (base / plating / baseDark) and derelict at 1.544.
     * Both warm factions were ALREADY past the threshold; the player hull was the only
     * one under it. Concord is at 0.909 and is supposed to be — it is the cool faction
     * and R6 wants that legible. Nothing outside `player` is touched by this pass.
     */
    base: 0x7a6962,
    baseAlt: 0x6b5b55,
    baseDark: 0x2d211c,    // warm oxide near-black, chroma 0.38 at Y 0.0173, hue 17.6
    plating: 0x5b4d42,     // 0.93 stops under `base`; the ship's MID value
    greeble: 0x9f8d86,     // machinery, down 0.5 stops, still 0.90 above the hull
    /**
     * Muted amber - the one identity hue, per look-target.md §1's "faction hue
     * survives as the one identity exception". It was 0xa8a08f, a bone, which meant
     * the player ship had NO accent colour anywhere: `variantSpec('trim')` draws this
     * only as an edge band on real structure (§4a), and a bone edge band on a bone
     * hull is not a band.
     *
     * STATED PLAINLY BECAUSE IT IS NOT VISIBLE IN THIS PASS'S FRAMES: `cruiser.js#
     * SURFACE` has no `trim` entry - the geometry stream deleted it for a draw call -
     * so nothing on the player cruiser renders this today. It is an identity
     * declaration the fleet path (`ships/common.js#SURFACES`) already reads, and it
     * is NOT part of the before/after measured below. Do not credit it with anything.
     */
    /**
     * PASS 13: THE ACCENT NOW HAS TO CLEAR A MEASUREMENT, SO IT IS AUTHORED TO.
     *
     * `tools/surface.mjs` counts a texel as saturated accent when it is above l 0.15
     * and its HSV saturation clears 0.5. 0xab9364 measures chroma 0.415 — it is a
     * perfectly good muted amber and it would NEVER have been counted, so the ship
     * could have been striped in it end to end and still measured 0% saturated albedo.
     * That is the gap between "there is an accent colour in the file" and "the amber
     * identity is on the ship".
     *
     * 0xb39152 is the same luminance (Y 0.30445 -> 0.30444) rotated to chroma 0.542,
     * i.e. an ochre a yard would actually mix, and it is still nowhere near the arcade
     * saturation reference-frames.md §5 forbids ("do not adopt Everspace's saturation
     * on the hull") — Everspace's gold reads past 0.85.
     *
     * STILL NOT RENDERED ON THE PLAYER CRUISER, and the note above stays true: there
     * is no `trim` entry in `cruiser.js#SURFACE`, so this hex reaches the fleet path
     * and nothing else. It was tried as an edge band on the `hullDark` tier this pass
     * — R5 puts the accent on the dark masses and hullDark is every one of them — and
     * the attempt is written up with its arithmetic in `hullMaps.js#variantSpec`,
     * where it was measured to cost the near-black tier 0.8 to 1.2 stops. Do not
     * credit this line with any of the accent measured on the cruiser; that came from
     * `macro.js`, on the named structure.
     */
    trim: 0xb39152,
    glass: 0x090c10,
    burn: 0x14110d,
    bare: 0xd5c5ba,        // bare metal at plate edges, same Y, R/G 1.104 -> 1.192

    /**
     * The running lights and the drive were the last two cool things on the player
     * ship, and running lights are the game's ruler - the one element that repeats
     * every 40 m in every frame. A cool-white ruler on a bone hull under a cream key
     * is the fourth temperature the reference says must not exist. Bone-white lamps
     * and a warm drive; the HOT core stays near-white because a hot thing is white.
     */
    emissive: 0xe6ded0,    // bone-white
    emissiveHot: 0xfdf8ee,
    engine: 0xf0c898,
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
    /**
     * `greeble` came down from metalness 0.88, and it is the fix for "the one dense
     * element on the ship ... is far darker than everything around it, so it reads as
     * a decal boundary rather than a structural one".
     *
     * That patch was dark for a physical reason, not an authoring one. A metal has no
     * diffuse lobe: at 0.88 metalness essentially the whole response is the specular
     * reflection of the environment, and this rig runs `scene.environmentIntensity` at
     * a deliberate 0.10 so the IBL cannot flatten the terminator. Metal + almost no
     * environment = almost black, whatever the albedo says. At 0.52 the machinery
     * keeps a real metallic highlight off the key and gets its base value back from
     * the diffuse term, which lands it within a stop of the plating around it — which
     * is the review's own criterion for it reading as structure rather than as a
     * sticker.
     */
    /**
     * `variance` IS WHAT MAKES PLATE READ AS WORKED METAL RATHER THAN AS CLAY, and
     * it was the smallest number in this block.
     *
     * It is the panel-to-panel roughness swing: `hullMaps.js` writes
     * `S.roughness + roughVar * S.variance * 0.55` into the ORM's green channel, so
     * at variance 0.16 the whole armour belt sits inside +/- 4.4 points of roughness
     * and every plate on a 1.4 km hull returns the key at the same width. That is the
     * signature of a moulded object. A yard's plates come from different heats, get
     * different primer and get worked differently, and the ONLY free evidence of that
     * is how wide each one's highlight is.
     *
     * This is a specular change, not a detail change: no feature is added anywhere
     * (ARCHITECTURE.md:24-26), the existing plate field just stops agreeing with
     * itself about finish. `plating` gets the widest swing because it is the tier
     * that carries the repairs, `hull` less because it is the calm armour reserve,
     * and `hullDark` goes ROUGHER as well - recessed structure and shadowed plate is
     * unfinished steel, and a rough surface spreads the specular floor that is
     * currently eating two thirds of that tier's authored depth.
     */
    surface: {
      hull: { metalness: 0.18, roughness: 0.56, variance: 0.26 },
      /**
       * ROUGHNESS STAYS AT 0.80. TRIED AT 0.90 AND MEASURED THE WRONG WAY, RECORDED
       * SO THE NEXT PASS DOES NOT SPEND THE SAME HOUR.
       *
       * The art direction asks to "drive hullDark's lit target to <= 0.14", and this
       * file's only lever on it is the specular floor, because measured by ablation on
       * the `close` frame at 2560x1440 — black this tier's albedo out entirely and
       * re-render — the pixels that move still come back at p50 0.135. That floor is
       * fill, rim and the dielectric F0 = 0.04 specular under an I = 14 key, none of
       * which is authored in a file this stream owns.
       *
       * The theory was that a wider lobe returns less at the mirror angle. What
       * actually happened is that a rougher dielectric spreads the same energy over
       * more of the surface AND picks up more of three's multi-scatter compensation,
       * so the tier's lit percentile went UP, not down. Reverted.
       */
      hullDark: { metalness: 0.26, roughness: 0.80, variance: 0.22 },
      plating: { metalness: 0.22, roughness: 0.48, variance: 0.30 },
      greeble: { metalness: 0.52, roughness: 0.46, variance: 0.26 },
      trim: { metalness: 0.12, roughness: 0.50, variance: 0.12 },
      // Heat rejection: a black coating chosen for emissivity, so nearly pure
      // dielectric and very rough. It is the darkest large surface in the game.
      radiator: { metalness: 0.10, roughness: 0.88, variance: 0.08 },
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
      /**
       * UNCHANGED AT 0.38, AND THE REASON IS RECORDED BECAUSE IT WAS CHANGED TWICE
       * IN THIS PASS AND BOTH TIMES WRONGLY.
       *
       * Once the detail-gain crush in hullShader.js was fixed, the ventral bay
       * structure came back reading as brown BRICKWORK - a lattice of bright lines
       * around every plate. The obvious suspect is this dial, which scales the seam
       * darkening and the recess cavity, and it was moved to 0.46 and then to 0.26
       * chasing it. Neither helped, because the lattice is not made of seams: it is
       * made of `wear.edge` below, which lerps every plate LIP to bare metal at
       * Y 0.576, i.e. a 4.5-stop bright line drawn around each plate on a near-black
       * surface. Ablating `wear.edge` to 0 removed the brickwork completely and left
       * the plate layer looking correct; ablating this dial did not.
       *
       * So it goes back to where it was and the fix lands on the term that was
       * actually responsible.
       */
      plateContrast: 0.38,
      calm: 0.62,
    },

    /**
     * `oxide` WAS A GREY PRETENDING TO BE CORROSION. 0x2b2a24 measures warmth
     * (sRGB R minus B) 0.027 and chroma 0.163 - it is a neutral dark, and it is what
     * `hullMaps.js` lerps grime and streaks towards on EVERY tier. So the layer whose
     * entire job is to say "this thing has been used hard for a long time" was
     * painting the hull with more of the same colour the hull already was.
     *
     * 0x322a1b is the same luminance band (Y 0.0230 -> 0.0241) and an actual rust.
     * Because it rides the grime and streak masks it lands in cavities and runs down
     * from seams - i.e. exactly where §4 says colour is allowed to be, on structure
     * and never as a fill - and it is the cheapest warm in the file: no geometry, no
     * new feature, no detail density.
     *
     * `grime` 0.40 -> 0.46 for the same reason and with the same constraint: it is a
     * mask amplitude on a field that already exists, not a new field.
     *
     * `edge` 0.55 -> 0.34, AND THIS IS THE ONE THAT WAS DRAWING BRICKWORK.
     *
     * `wear.js#edgeWear` scales by `o.edge * amt * 1.9`, so at 0.55 the plate lips
     * saturate and `hullMaps.js` lerps them ALL THE WAY to `pal.bare` — a bone metal
     * at Y 0.576. On the near-black tier (Y 0.024) that is a four-and-a-half stop
     * bright line drawn around every plate in the tile, i.e. mortar, and the plate
     * field underneath it is a staggered course of rectangles. It had never been
     * visible because the detail-gain crush in hullShader.js was lerping the whole
     * surface towards mid grey and taking the lines with it; the moment the crush was
     * fixed, the ventral bay read as a brick wall.
     *
     * Verified by ablation rather than by argument: `edge: 0` removes the lattice
     * entirely and leaves a calm plate field (docs/review/w3-after and the run log in
     * the stream report), while moving `plateContrast` in either direction does not.
     * At 0.34 the lips still show metal where a lip is genuinely proud — this hull is
     * "half-stripped gunmetal" and should — without outlining every plate on it.
     *
     * STATED COST, because it is a real one and it should not be discovered by a
     * critic: this term was carrying most of the ship's measured `dense` frequency.
     * `tools/surface.mjs --frame ship` on a fresh cruiser probe reads dense 8.2% ->
     * 1.9%, which is now BELOW §3's six-reference envelope of 6.8-22.1%. That is the
     * right trade and not a regression in disguise: §3 puts dense in 55 x 200 m bands
     * on machinery and structure and forbids it "on any continuous armour face larger
     * than 60 x 120 m", and a bright lattice around every plate on every face is
     * exactly the forbidden case. The ship's real dense content should come from the
     * greeble bands, and at 1.9% there is not enough of it — a geometry-stream item,
     * filed in the report, not something to buy back by re-outlining the plates.
     */
    /**
     * PASS 13: `oxide` gets the same rotation the hull family gets, at the same linear
     * luminance (0x312a1e -> 0x34291d, Y 0.02403 -> 0.02405, +0.08%). It rides the
     * grime and streak masks on EVERY tier, so it is the cheapest hue in this file —
     * it lands in cavities and runs down from seams, which is exactly where §4 allows
     * colour to be, and it costs no geometry and no detail density
     * (ARCHITECTURE.md:24-26). chroma 0.388 -> 0.442.
     */
    wear: { edge: 0.34, streak: 0.62, grime: 0.46, pit: 0.12, oxide: 0x34291d },

    /**
     * `hazardA` was 0xbfa53a - a mustard yellow that is neither the amber the
     * identity asks for nor a colour any yard has ever mixed. ACCESS ORANGE, same as
     * every other faction, because the mark encodes the function. `ink` goes bone so
     * a stencilled registry number is paint on this ship rather than a cool decal.
     */
    marking: {
      ink: 0xd0cabd, inkDark: 0x131417,
      hazardA: 0xbe6a22, hazardB: 0x16171a,
      sensor: 0xe9e3d6,
    },
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
    /*
     * ROUND THREE: THE KEY WAS RIGHT AND EVERYTHING ELSE WAS TOO BRIGHT.
     *
     * Round-two review, MAJOR: "The hull is now too LIGHT and too flat, which is the
     * exact mirror of the defect D42 was written to fix. A lit flank crop measures
     * p05 0.398, median 0.632, p95 0.714 — the entire hull lives inside a third of a
     * stop near the top of the curve and nothing on it goes dark ... the shadow end is
     * simply unused."
     *
     * Reproduced exactly with `tools/surface.mjs --crop 0.34,0.40,0.52,0.50` before
     * touching anything: p05 0.438, median 0.624, p95 0.718 on the lit flank, and
     * p05 0.509 median 0.666 on the bridge tower. The tower's face TURNED AWAY from
     * the key measured 0.587. A face at NdotL = 0 has no key on it at all, so 0.587
     * is what the non-key terms alone were delivering — and 0.587 sRGB back-solves
     * through ACES to an irradiance of about 6.0, against a stated fill+bounce+rim+ibl
     * sum of 1.54. The extra was the three terms being SUMMED on faces that all four
     * of them happened to reach at once, on a hull with almost no geometry between
     * them.
     *
     * So the key stays where the solve put it and the ambient comes down hard:
     *
     *   fill    0.40 -> 0.16    bounce 0.16 -> 0.05
     *   rim     0.82 -> 0.42    ibl    0.16 -> 0.10   grade lift 0.045 -> 0.018
     *
     * Key-to-fill goes 35:1 -> 84:1. The key itself comes 14.0 -> 11.5 to hold a fully
     * lit face at 0.71 rather than 0.765, because with the ambient gone the SPECULAR
     * lobe is a larger share of what is left and the previous number was landing the
     * brightest armour on the ACES shoulder where a 30% irradiance change moves the
     * value by four points and nothing separates.
     *
     * Predicted, from `tools/surface.mjs`'s own model (see the run log in the stream
     * report): NdotL 1.0 -> 0.71, the 45 degree deck -> 0.55, a face turned away from
     * the key -> 0.10. That is §4's three-value read with the bottom value ACTUALLY AT
     * THE BOTTOM, which is the thing two passes of this file have failed to deliver.
     */
    key: { color: 0xfff0d8, intensity: 11.5, angularRadius: 0.009 },
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
    fill: { color: 0x3f63b4, intensity: 0.16, broad: 0.62 },
    bounce: { color: 0x6f8ed8, intensity: 0.05 },
    // The kicker. Tracks the camera, sits behind the subject, and is the only thing
    // separating a grey hull from a black sky when the key is on the far side. It is
    // the second half of the cobalt problem - on a face the key misses, the rim is
    // the ONLY light - so it broadens too, less far, because a kicker is allowed to
    // be cold and it is directional enough to describe an edge rather than fill a
    // face. Stepped down with the key raised: 0.82 against 6.0 is a 7:1 ratio where
    // 0.95 against 4.6 was 5:1.
    rim: { color: 0x8fb4ff, intensity: 0.42, broad: 0.30 },
    shadow: 0x050912,
    fog: { color: 0x16223c, density: 0.000012 },
    accent: 0x8fb4ff,
    ibl: { zenith: 0x0a1024, horizon: 0x24406e, ground: 0x070b16, sun: 0xfff3e0, sunSize: 0.055, intensity: 0.10 },
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
      lift: 0x35558c, gain: 0xffe8c8, liftAmount: 0.018, gainAmount: 0.22, saturation: 1.02,
    },
  },

  /*
   * THE SAME CUT, APPLIED TO EVERY OTHER LOCATION.
   *
   * `giant-orbit` above is the one that was measured, and the defect it was measured
   * against — "the entire hull lives inside a third of a stop near the top of the
   * curve and nothing on it goes dark" — is a property of the RATIO between the key
   * and the sum of the omnidirectional terms, not of the location. Every POI below was
   * solved in the same pass, against the same 0.765 target, with the same fill levels,
   * so every one of them has it.
   *
   * Keys x0.82 (re-solving a fully lit face from 0.765 to ~0.71), fills x0.50,
   * bounces x0.45, rims x0.60. STATED LIMITATION, because it matters: only
   * `giant-orbit` and `station` have been re-measured on a rendered frame this pass.
   * The other four are carried on the arithmetic and on the fact that the change can
   * only move them in the direction the review asked for. They should be shot and
   * measured before anyone quotes them.
   */
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
    key: { color: 0xffe2b6, intensity: 13.0, angularRadius: 0.014 },
    fill: { color: 0x6b5a44, intensity: 1.05, broad: 0.30 },  // dust bouncing off a million rocks
    bounce: { color: 0x8a7350, intensity: 0.37 },
    rim: { color: 0xd89a4a, intensity: 0.57 },
    shadow: 0x0a0806,
    fog: { color: 0x2a2018, density: 0.000042 },
    accent: 0xd89a4a,
    ibl: { zenith: 0x0b0a08, horizon: 0x2e2418, ground: 0x100c08, sun: 0xffe6bc, sunSize: 0.07, intensity: 0.42 },
    grade: {
      exposure: 1.0, bloom: 0.38, godrays: 0.48, vignette: 0.46,
      lift: 0x6b5a44, gain: 0xffe8c8, liftAmount: 0.020, gainAmount: 0.26, saturation: 1.02,
    },
  },

  graveyard: {
    id: 'graveyard',
    name: 'The Graveyard',
    key: { color: 0xb6c6da, intensity: 16.4, angularRadius: 0.006 },
    // The nebula IS the fill here, and it is the only reason anything in this POI
    // is visible at all. Stated brighter than it looks because the key is weak.
    fill: { color: 0x4c6a4a, intensity: 0.78, broad: 0.34 },
    bounce: { color: 0x2b3c4e, intensity: 0.35 },
    // Sick derelict green off the nebula, and the strongest rim in the game: this
    // location is defined as "everything is silhouette", and a silhouette with no
    // rim is just black.
    rim: { color: 0x8fb04a, intensity: 0.63 },
    shadow: 0x02040a,
    fog: { color: 0x0e1620, density: 0.000030 },
    accent: 0x8fb04a,                                // derelict light, leaking
    ibl: { zenith: 0x03060c, horizon: 0x14202e, ground: 0x04070c, sun: 0xc2d2e4, sunSize: 0.035, intensity: 0.40 },
    grade: {
      exposure: 1.0, bloom: 0.46, godrays: 0.22, vignette: 0.50,
      // A dim frame needs MORE value separation, not less: lift the floor off zero
      // so wreckage separates from the void instead of merging with it.
      lift: 0x4c6a4a, gain: 0xdfeee0, liftAmount: 0.038, gainAmount: 0.16, saturation: 1.06,
    },
  },

  yard: {
    id: 'yard',
    name: 'Fitting Yard',
    key: { color: 0xffd9a0, intensity: 14.2, angularRadius: 0.02 },  // work lights, not a star
    fill: { color: 0x2b3442, intensity: 1.05, broad: 0.38 },
    bounce: { color: 0x4a5468, intensity: 0.37 },
    rim: { color: 0xffa93c, intensity: 0.51 },
    shadow: 0x05070c,
    fog: { color: 0x1a212c, density: 0.000022 },
    accent: 0xffa93c,
    ibl: { zenith: 0x060a12, horizon: 0x232c3a, ground: 0x0a0d14, sun: 0xffdcae, sunSize: 0.10, intensity: 0.46 },
    grade: {
      exposure: 1.0, bloom: 0.40, godrays: 0.28, vignette: 0.38,
      lift: 0x3c5170, gain: 0xffe8c8, liftAmount: 0.021, gainAmount: 0.26, saturation: 1.02,
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
    key: { color: 0xfff6ea, intensity: 16.6, angularRadius: 0.05 },  // brutal
    fill: { color: 0x7a4226, intensity: 0.95, broad: 0.16 },
    bounce: { color: 0xa85c2e, intensity: 0.32 },
    rim: { color: 0xff7a2a, intensity: 0.78 },
    shadow: 0x0c0603,
    fog: { color: 0x3c1e0e, density: 0.000055 },
    accent: 0xff7a2a,
    ibl: { zenith: 0x120804, horizon: 0x5a2c12, ground: 0x1a0c05, sun: 0xfffaf0, sunSize: 0.16, intensity: 0.67 },
    grade: {
      exposure: 0.86, bloom: 0.62, godrays: 0.66, vignette: 0.52,
      lift: 0x7a4226, gain: 0xffe8c8, liftAmount: 0.018, gainAmount: 0.24, saturation: 1.0,
    },
  },

  station: {
    id: 'station',
    name: 'Station Approach',
    key: { color: 0xdce8f4, intensity: 12.7, angularRadius: 0.008 },
    fill: { color: 0x27374e, intensity: 1.05, broad: 0.40 },
    bounce: { color: 0x3c5170, intensity: 0.37 },
    rim: { color: 0x59c8ff, intensity: 0.57 },
    shadow: 0x04070e,
    fog: { color: 0x141e2c, density: 0.000018 },
    accent: 0x59c8ff,
    ibl: { zenith: 0x050912, horizon: 0x1c2c42, ground: 0x070b12, sun: 0xe6f0fa, sunSize: 0.04, intensity: 0.51 },
    grade: {
      exposure: 1.0, bloom: 0.42, godrays: 0.20, vignette: 0.40,
      lift: 0x27374e, gain: 0xf0f6ff, liftAmount: 0.021, gainAmount: 0.20, saturation: 1.02,
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
  'ink', 'inkDark', 'hazardA', 'hazardB', 'sensor',
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
