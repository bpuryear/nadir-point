/**
 * THE HULL SHADER PATCH — two things a tiling texture cannot do, for one extra
 * texture fetch and about thirty ALU ops.
 *
 * `MeshStandardMaterial` samples its five maps at `vMapUv`, which the registry sets
 * to metres / plate-size. On a 1400 m hull with a 26 m tile that is fifty-four
 * repeats of an identical image, and the eye locks onto it. This patch, applied
 * through `onBeforeCompile`, adds:
 *
 * 1. A DOMAIN WARP on the detail UVs, from an analytic two-octave value noise whose
 *    period is a few plate tiles. The plate grid stops being a lattice: rows bow and
 *    drift by a few metres, so no repeat ever lines up with the one before it. This
 *    is the change that actually kills the LATTICE, as opposed to hiding it.
 *    Analytic rather than a texture on purpose — a tileable warp map would need its
 *    own sampler, and a non-tileable one would seam.
 *
 * 2. THE MACRO LAYER from textures/macro.js, addressed in OBJECT SPACE, so it is
 *    sampled once from stem to stern instead of repeating. It carries the value
 *    drift that stops two repeats reading as the same patch, the soot that trails
 *    off vents and drive bells, and the hand-placed asymmetric marks.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS IS ONE SHADER PROGRAM AND NOT N
 * ---------------------------------------------------------------------------
 * The GLSL emitted here is byte-identical for every hull material in the game; only
 * uniform values differ. `customProgramCacheKey` therefore returns a CONSTANT, so
 * three groups all of them onto the same program and the patch costs one extra
 * program variant in total, not one per material. The draw-call and program budgets
 * (units.js: 320 draws, 90 programs) are already the tightest constraint in the
 * project and a per-material shader would have blown the second one on its own.
 *
 * ---------------------------------------------------------------------------
 * THE ONE THING TO KNOW BEFORE EDITING
 * ---------------------------------------------------------------------------
 * `onBeforeCompile` receives the shader with `#include <...>` UNRESOLVED. Every
 * chunk replaced below is therefore written out in full, copied from
 * three/src/renderers/shaders/ShaderChunk at r185. If three renames or restructures
 * one of those chunks the replacement silently stops matching, the `#include`
 * survives, and the hull quietly loses its macro layer — which looks exactly like a
 * texturing regression and would be debugged in the wrong file. `sub()` therefore
 * counts every substitution and `console.error`s the exact chunk names that failed,
 * which `npm run smoke` fails on.
 */

import * as THREE from 'three';
import { MACRO_DEFAULT_M, MACRO_RELIEF_M } from '../textures/macro.js';

/**
 * ---------------------------------------------------------------------------
 * ROUND THREE: THE MACRO LAYER NOW CARRIES RELIEF, NOT JUST PAINT
 * ---------------------------------------------------------------------------
 * Round-two review, three separate BLOCKERs that all reduce to one mechanism:
 *
 *   "There is currently exactly one dense element on the entire 1400 m ship."
 *   "if you want greeble somewhere, cut a recess for it first."
 *   "The ship does not read as self-shadowing anywhere in the shipped frames."
 *
 * A tiling detail map cannot cut a recess, because it does not know where it is. The
 * macro layer does — it is addressed in object space and sampled once from stem to
 * stern. So its G channel stopped being a roughness scribble and became a HEIGHT
 * FIELD in metres of hull, and three things are derived from it, all from the one
 * texture fetch that was already being paid for:
 *
 * 1. NORMAL PERTURBATION. `dFdx`/`dFdy` of the sampled height, fed through the same
 *    surface-gradient construction three's own `perturbNormalArb` uses. A 12 m recess
 *    at the bay rail now shades like a 12 m recess: its far wall goes dark under the
 *    key and its near lip catches it. No extra sampler, no tangents required, and it
 *    is object-space so it survives every mip drop the tiling maps do not.
 *
 * 2. CAVITY. Anything below the neutral plane loses indirect light and a little
 *    albedo, which is what a hole in a hull does. This is what makes a recess read as
 *    depth under a key that does not happen to rake across it.
 *
 * 3. DETAIL GAIN — the frequency hierarchy, applied per square metre rather than per
 *    material. The tiling detail map's relief and contrast are multiplied UP where
 *    the macro layer says there is structure (a recess, a frame, a machinery band)
 *    and DOWN over open armour. One tiling map therefore renders as calm over the
 *    700 m flank belts and as dense inside the bands, which is §3's 60/30/10 split
 *    expressed as a field instead of as three separate materials that geometry has to
 *    place perfectly.
 *
 * The gradient is CLAMPED. At a macro region boundary — the six-way split on the
 * dominant object-space normal axis — the atlas UV jumps, and an unclamped derivative
 * there would draw a bright hairline along every chine. The clamp bounds it to
 * something indistinguishable from the chine's own highlight.
 */

