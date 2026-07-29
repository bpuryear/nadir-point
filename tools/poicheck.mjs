/**
 * THREE PLACES, THREE SUNS — asserted ON THE LIVE PATH.
 *
 *   node tools/poicheck.mjs             # registry + live game, exit 1 on any failure
 *   node tools/poicheck.mjs --registry  # registry only, no browser (fast)
 *
 * `src/world/lighting/pois.js:4-6` states the acceptance test for that whole file:
 * "a player shown a single still frame can name where they are — not from a label,
 * from the light". Nothing enforced it, and for the life of the project the file was
 * imported by `src/probes/poi_common.js` and by nothing on the game path, so
 * `world/system.js#registerSystemPOIs` won its own race every boot and all three
 * flagship POIs resolved to ONE key direction — `sunVector([200, 18])`, because their
 * three TABLE rows carry `sun: null`. Three places, one photograph. Run with
 * `--explain` to print that collapsed vector next to the authored ones.
 *
 * WHY THIS BOOTS A BROWSER INSTEAD OF READING THE REGISTRY AND STOPPING
 *
 * A static check of the registered def would have passed throughout the entire period
 * the bug existed, because `bootGame` never calls `enterPOI` at all. It calls
 * `buildPOILighting`, `installCelestials` and `installFields` directly, and
 * `installWorldSim` then ADOPTS that dressing rather than rebuilding it
 * (`src/world/index.js`, `TravelSystem.adoptCurrent`). The registered `build()` only
 * runs later, when `TravelSystem._updateArrivalTracking` notices the player has
 * crossed into a node and calls `enter()` -> `enterPOI()` -> `def.build()`.
 *
 * So three code paths answer "what lights this place":
 *
 *   1. the registered def          `getPOI(id).keyLight.direction`
 *   2. the boot dressing           `game.js` -> `buildPOILighting(poiId, ...)`
 *   3. arrival, the one that lasts `travel.enter()` -> `enterPOI()` -> `def.build()`
 *
 * Path 3 is where a player spends all but the first minute of a run, and it is the
 * only one that proves the AUTHORED definitions are the ones in use: the generic
 * builder in `world/poi/index.js` passes `shadowRadius ?? 3600` while the authored
 * defs pass the measured 1400. Reading the shadow box back is a fingerprint for which
 * registration won, independent of the sun vector, and it is asserted here for that
 * reason.
 *
 * SAMPLE SIZE IS PRINTED, AND AN EMPTY SAMPLE IS A FAILURE. A check that measures
 * nothing prints "ok"; this project has already paid for that once, when the UI
 * layout audit ran its whole life against zero panels. Fewer than three POIs reached
 * on the live path exits non-zero however many assertions passed.
 */
import { startServer, stopServer, launchBrowser, openGame } from './harness.mjs';

const IDS = ['giant-orbit', 'graveyard', 'near-star'];

/**
 * A CONTROL, so this file cannot become a check that measures nothing.
 *
 * `vault-nine` is one of the eleven POIs `world/system.js` registers generically. It
 * shares the `graveyard` PALETTE with an authored POI, so if the shadow-box
 * fingerprint below ever stops discriminating between the two registration paths it
 * will show up here as a control that has gone green when it should be red. The point
 * is not that vault-nine is interesting — it is that a passing instrument has to be
 * shown responding to the thing it claims to detect.
 */
const CONTROL_ID = 'vault-nine';

/** Authored shadow half-width, `src/world/lighting/pois.js`. */
const AUTHORED_SHADOW_RADIUS = 1400;
/** What the generic builder would give. Seeing this means the authored def lost. */
const GENERIC_SHADOW_RADIUS = 3600;

/** A key direction that has drifted from its own celestial spec is a bug, not a tweak. */
const DIRECTION_TOLERANCE_DEG = 0.5;

/**
 * THE SEPARATION FLOOR IS NOT A TASTE JUDGEMENT, SO IT IS NOT INVENTED HERE.
 *
 * The recon brief proposed a flat 30 degrees. Measured against the committed data
 * that is not a floor, it is a target the tree already misses: giant-orbit and
 * near-star are **19.0 degrees** apart. Shipping a 30 degree gate would have meant
 * either a permanently red check or quietly moving a number until it passed, and this
 * project has been burned by invented thresholds before.
 *
 * So the GATE is anchored to something physical and already committed: two POIs whose
 * key directions differ by less than the angular DIAMETER of the larger key disc
 * (`POI_PALETTES[id].key.angularRadius`) are lit by the same sun, in the literal
 * sense that the discs overlap. That catches the defect that actually happened — all
 * three collapsing onto one vector, 0.0 degrees apart — and it cannot be satisfied by
 * argument.
 *
 * The 30 degree "nameable at a glance" target is still measured and still printed,
 * as a WARN. It is a note for whoever owns `src/world/celestials/index.js`, where the
 * sun vectors live; it is not this tool's gate, because this tool cannot fix it.
 */
const NAMEABLE_TARGET_DEG = 30;

