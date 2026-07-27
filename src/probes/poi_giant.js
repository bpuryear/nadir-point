/**
 * POI PROBE — 'giant-orbit'.
 *
 *   node tools/probe.mjs poi_giant --out docs/probes/poi_giant.png
 *
 * What this frame has to prove:
 *   * the gas giant fills roughly a third of the frame and reads as ENORMOUS
 *   * the terminator, the ring shadow on the planet and the planet's shadow on the
 *     rings all agree with one sun direction
 *   * the same sun direction is visible on the cruiser, the debris and the rocks
 *   * the shadow side of every hull is filled by cold planetshine, not by grey
 *   * running lights at 6 m give the box its 1.4 km
 */

import * as THREE from 'three';
import { setupPOIProbe } from './poi_common.js';

export default {
  name: 'POI — Gas Giant Orbit',
  // Composed so the giant sits low and left with open sky top right for the nebula
  // band, and the cruiser crosses the terminator. Low camera: the vertical spread
  // of the debris field is a scale cue and a high angle flattens it.
  camera: {
    distance: 4200,
    pitch: 0.140,
    yaw: 0.464,
    target: new THREE.Vector3(0, 60, 0),
  },
  async setup(ctx) {
    /**
     * The hull yaw is SOLVED, not picked. The key is 94 degrees off the view axis,
     * so there is exactly one band of yaws where a flank is both lit by it and
     * visible to the camera; at yaw -0.95 both flanks sit on the terminator and a
     * 1.4 km ship renders as a black rectangle. -0.35 puts the starboard side at
     * 56 % of full key while still showing it to the camera at 44 degrees.
     */
    await setupPOIProbe(ctx, 'giant-orbit', { yaw: -0.35, extraShips: 3 });
  },
};