/** Bumped when the GLSL below changes, so a stale program cache cannot survive it. */
const PATCH_VERSION = 'nadir/hull-macro/5';

const PARS_FRAGMENT = /* glsl */`
varying vec3 vNadirObjPos;
varying vec3 vNadirObjNrm;
uniform sampler2D nadirMacroMap;
/** x: 1/macroM   y: albedo drift   z: soot amount   w: ink amount */
uniform vec4 nadirMacro;
/** x: warp uv frequency   y: warp amplitude (uv units)   z: roughness drift   w: unused */
uniform vec4 nadirWarp;
/**
 * x: macro height range, METRES for a full 0..1 swing of the G channel
 * y: cavity strength      z: detail gain      w: max |dH| per pixel (the clamp)
 */
uniform vec4 nadirRelief;
uniform vec3 nadirInkColor;
uniform vec3 nadirHazardColor;
uniform vec3 nadirSensorColor;
uniform vec3 nadirSootColor;

/**
 * THREE MARK FAMILIES OUT OF ONE CHANNEL, AND THE THIRD ONE IS THE SEMANTIC RULE.
 *
 * closest-comparables.md records Falling Frontier's convention and this pass adopts
 * it: the colour of a mark encodes what the thing under it IS, applied consistently
 * enough that function is legible before you read a label.
 *
 *   value 0.42  INK      registry lettering, sigils, repair-patch outlines. Paint.
 *   value 0.72  HAZARD   ACCESS AND MAINTENANCE. Hatches, bays, tubes, mount pads,
 *                        drive wells - anything that opens, moves or is serviced.
 *                        Orange, and the SAME orange on every faction, because it
 *                        describes a function rather than a nationality.
 *   value 1.00  SENSOR   arrays, apertures, mast heads. Bone white.
 *
 * Returned as (amount, hazardWeight, sensorWeight) so the caller can mix three ways
 * from one fetch. The bands are smoothsteps rather than steps so a filtered texel
 * cannot flicker between families.
 *
 * THE ORDER OF THE THREE BANDS IS NOT ARBITRARY, AND GETTING IT WRONG COSTS THE
 * LOUDEST COLOUR ON THE SHIP.
 *
 * A mark's outer edge is a filtered ramp from its own value down to zero, so it
 * passes through every band BELOW it on the way out. Sensor was tried at 0.72 with
 * hazard at 1.0, and the consequence is arithmetic: a hazard patch is the largest
 * mark on the hull, its bars are only two or three texels wide at 4.17 m/texel, and
 * every one of them would have carried a bone-white fringe on both sides - which at
 * the default 3200 m camera averages an ORANGE access marking towards WHITE, i.e.
 * destroys the semantic rule at exactly the distance the rule exists to serve.
 *
 * With hazard in the middle band, a hazard patch's ramp passes through hazard and
 * then briefly through ink, which is the sub-4 m darker edging the previous
 * two-family version already had and already accepted. The fringe moves onto the
 * SENSOR family instead, whose members are thin outlines with the smallest area on
 * the ship, and it puts a warm rim on a white aperture - which is what a warm key on
 * a white ring does anyway.
 */
vec3 nadirMark(float a) {
  float amount = smoothstep(0.10, 0.30, a);
  float sen = smoothstep(0.84, 0.94, a);
  float haz = smoothstep(0.55, 0.66, a) * (1.0 - sen);
  return vec3(amount, haz, sen);
}

float nadirHash(vec2 p) {
  p = fract(p * vec2(233.34, 451.21));
  p += dot(p, p + 23.45);
  return fract(p.x * p.y);
}

float nadirNoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(nadirHash(i), nadirHash(i + vec2(1.0, 0.0)), f.x),
    mix(nadirHash(i + vec2(0.0, 1.0)), nadirHash(i + vec2(1.0, 1.0)), f.x),
    f.y);
}

/**
 * Two octaves. One alone is a smooth slide that the eye reads as a wobble; two give
 * the seam lines a believable local kink as well as the long drift.
 */
vec2 nadirWarpOffset(vec2 uv) {
  vec2 q = uv * nadirWarp.x;
  vec2 a = vec2(nadirNoise(q), nadirNoise(q + 31.7)) - 0.5;
  vec2 b = vec2(nadirNoise(q * 2.17 + 11.3), nadirNoise(q * 2.17 + 57.1)) - 0.5;
  return (a + b * 0.5) * nadirWarp.y;
}

/**
 * Object-space position and normal -> a point inside one of the six atlas regions.
 * The SIGN of the dominant axis is part of the region index, which is the whole
 * reason port and starboard do not carry mirror-matched marks.
 */
vec2 nadirMacroUV(vec3 p, vec3 n) {
  vec3 a = abs(n);
  vec2 f;
  float idx;
  /**
   * THE SIGN ON THE FIRST AXIS IS HANDEDNESS, AND GETTING IT WRONG PRINTS THE HULL
   * NUMBER BACKWARDS.
   *
   * A region projects two object-space axes onto a face. For the lettering to read
   * left-to-right when you are looking AT that face, (axis1, axis2, outwardNormal)
   * has to be a RIGHT-handed triple. Three of the six are not:
   *
   *   0  +X starboard  (z, y)   z x y = -x, against +x  -> flip
   *   1  -X port       (z, y)   z x y = -x, along  -x   -> keep
   *   2  +Y deck       (x, z)   x x z = -y, against +y  -> flip
   *   3  -Y belly      (x, z)   x x z = -y, along  -y   -> keep
   *   4  +Z bow        (x, y)   x x y = +z, along  +z   -> keep
   *   5  -Z stern      (x, y)   x x y = +z, against -z  -> flip
   *
   * Caught in docs/probes/cruiser.png, where the registry code on the starboard
   * flank rendered as a mirror image — which is worse than carrying no marking at
   * all, because a backwards glyph reads as a rendering bug rather than as paint.
   * textures/macro.js#AXIS_FLIP carries the same three signs so a mark authored at
   * a station in ship metres still lands at that station.
   */
  if (a.x >= a.y && a.x >= a.z)      { f = vec2(n.x >= 0.0 ? -p.z : p.z, p.y); idx = n.x >= 0.0 ? 0.0 : 1.0; }
  else if (a.y >= a.z)               { f = vec2(n.y >= 0.0 ? -p.x : p.x, p.z); idx = n.y >= 0.0 ? 2.0 : 3.0; }
  else                               { f = vec2(n.z >= 0.0 ? p.x : -p.x, p.y); idx = n.z >= 0.0 ? 4.0 : 5.0; }
  // Half a texel of inset so bilinear filtering never reaches the next region.
  f = clamp(f * nadirMacro.x + 0.5, 0.004, 0.996);
  float col = mod(idx, 3.0);
  float row = 1.0 - floor(idx / 3.0);
  return (vec2(col, row) + f) / vec2(3.0, 2.0);
}

/**
 * Surface-gradient normal perturbation from a height sampled at this pixel.
 *
 * This is three's own perturbNormalArb construction (ShaderChunk/bumpmap_pars),
 * inlined because the material is not a bump-mapped material and defining
 * USE_BUMPMAP would fight the tangent-space normal map it already has. dHdx and dHdy
 * are METRES OF RELIEF PER SCREEN PIXEL, which is why they are clamped: a macro
 * region boundary is a discontinuity in the atlas UV and its derivative is unbounded.
 *
 * NO BACKTICKS ANYWHERE INSIDE THESE GLSL STRINGS. They are JS template literals, so
 * a backtick in a comment closes the string and the parse error lands sixty lines
 * away from the character that caused it.
 */
vec3 nadirPerturb(vec3 n, vec3 viewPos, float dHdx, float dHdy) {
  vec3 sx = dFdx(viewPos);
  vec3 sy = dFdy(viewPos);
  vec3 r1 = cross(sy, n);
  vec3 r2 = cross(n, sx);
  float det = dot(sx, r1);
  vec3 grad = sign(det) * (dHdx * r1 + dHdy * r2);
  return normalize(abs(det) * n - grad);
}
`;

