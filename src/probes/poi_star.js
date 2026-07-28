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
  // Pitched up to 17 degrees so the star clears the top edge and sits IN frame —
  // the god-ray pass fades to nothing the moment its anchor leaves the viewport, and
  // this POI's whole identity is volumetrics. It also puts the hull's top deck (the
  // one surface the 17-degree key actually reaches) into view.
  camera: {
    // NOTE: poses in the band around (pitch 0.30, yaw 5.30-5.45) expose an
    // unresolved artefact — see the stream report. This pose is verified clean.
    distance: 4300,
    pitch: 0.42,
    yaw: 5.02,
    target: new THREE.Vector3(0, 30, 0),
  },
  async setup(ctx) {
    // Near broadside. Here the key is only ~30 degrees off the view axis, so there
    // is no yaw that lights a visible flank — the correct read is a blown-out top
    // deck over black sides, and a broadside hull maximises that silhouette.
    await setupPOIProbe(ctx, 'near-star', { yaw: 0.55, extraShips: 2 });
  },
};