const results = [];
const warnings = [];
function check(ok, label, detail) {
  results.push({ ok: !!ok, label, detail });
  console.log(`${ok ? '  ok  ' : '  FAIL'}  ${label}${detail ? `   ${detail}` : ''}`);
  return !!ok;
}
function warn(label, detail) {
  warnings.push({ label, detail });
  console.log(`  warn  ${label}${detail ? `   ${detail}` : ''}`);
}

const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const norm = (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const angleDeg = (a, b) => (Math.acos(Math.max(-1, Math.min(1, dot(norm(a), norm(b))))) * 180) / Math.PI;
const fmt = (v) => `(${v.map((n) => n.toFixed(4)).join(', ')})`;
const deg = (rad) => (rad * 180) / Math.PI;

let server = null;
let browser = null;

// ---------------------------------------------------------------------------
// 1. The registry, in process. Importing pois.js IS its registration.
// ---------------------------------------------------------------------------

console.log('REGISTRY  (importing src/world/lighting/pois.js registers the three defs)');

await import('../src/world/lighting/pois.js');
const { getPOI } = await import('../src/core/contracts.js');
const { CELESTIAL_SPECS } = await import('../src/world/celestials/index.js');
const { getPOIPalette } = await import('../src/art/palette.js');

const registered = {};
const discDeg = {};
for (const id of IDS) {
  discDeg[id] = deg(getPOIPalette(id)?.key?.angularRadius ?? 0.009) * 2;
  const def = getPOI(id);
  if (!def) { check(false, `${id} is registered`); continue; }
  const dir = def.keyLight?.direction;
  if (!dir) { check(false, `${id} has a key direction`); continue; }
  registered[id] = norm([dir[0], dir[1], dir[2]]);
  const spec = CELESTIAL_SPECS[id]?.sunDir;
  const want = spec ? norm([spec.x, spec.y, spec.z]) : null;
  check(
    !!want && angleDeg(registered[id], want) < DIRECTION_TOLERANCE_DEG,
    `${id} key direction == its own CELESTIAL_SPECS.sunDir`,
    want
      ? `${fmt(registered[id])}  ${angleDeg(registered[id], want).toFixed(3)} deg off`
      : 'no celestial spec for this id',
  );
}

separations('registry', IDS.map((id) => ({ id, dir: registered[id] })).filter((r) => r.dir));

if (process.argv.includes('--explain')) {
  const { sunVector } = await import('../src/world/system.js');
  const collapsed = sunVector([200, 18]);
  console.log('\n  --explain: what the three POIs resolved to before pois.js was on the game path');
  console.log(`  world/system.js registerSystemPOIs, spec.sun ?? [200, 18] -> ${fmt([collapsed.x, collapsed.y, collapsed.z])}`);
  for (const id of IDS) {
    if (!registered[id]) continue;
    console.log(`    ${id.padEnd(12)} authored ${fmt(registered[id])}  ${angleDeg(registered[id], [collapsed.x, collapsed.y, collapsed.z]).toFixed(1)} deg from the collapsed vector`);
  }
}

if (process.argv.includes('--registry')) await report(IDS.length);

// ---------------------------------------------------------------------------
// 2. The live game. Boot once, then walk the player onto each node so that
//    `travel._updateArrivalTracking` builds it from the registry, as a run does.
// ---------------------------------------------------------------------------

console.log('\nLIVE PATH  (assembled game; arrival tracking builds each POI from the registry)');

const port = Number(process.env.PORT || 5187);
let reachedCount = 0;
try {
  server = await startServer({ port, mode: 'preview' });
  browser = await launchBrowser();
  const { page, booted, bootError, pageErrors } = await openGame(browser, server.url, {
    width: 960, height: 540, query: 'capture=1', settleFrames: 20,
  });
  if (!booted) {
    console.error(`BOOT FAILED\n${bootError}\n${pageErrors.join('\n')}`);
    check(false, 'the assembled game boots');
    await report(0);
  }

  let live = await page.evaluate(async (ids) => {
    const N = window.__NADIR;
    const w = N.world;
    const out = [];
    const frames = (n) => new Promise((res) => {
      let i = 0; const s = () => (++i >= n ? res() : requestAnimationFrame(s)); requestAnimationFrame(s);
    });

    for (const id of ids) {
      const node = w.systems.system?.get(id);
      if (!node) { out.push({ id, reached: false, why: 'no node with this id in the system table' }); continue; }
      /*
       * Stand the player in the middle of the node and let real frames elapse.
       * Arrival tracking runs inside the travel system's fixedUpdate; calling
       * `travel.enter(id)` directly here would be testing the tool rather than the
       * game, and it is precisely the code path that was never exercised.
       */
      w.player.body.position.set(node.position.x, 0, node.position.z);
      w.player.body.velocity.set(0, 0, 0);
      await frames(14);

      const poi = w.poi;
      const key = poi?.rig?.key ?? null;
      if (!key) {
        out.push({ id, reached: false, why: `world.poi is ${poi ? `"${poi.id}"` : 'null'} and carries no rig` });
        continue;
      }
      key.updateMatrixWorld(true);
      key.target.updateMatrixWorld(true);
      const lp = key.getWorldPosition(new N.THREE.Vector3());
      const tp = key.target.getWorldPosition(new N.THREE.Vector3());
      // The direction the light COMES FROM, which is what keyLight.direction states.
      const d = lp.sub(tp).normalize();
      out.push({
        id,
        reached: poi.id === id,
        actualPOI: poi.id,
        travelPOI: w.systems.travel?.currentPOI ?? null,
        dir: [d.x, d.y, d.z],
        shadowHalfWidth: key.shadow?.camera?.right ?? null,
        shadowNormalBias: key.shadow?.normalBias ?? null,
        keyIntensity: key.intensity,
      });
    }
    return out;
  }, [...IDS, CONTROL_ID]);

  const control = live.find((r) => r.id === CONTROL_ID);
  live = live.filter((r) => r.id !== CONTROL_ID);
  if (!control?.reached) {
    check(false, `control ${CONTROL_ID} is entered on the live path`, control?.why ?? 'not reached');
  } else {
    // The instrument has to be shown responding. A generically registered POI must
    // come back with the GENERIC shadow box; if it comes back with the authored one,
    // the fingerprint above has stopped telling the two registration paths apart and
    // every "ok" it printed was vacuous.
    check(Math.abs((control.shadowHalfWidth ?? 0) - GENERIC_SHADOW_RADIUS) < 1,
      `control ${CONTROL_ID} (generically registered) still shows the generic ${GENERIC_SHADOW_RADIUS} m box`,
      `${control.shadowHalfWidth} m — if this ever reads ${AUTHORED_SHADOW_RADIUS}, the fingerprint is dead and so is this check`);
  }

  const reached = live.filter((r) => r.reached);
  reachedCount = reached.length;
  for (const r of live) {
    if (!r.reached) {
      check(false, `${r.id} is entered on the live path`, r.why ?? `world.poi is "${r.actualPOI}"`);
      continue;
    }
    const want = registered[r.id];
    const off = want ? angleDeg(r.dir, want) : 999;
    check(off < DIRECTION_TOLERANCE_DEG, `${r.id} LIVE key direction == the authored def`,
      `${fmt(r.dir)}  ${off.toFixed(3)} deg off`);
    check(Math.abs((r.shadowHalfWidth ?? 0) - AUTHORED_SHADOW_RADIUS) < 1,
      `${r.id} LIVE shadow box is the authored ${AUTHORED_SHADOW_RADIUS} m`,
      `${r.shadowHalfWidth} m (the generic builder gives ${GENERIC_SHADOW_RADIUS}); normalBias ${(r.shadowNormalBias ?? 0).toFixed(3)} m`);
  }

  separations('live', reached);

  await page.close();
  await report(reachedCount);
} catch (err) {
  console.error('POICHECK ERROR:', err);
  await stopAll(1);
}

function separations(where, rows) {
  for (let i = 0; i < rows.length; i++) {
    for (let j = i + 1; j < rows.length; j++) {
      const a = rows[i]; const b = rows[j];
      const sep = angleDeg(a.dir, b.dir);
      const floor = Math.max(discDeg[a.id] ?? 1, discDeg[b.id] ?? 1);
      check(sep >= floor, `${where}: ${a.id} and ${b.id} are lit by different suns`,
        `${sep.toFixed(1)} deg apart, floor ${floor.toFixed(2)} deg (the larger key disc's diameter)`);
      if (sep < NAMEABLE_TARGET_DEG) {
        warn(`${where}: ${a.id} and ${b.id} are only ${sep.toFixed(1)} deg apart`,
          `under the ${NAMEABLE_TARGET_DEG} deg "nameable from the light" target; the vectors live in src/world/celestials/index.js`);
      }
    }
  }
}

async function report(poisMeasured) {
  const failed = results.filter((r) => !r.ok);
  console.log(`\nsample: ${poisMeasured} of ${IDS.length} POIs measured, ${results.length} assertions run, ${warnings.length} warnings`);
  console.log(`${results.length - failed.length} of ${results.length} assertions passed`);
  for (const w of warnings) console.log(`  WARN  ${w.label}  —  ${w.detail}`);
  if (!process.argv.includes('--registry') && poisMeasured < IDS.length) {
    console.error(`\nFAIL: only ${poisMeasured} of ${IDS.length} POIs were reached on the live path.`);
    await stopAll(1);
  }
  if (failed.length) {
    console.error(`\nFAIL: ${failed.length} assertion(s)`);
    for (const f of failed) console.error(`  - ${f.label}   ${f.detail ?? ''}`);
    await stopAll(1);
  }
  console.log('\npoicheck ok');
  await stopAll(0);
}

async function stopAll(code) {
  try { await browser?.close(); } catch { /* already gone */ }
  try { await stopServer(server); } catch { /* already gone */ }
  process.exit(code);
}