/**
 * Every chunk that samples a detail map, rewritten to sample at the warped UV. The
 * `#ifdef`s are kept so the patch is safe on a material that is missing one of them,
 * even though every hull-family material has all five.
 */
const MAP_FRAGMENT = /* glsl */`
#ifdef USE_MAP
	vec4 sampledDiffuseColor = texture2D( map, vMapUv + nadirUvOffset );
	/**
	 * DETAIL GAIN. The tiling map's contrast is pushed about its own mean: up inside
	 * a macro structure band, down over open armour. nadirDetail is 1.0 on a calm
	 * face, so a 700 m flank belt renders EXACTLY as authored and only the bands move.
	 * Pivoting on 0.5 rather than on the texel keeps the mean value of the surface
	 * constant, so amplifying detail does not also change how light the ship is.
	 */
	sampledDiffuseColor.rgb = clamp(
		vec3(0.5) + (sampledDiffuseColor.rgb - vec3(0.5)) * nadirDetail, vec3(0.0), vec3(1.0) );
	diffuseColor *= sampledDiffuseColor;
#endif
	// Low-frequency value drift. This is what stops two repeats of the plate tile
	// from being the same patch, which is how the eye detects tiling at all.
	diffuseColor.rgb *= 1.0 + (nadirMacroTexel.r - 0.5) * nadirMacro.y;
	// Anything sunk below the neutral plane is a hole, and a hole is darker. Scaled by
	// the same per-tier relief weight as everything else derived from the height, so a
	// surface that opts out of relief does not pick up a stain instead.
	diffuseColor.rgb *= 1.0 - nadirCavity * nadirRelief.y * 0.46;
	// Soot, then marks. Marks go last because a hazard band that has been sooted
	// over is a hazard band nobody can see.
	diffuseColor.rgb = mix( diffuseColor.rgb, nadirSootColor, nadirMacroTexel.b * nadirMacro.z );
	vec3 nadirMk = nadirMark( nadirMacroTexel.a );
	// ink -> hazard -> sensor, in band order, so the highest band wins the pixel.
	vec3 nadirMarkColor = mix( mix( nadirInkColor, nadirHazardColor, nadirMk.y ),
		nadirSensorColor, nadirMk.z );
	diffuseColor.rgb = mix( diffuseColor.rgb, nadirMarkColor, nadirMk.x * nadirMacro.w );
`;

