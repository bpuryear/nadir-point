/**
 * POI PROBE — 'near-star'.
 *
 *   node tools/probe.mjs poi_star --out docs/probes/poi_star.png
 *
 * What this frame has to prove:
 *   * the key is blown out and the shadow terminators are knife-edged
 *   * everything not directly lit is crushed to silhouette, not to noise
 *   * the god-ray pass has a real anchor in frame and rakes through the rubble
 *   * the starfield is washed out — you cannot see stars next to a star
 */

import * as THREE from 'three';
import { setupPOIProbe } from './poi_common.js';

export default {
  name: 'POI — Near Star',
  camera: {
    distance: 3000,
    pitch: 0.13,
    yaw: 5.30,
    target: new THREE.Vector3(0, 30, 0),
  },
  async setup(ctx) {
    await setupPOIProbe(ctx, 'near-star', { yaw: 1.05, extraShips: 2 });
  },
};
