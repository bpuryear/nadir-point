/**
 * POI PROBE — 'graveyard'.
 *
 *   node tools/probe.mjs poi_graveyard --out docs/probes/poi_graveyard.png
 *
 * What this frame has to prove:
 *   * near-black without being empty: the histogram has to reach the bottom
 *   * one cold rim per object from a sun that is a pinprick, and nothing else
 *   * the nebula does the fill, and it is a sick derelict green, so the shadow
 *     sides are green-black rather than blue-black — a different POI at a glance
 *   * decades of wreckage layered in depth, still legible as wreckage
 */

import * as THREE from 'three';
import { setupPOIProbe } from './poi_common.js';

export default {
  name: 'POI — The Graveyard',
  camera: {
    distance: 3300,
    pitch: 0.16,
    yaw: 2.30,
    target: new THREE.Vector3(0, 60, 0),
  },
  async setup(ctx) {
    await setupPOIProbe(ctx, 'graveyard', { yaw: -0.42, extraShips: 3 });
  },
};