const ROUGHNESSMAP_FRAGMENT = /* glsl */`
float roughnessFactor = roughness;
#ifdef USE_ROUGHNESSMAP
	vec4 texelRoughness = texture2D( roughnessMap, vRoughnessMapUv + nadirUvOffset );
	roughnessFactor *= texelRoughness.g;
#endif
	// Soot is matte. Without this the streaks are a paint job rather than a deposit.
	// The roughness drift now rides the macro HEIGHT: a recess collects dirt and a
	// proud frame gets rubbed clean, which is the right sign on both.
	roughnessFactor = clamp( roughnessFactor
		- ( nadirMacroTexel.g - 0.5 ) * nadirWarp.z
		+ nadirCavity * 0.12
		+ nadirMacroTexel.b * 0.24, 0.035, 1.0 );
`;

const METALNESSMAP_FRAGMENT = /* glsl */`
float metalnessFactor = metalness;
#ifdef USE_METALNESSMAP
	vec4 texelMetalness = texture2D( metalnessMap, vMetalnessMapUv + nadirUvOffset );
	metalnessFactor *= texelMetalness.b;
#endif
	// Anything covering the surface is not the surface: soot and paint are dielectric.
	metalnessFactor *= 1.0 - max( nadirMacroTexel.b * 0.60,
		nadirMark( nadirMacroTexel.a ).x * 0.85 );
`;

const NORMAL_FRAGMENT_MAPS = /* glsl */`
#ifdef USE_NORMALMAP_OBJECTSPACE
	normal = texture2D( normalMap, vNormalMapUv + nadirUvOffset ).xyz * 2.0 - 1.0;
	#ifdef FLIP_SIDED
		normal = - normal;
	#endif
	#ifdef DOUBLE_SIDED
		normal = normal * faceDirection;
	#endif
	normal = normalize( normalMatrix * normal );
#elif defined( USE_NORMALMAP_TANGENTSPACE )
	vec3 mapN = texture2D( normalMap, vNormalMapUv + nadirUvOffset ).xyz * 2.0 - 1.0;
	#if defined( USE_PACKED_NORMALMAP )
		mapN = vec3( mapN.xy, sqrt( saturate( 1.0 - dot( mapN.xy, mapN.xy ) ) ) );
	#endif
	// Same frequency hierarchy as the albedo: the tiling relief is amplified inside a
	// macro structure band and damped over open armour.
	mapN.xy *= normalScale * nadirDetail;
	normal = normalize( tbn * mapN );
#elif defined( USE_BUMPMAP )
	normal = perturbNormalArb( - vViewPosition, normal, dHdxy_fwd(), faceDirection );
#endif
	// THE MACRO RELIEF, applied last and in VIEW space so it is independent of the
	// tangent frame. This is what makes an authored recess actually shade.
	normal = nadirPerturb( normal, - vViewPosition, nadirDH.x, nadirDH.y );
`;

const AOMAP_FRAGMENT = /* glsl */`
#ifdef USE_AOMAP
	float ambientOcclusion = ( texture2D( aoMap, vAoMapUv + nadirUvOffset ).r - 1.0 ) * aoMapIntensity + 1.0;
	// A recess sees less of the sky than a flat plate does. Without this an authored
	// recess is only a shading trick and collapses the moment the key rakes the other
	// way; with it, depth survives every lighting angle.
	ambientOcclusion *= 1.0 - nadirCavity * nadirRelief.y;
	reflectedLight.indirectDiffuse *= ambientOcclusion;
	#if defined( USE_CLEARCOAT )
		clearcoatSpecularIndirect *= ambientOcclusion;
	#endif
	#if defined( USE_SHEEN )
		sheenSpecularIndirect *= ambientOcclusion;
	#endif
	#if defined( USE_ENVMAP ) && defined( STANDARD )
		float dotNV = saturate( dot( geometryNormal, geometryViewDir ) );
		reflectedLight.indirectSpecular *= computeSpecularOcclusion( dotNV, ambientOcclusion, material.roughness );
	#endif
#endif
`;

/** Substitute and count, so a three upgrade that renames a chunk fails loudly. */
function sub(src, find, replace, report) {
  if (!src.includes(find)) { report.missing.push(find); return src; }
  report.applied++;
  return src.replace(find, replace);
}

export const HULL_MACRO_DEFAULTS = {
  /**
   * Metres one macro region spans. Imported rather than repeated: the atlas sizes
   * its marks in metres against the same number, and if the two ever disagreed every
   * mark would be drawn at one scale and sampled at another.
   */
  macroM: MACRO_DEFAULT_M,
  /** Peak albedo swing, ± half this. 0.30 is ±15%: visible, never a stain. */
  drift: 0.30,
  /** Roughness swing, ± half this. */
  roughDrift: 0.20,
  soot: 0.85,
  ink: 0.90,
  /** Domain-warp period in metres and amplitude in metres. */
  warpPeriodM: 68,
  warpAmpM: 5.2,
  /**
   * Metres of relief a full 0..1 swing of the macro height channel represents. 44 m
   * means the neutral plane is 0.5 and the channel can author a 14 m recess at 0.34
   * or a 9 m proud frame at 0.60 — the depths ship-language.md §3 asks for ("a recess
   * deeper than 8 m") stated in the units the document uses.
   */
  reliefM: MACRO_RELIEF_M,
  /** How much indirect light a full-depth cavity loses. */
  cavity: 0.72,
  /** Extra tiling-detail contrast and relief inside a structure band. */
  detailGain: 1.15,
  /**
   * Metres of relief per screen pixel the gradient is allowed to reach. Past this it
   * is a macro region boundary, not a surface. 0.9 is about the slope of a 45 degree
   * wall seen at one metre per pixel, which is steeper than anything authored.
   */
  slopeClamp: 0.9,
};

/**
 * Patch a MeshStandardMaterial built from hull maps.
 *
 * @param {THREE.MeshStandardMaterial} material
 * @param {Object} p
 * @param {THREE.Texture} p.macroTexture
 * @param {number} p.tileM     metres of hull per detail-map repeat, from hullMaps
 * @param {number} p.inkColor  palette hex
 * @param {number} p.sootColor palette hex
 * @returns {THREE.MeshStandardMaterial} the same material
 */
export function applyHullMacro(material, p = {}) {
  const o = { ...HULL_MACRO_DEFAULTS, ...p };
  if (!o.macroTexture) throw new Error('[hullShader] applyHullMacro needs a macroTexture');
  const tileM = Math.max(1e-3, o.tileM ?? 26);

  // vMapUv is metres / tileM, so a period of `warpPeriodM` metres is tileM /
  // warpPeriodM in uv units, and an amplitude of `warpAmpM` metres is warpAmpM /
  // tileM. Both have to be expressed against the tile or the warp changes character
  // between a 12 m greeble tile and a 57 m armour tile, which is precisely the
  // frequency hierarchy this is meant to preserve.
  const uniforms = {
    nadirMacroMap: { value: o.macroTexture },
    nadirMacro: { value: new THREE.Vector4(1 / o.macroM, o.drift, o.soot, o.ink) },
    nadirWarp: { value: new THREE.Vector4(tileM / o.warpPeriodM, o.warpAmpM / tileM, o.roughDrift, 0) },
    nadirRelief: {
      value: new THREE.Vector4(
        o.reliefM * (o.reliefScale ?? 1),
        o.cavity * (o.reliefScale ?? 1),
        o.detailGain * (o.detailScale ?? 1),
        o.slopeClamp,
      ),
    },
    nadirInkColor: { value: new THREE.Color().setHex(o.inkColor ?? 0xd0cabd, THREE.SRGBColorSpace) },
    nadirHazardColor: { value: new THREE.Color().setHex(o.hazardColor ?? 0xbe6a22, THREE.SRGBColorSpace) },
    nadirSensorColor: { value: new THREE.Color().setHex(o.sensorColor ?? 0xe9e3d6, THREE.SRGBColorSpace) },
    nadirSootColor: { value: new THREE.Color().setHex(o.sootColor ?? 0x151517, THREE.SRGBColorSpace) },
  };

  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    const report = { applied: 0, missing: [] };

    shader.vertexShader = sub(shader.vertexShader,
      '#include <uv_pars_vertex>',
      '#include <uv_pars_vertex>\nvarying vec3 vNadirObjPos;\nvarying vec3 vNadirObjNrm;',
      report);
    shader.vertexShader = sub(shader.vertexShader,
      '#include <uv_vertex>',
      '#include <uv_vertex>\n\tvNadirObjPos = position;\n\tvNadirObjNrm = normal;',
      report);

    shader.fragmentShader = sub(shader.fragmentShader,
      '#include <uv_pars_fragment>',
      '#include <uv_pars_fragment>\n' + PARS_FRAGMENT,
      report);
    // The macro fetch and the warp are computed ONCE, at the top of main, and every
    // chunk below reads them. clipping_planes_fragment is the first statement inside
    // main() in every lit shader three ships.
    shader.fragmentShader = sub(shader.fragmentShader,
      '#include <clipping_planes_fragment>',
      '#include <clipping_planes_fragment>\n'
      + '\tvec4 nadirMacroTexel = texture2D( nadirMacroMap, nadirMacroUV( vNadirObjPos, normalize( vNadirObjNrm ) ) );\n'
      // The macro height, in metres, and its screen-space gradient. Computed ONCE
      // here; four chunks below read it. The clamp is load-bearing - see the header.
      + '\tfloat nadirH = ( nadirMacroTexel.g - 0.5 ) * nadirRelief.x;\n'
      + '\tvec2 nadirDH = clamp( vec2( dFdx( nadirH ), dFdy( nadirH ) ), -nadirRelief.w, nadirRelief.w );\n'
      // How far below the neutral plane this texel sits, 0..1. Only the sunk half
      // counts: a proud frame is not a cavity.
      + '\tfloat nadirCavity = clamp( ( 0.5 - nadirMacroTexel.g ) * 2.4, 0.0, 1.0 );\n'
      // Detail gain: 1.0 on open armour, up to 1 + nadirRelief.z inside a structure
      // band, and slightly BELOW 1 on the calmest faces so the reserve is real.
      + '\tfloat nadirStruct = clamp( abs( nadirMacroTexel.g - 0.5 ) * 3.2, 0.0, 1.0 );\n'
      + '\tfloat nadirDetail = mix( 0.72, 1.0 + nadirRelief.z, nadirStruct );\n'
      // vMapUv only exists under USE_MAP. Every hull-family material has one, but a
      // compile error here would take down the whole scene, so it is guarded.
      + '\t#ifdef USE_MAP\n'
      + '\tvec2 nadirUvOffset = nadirWarpOffset( vMapUv );\n'
      + '\t#else\n'
      + '\tvec2 nadirUvOffset = vec2( 0.0 );\n'
      + '\t#endif',
      report);

    shader.fragmentShader = sub(shader.fragmentShader, '#include <map_fragment>', MAP_FRAGMENT, report);
    shader.fragmentShader = sub(shader.fragmentShader, '#include <roughnessmap_fragment>', ROUGHNESSMAP_FRAGMENT, report);
    shader.fragmentShader = sub(shader.fragmentShader, '#include <metalnessmap_fragment>', METALNESSMAP_FRAGMENT, report);
    shader.fragmentShader = sub(shader.fragmentShader, '#include <normal_fragment_maps>', NORMAL_FRAGMENT_MAPS, report);
    shader.fragmentShader = sub(shader.fragmentShader, '#include <aomap_fragment>', AOMAP_FRAGMENT, report);

    if (report.missing.length) {
      // Loud, once, with the exact chunk names. A silently unpatched hull looks like
      // a texturing regression and would be debugged in the wrong file for an hour.
      console.error('[hullShader] three chunk names no longer match; macro layer is NOT applied for '
        + `"${material.name}". Missing: ${report.missing.join(', ')}`);
    }
    material.userData.macroShader = shader;
  };

  // Constant on purpose: the emitted GLSL does not depend on any of the uniforms, so
  // every hull material in the game shares one program.
  material.customProgramCacheKey = () => PATCH_VERSION;
  material.userData.macro = uniforms;
  return material;
}

/** Runtime read-out for the diagnostic tooling. */
export function macroUniforms(material) { return material?.userData?.macro ?? null; }
