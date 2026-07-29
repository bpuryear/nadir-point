# PARALLEL SCHEDULE — 3 waves, 12 agent-slots

Verified against the code this session. Every file assignment below was checked for existence and for overlap; the disjointness constraint holds within each wave.

---

## 0. WHAT I VERIFIED BEFORE SCHEDULING

| Claim | Verdict | Evidence |
|---|---|---|
| Handedness contradiction is real | **CONFIRMED** | `hardpoints.js:209` port `yawCentre: +PI/2`, anchor `[-158,46,60]` (`:132`); `ship.js:141-142` `aim = heading + yawCentre`, `worldForward.set(sin(aim),0,cos(aim))`; at heading 0 the port mount at −X aims at **+X** |
| …but armament's *fix direction* is wrong | **BRIEF IS WRONG** | see FLAG 1 |
| `refit.js` double-mirrors starboard | **CONFIRMED** | `refit.js:205,215-216` — `anchor`/`hpDef` both come from `_hardpointDef(hpId)` (the target), then `anchor[0] * -1` and `-hpDef.yawCentre`. Both flanks resolve to port |
| VLS fires 4 of 6 | **CONFIRMED** | `dorsal.js:257` `shotsPerBurst: 6`, no `ready`; `stores.js:51` `missile.ready: 4` |
| `def.ready` override path exists | **CONFIRMED** | `ship.js:68` `this.readyMax = def.ready ?? ...` — so `ready: 6` will take |
| 24 `b.graft()` calls in exactly the 5 module files armament needs | **CONFIRMED** | bow 5, dorsal 5, broadside 5, ventral 5, engine 4 |
| cruiser LOD0 headroom is 11 triangles | **CONFIRMED** | `cruiser.js:159` "1989 … against BUDGET.cruiserCoreTris (2000)"; `units.js:81` = 2000 |
| Only 2 `greebleBand` sites | **CONFIRMED** | `cruiser.js:1130`, `cruiser.js:1315` |
| `pois.js` not on the game path | **CONFIRMED** | `game.js:100` imports `./world/lighting/poi.js` only; no `pois.js` anywhere in `game.js` |
| `synthesisePlayerClass` fallback is unconditional | **CONFIRMED** | `game.js:136`, `:302-324` — mass 62000, comment at `:300` claims it matches controls.md; it does not |
| `onImpact` passes no mass | **CONFIRMED** | `physics.js:343` `onImpact?.(a, b, Math.abs(closing), nx, ny, nz)` — see FLAG 7 |
| Baseline | **51 of 51 checks passed** | `node src/sim/selftest.mjs` |
| `src/camera/feel.js`, `src/sim/salvo.js`, `src/art/geometry/adapt.js`, `tools/flight.mjs`, `tools/ripple.mjs`, `tools/poicheck.mjs`, `tools/plates.mjs`, `src/sim/meta/attrition.js`, `src/ui/sortie.js` | **none exist** | `ls` |
| npm scripts available | `dev build preview capture bench smoke uicheck occlusion` | no `flight`, no `probe` — `tools/probe.mjs` is invoked directly |

---

## 1. CUT LIST — not this run, and why

Say this to the owner plainly: seven large/very-large streams do not fit in several hours. Two must be cut whole, two descoped.

**CUT — `hull-adaptation` (very-large).** It writes the same six module files armament needs for muzzles (`kit/bow/dorsal/ventral/broadside`), plus `cruiser.js` that visual wants, plus `contracts.js` and `units.js` that the boot-critical wave needs. Its own acceptance bar — bare hull byte-identical after threading a mutable station table through `sectionAt()`/`chineAt()` — is a high bar for a rewrite, and `moduleTris 400→350` plus graft deletion across 24 modules must be a single commit or the tree is red between steps. Nothing in it is on the critical path for any of the three gates. Next run, first.

**CUT — `damage` atlas (large).** Its own brief calls the ORM canvas→DataTexture conversion "the single highest-blast-radius edit in the plan" — it touches every hull material in the game — and the feature is *invisible* until `src/vfx/damage.js` (VFX-owned) is wired. Payoff is behind two other streams' work. Next run: land the ORM conversion alone, in its own commit, with its own `tools/maps.mjs` sheet.

**DESCOPED — `visual-surface`.** Keep the POI lighting wiring and the measurement fixes (cheap, and the POI fix is the cheapest credible win on gate (a)). Drop the greeble bands: there are **11 triangles of headroom** and the work needs 6–9 bands. It is blocked on an owner decision about `BUDGET.cruiserCoreTris`, and its own measurement says the failure direction is ambiguous (see FLAG 4).

**DESCOPED — `ui-hud`.** Keep the defect work and the SORTIE panel in Wave 1, the armament/damage readouts in Wave 3. Drop the one-accent palette collapse — it is an art-direction decision in Materials' file (FLAG 10).

---

## 2. WAVE 1 — foundation (6 agents, all parallel, disjoint)

Nothing in Wave 2 may start until every Wave-1 gate is green.

### W1-A · armament prerequisites & core contracts
**Writes (exclusively):** `src/core/contracts.js`, `src/core/events.js`, `src/art/geometry/hardpoints.js`, `src/art/geometry/modules/kit.js`, `bow.js`, `dorsal.js`, `ventral.js`, `broadside.js`

**Does:**
1. **Handedness fix** — negate the **14** `yawCentre: ±PI * 0.5` literals (`hardpoints.js:209,219`; `coalition.js:1131,1135,1206,1211,1243,1248`; `concord.js:927,932,968,973,1012,1017`). *Wait* — `ships/*.js` is not in this agent's write set; see the note below. Add a registration-time assertion: for every hardpoint with a `normal`, `dot(worldForwardAtRest, normal) > 0.9`.
2. `muzzles: [[x,y,z],…]` **declared statically on each ModuleDef** — never read off the built mesh, never `glow()` (LOD-gated, `kit.js:276`), never `glowDir()` (records no `pos`), never glow discs (8 real tris each). 12 weapon modules.
3. `ready: 6` on `dorsal_missile_cells`.
4. `contracts.js`: `muzzles` on the ModuleDef typedef; validator **`ready ?? AMMO_SPEC[…].ready >= shotsPerBurst` as a THROW**; validator **`muzzles.length === shotsPerBurst` as a console.warn, not a throw** (FLAG 12).
5. `events.js`: `EV.WEAPON_CHARGING`, `EV.SALVO_FIRED`, `EV.SALVO_COMPLETE` — **with payload shapes documented in JSDoc in this commit**, because W2-A and W2-B both build against them in the same wave. Pin: `WEAPON_FIRED` gains `origin: Vector3`; `SALVO_FIRED {ship, side, slotCount}`; `SALVO_COMPLETE {ship, side, fired, dropped, reasons}`.

**Ownership note:** `src/art/geometry/ships/{coalition,concord}.js` are not otherwise written in Wave 1. Grant them to W1-A for the 12 sign flips only — data lines, nothing else.

**MUST NOT touch:** `cruiser.js`, `greeble.js`, `modules/engine.js`, `modules/index.js`, `core/units.js`, anything under `src/sim`, `src/ui`, `tools/`.

**Gate:**
```
node src/art/geometry/modules/audit.mjs            # exit 0, worst module still ≤ 400
node tools/probe.mjs cruiser                       # 1989/1554/370 tris UNCHANGED — muzzles are data, cost zero
npm run smoke                                      # THE boot check: proves the ready validator did not brick registration
node -e "import('./src/art/geometry/modules/index.js').then(async()=>{const{allModules}=await import('./src/core/contracts.js');for(const d of allModules())if(d.weapon)console.log(d.id,d.muzzles?.length??0,d.weapon.shotsPerBurst)})"
```
Last command must print equal pairs for all 12. **This agent's `npm run smoke` is the wave's boot gate** — if it fails, W1-C's smoke failure is not W1-C's fault.

**Hands to W1-D:** one-line request — flip `selftest.mjs:203`'s `desiredHeading = atan2(1200,1200) - PI*0.5` to `+ PI*0.5`.

---

### W1-B · ship & refit keystone
**Writes (exclusively):** `src/sim/ship.js`, `src/sim/refit.js`

**Does:**
1. `WeaponMount` gains `fireMode` (getter/setter; pd setter is a no-op, getter always `'AUTO'`), `charge`, `charging`, `traverseLocked`, `excluded`. Defaults by archetype: AUTO for pd/flak/beam/mining, SALVO for cannon/rail/missile, CHARGE for lance.
2. Tick `charge` and decay `traverseLocked` in `Ship.fixedUpdate` beside `cooldown`/`burstTimer`/`stall` (`ship.js:887-893`). `trackTowards` (`:146`) returns early when `traverseLocked`.
3. **Fix the double-mirror** at `refit.js:215-216` — negate only when the *authored* side differs from the target side AND the anchor in use is the authored side's.
4. `REFERENCE_FIT_MASS` 1800 → 35500 (`refit.js:11`); `Math.sqrt(massLoad)` → `Math.pow(massLoad, 0.6)` (`:249`). *(Delegated from the flight-model brief; independent of hull mass, so it does not couple to W1-C.)*
5. `scrapInstalled` (`refit.js:416`) routes through `breakDownItem(world, moduleDef)` instead of `scrapYield` + direct `world.materials` write. **Signature pinned here so W1-D can build against it without a stall.**
6. Persist `fireMode` and `excluded` through refit via the module instance record.

**MUST NOT touch:** `physics.js`, `combat.js`, `salvage.js`, `condition.js`, `sim/meta/**`, `ui/**`, `game.js`.

**Gate:** `node src/sim/selftest.mjs` = 51/51 (check at `:575` exercises the massLoad path); `npm run smoke`.

---

### W1-C · flight model
**Writes (exclusively):** `src/camera/feel.js` *(new)*, `src/sim/physics.js`, `src/game.js`, `src/world/travel.js`, `src/world/sensorHarness.js`, `src/probes/benchmark.js`, `src/probes/ui.js`, `src/probes/worldsim.js`, `tools/flight.mjs` *(new)*, `package.json`

**Does:** `CRUISER_FEEL`; register `player_cruiser` and **delete** `synthesisePlayerClass` (`game.js:302-324`) and the `??` at `:136`; `physics.js:91` falloff 0.62→0.72; `this.angAccel = spec.angAccel ?? null` **with `?? maxRate * 2.4` default preserved** (FLAG 6); `retroAccel` + `stoppingTime()`/`stoppingDistance()` + travel `_enterTransit`/`_exitTransit` save/restore — **these three are one atomic commit**; `travel.js:51` `combatArrivalSpeed` derived not literal; de-duplicate 4 of the 5 player-class literals; `tools/flight.mjs` (9 assertions) + `npm run flight`.

**Two delegated one-liners in `game.js`** (from the visual stream, which must not touch this file):
- `await optional('./world/lighting/pois.js', 'poi-defs');` beside `game.js:100`, **before** `installWorldSim` at `:204`.
- `game.js:75` `params.get('poi') ?? 'giant-orbit'` → `?? START_POI`.

**One delegated block in `physics.js`** (from armament, which must not touch this file): `RECOIL` constants, `PlaneBody.recoilBank`/`recoilRate`, and `applyTo` becomes `rotation.set(0, this.heading, this.bank + this.recoilBank, 'YXZ')`. **Nothing may be added to `body.velocity`** — the servo at `:131-134` deletes lateral components (measured 0.000 m).

**MUST NOT touch:** `sim/ship.js`, `sim/refit.js`, `sim/meta/harness.js` (the 5th literal — W1-D's file, filed as a request), `input/**`, `ui/**`, `docs/review/defects.md`, `world/lighting/pois.js`.

**Gate:** `node tools/flight.mjs`; `node src/sim/selftest.mjs` 51/51; `node src/art/geometry/ships/audit.mjs` exit 0; `npm run smoke`; `npm run bench -- --quality medium` (231 draws unmoved). **Plus a required pre-flight read:** confirm the `onImpact` consumer before landing the 10× mass change (FLAG 7).

---

### W1-D · systems depth — economy, items, objectives, perks
**Writes (exclusively):** `src/sim/meta/**` (incl. new `economyAudit.mjs`), `src/sim/salvage.js`, `src/sim/condition.js`, `src/sim/selftest.mjs`

**Does:** S1 (delete the `scrapYield` fallback at `salvage.js:591-605`; remove the exotic mint at `condition.js:167`; export `sectionPreview()`); S1b (`items.js:413` uses `gradeForSection(section)` — `section.grade` is never written, so 2 of 5 devices currently cannot drop); S3 (objective rows gain `km`/`propellantRoundTrip`/`reachable`/`netAfterFuel`; payouts become `addScrap` not `credit`, **plus the legible refusal string** — FLAG 9); S4 (perk drawbacks + cost rescale, **excluding any drawback that lands on `heat.js` radiator load or `signatureMultiplier`** — those files are W2-A's / unowned); `economyAudit.mjs`; replace `selftest.mjs:627-630` with a cross-path equality assertion; **widen the determinism scanner root** (`selftest.mjs:675-682` is non-recursive over `src/sim`, so all of `src/sim/meta/**` is currently unscanned — FLAG 15); take W1-A's `selftest.mjs:203` heading flip.

**MUST NOT touch:** `sim/refit.js` (W1-B lands `scrapInstalled`), `sim/subparts.js`, `sim/heat.js`, `sim/combat.js`, `ui/**`, `world/factionWar.js` (Wave 2), `src/probes/**`.

**Gate:** `node src/sim/meta/economyAudit.mjs` exit 0 — must include (a) two-path scrap agreement within 10%, (b) no net-non-negative build→install→scrap cycle, (c) **exotic reachability** (FLAG 8), (d) read-but-never-written section fields; `node src/sim/selftest.mjs` 51/51; `node src/sim/meta/sortieHarness.js`; `npm run smoke`.

---

### W1-E · UI defects, shells, and the key map
**Writes (exclusively):** `src/ui/**`, `tools/uicheck.mjs`, `tools/uihue.mjs` *(new)*

**Does:** `P.owner` tagging in `hud.js`/`power.js`/`tactical.js` + `uicheck` reads `ui._weldedRegions` + COLLIDE slack tuned in the **same commit** (FLAG 11); `power.js:207-218` sealed banner becomes its own layout row instead of an overlay (it currently erases WEAPONS and bisects ENGINES); `tactical.js:383-388` bracket through `P.worldLabel` drawn *before* `_drawArcs`; ring-label stacks converted to chips; `refit.js` plates + ELECTRONICS + reads `res.pending`; `inventory.js` → m³; `perks.js`/`hold.js` lane derived from real strings; **`src/ui/sortie.js` NEW** (four registered systems have zero UI references); `tools/uihue.mjs` as **measurement only**.

**Deliverable other streams block on:** publish the authoritative free-key list, checked against **both** `src/input/controls.js` and `src/ui/index.js`. Current answer: free = `B I L N O R T U Y , .`; **`M` is taken** (`ui/index.js:286`, capture phase).

**MUST NOT touch:** `src/art/palette.js` (propose, do not change — FLAG 10), `src/input/controls.js`, `src/core/events.js`, `src/sim/**`.

**Gate:** `npm run uicheck` — sampled ≥ 590 boxes across ≥ 13 regions (376/6 today); `npm run uicheck -- --screen locked` **must fail before the banner fix and pass after** (if it passes before, the welded attribution did not take); `npm run smoke` with **119 draws / 58 programs / 61 geometries unchanged** — any movement is a defect in this stream.

---

### W1-F · POI lighting + measurement honesty *(gate (a), cheap)*
**Writes (exclusively):** `src/world/lighting/pois.js`, `tools/poicheck.mjs` *(new)*, `tools/shots.json`, `tools/surface.mjs`, `docs/review/defects.md`

**Does:** delete the dead `systemPos` values (`pois.js:120,159,182` — unread anywhere in `src/`, and they contradict `system.js:551`); `tools/poicheck.mjs` asserting three distinct suns **on the live path**, not the registry (`bootGame` never calls `enterPOI`); **fix or delete the `close` shot** — `npm run capture` is red today and D-INT1's evidence frame cannot be regenerated (FLAG 13); `surface.mjs` gains a required `--frame ship|face|scene` and a two-sided band; close D57 in `defects.md` and fix the duplicate D49/D50/D51 ids.

**MUST NOT touch:** `src/game.js` (W1-C lands the import), `src/art/geometry/**`, `src/core/units.js`, `tools/silhouette.mjs` (Wave 2).

**Gate:** `node tools/poicheck.mjs` exit 0 (exits 1 today); `npm run capture -- --shots close,three-quarter` exit 0.

---

## 3. WAVE 2 — the ripple (4 agents)

Gated on W1-A (muzzles, events, handedness) and W1-B (`fireMode`).

### W2-A · salvo controller
**Writes:** `src/sim/salvo.js` *(new)*, `src/sim/combat.js`, `src/sim/heat.js`, `src/input/controls.js`, `tools/ripple.mjs` *(new)*, `ARCHITECTURE.md` (add `salvo.js` to the Combat row **in this commit** — its absence is the exact structural gap `HANDOFF.md:185` records for `src/sim/meta/**`)

**Pinned constraints:** 24-slot preallocated pool per ship, `arm()` fills a prefix; `mount.parts.fireRateMul` counted **once**, inside `cadence` only (the spec double-counts it — §1.3 vs §1.4, and the §1.4 form yields 264 ms past `stepMax` 0.240); a slot that cannot fire is **never removed** — it occupies `deadPause`/`frozenPause`; recompute the lead into `scratch.v1` immediately before each `_fire` and hold no scratch across the call (`combat.js:137` vs `:236`); **fork the RNG from a spawn-index or hardpoint-derived label, not `ship.id`** (`ship.js:179` is a module-global counter, not seed-derived); binding from W1-E's free list — **not `M`**, and not on the "separate screen context" justification, which does not exist.

**MUST NOT touch:** `ship.js`, `refit.js`, `physics.js`, `ui/**`, `vfx/**`, `audio/**`, `art/**`.

**Gate:** `node tools/ripple.mjs` (12 assertions; #4 asserting slot count *unchanged* on a dead barrel is the one that stops a future refactor destroying the mechanic); `node src/sim/selftest.mjs` 51/51; `npm run smoke`.

**Publishes:** a non-allocating `salvoReport(ship)` read API and `bearingReport` extended with `salvoReady`/`salvoIn`/`side` — W3-A builds the panel against these. UI does not reach into `salvo.js`.

### W2-B · VFX + audio for the ripple
**Writes:** `src/vfx/weapons.js`, `src/audio/weapons.js`
Per-emitter flash origin from `EV.WEAPON_FIRED.origin`; ember trail; pitch contour + terminal sub on `SALVO_FIRED`/`SALVO_COMPLETE`. **Do not implement §5.5 item 1** — the gate key is already per-mount (`audio/index.js:56-64,156`) and `GATE.cannon` 0.030 s is well under `stepMin` 0.070, so nothing gates anything.
**Gate:** `npm run smoke`; `node tools/probe.mjs vfx`.

### W2-C · attrition *(timeboxed; drop on any slip)*
**Writes:** `src/sim/meta/attrition.js` *(new)*, `src/sim/meta/index.js`, `src/world/factionWar.js`
`factionWar.js` has **no owner** in `ARCHITECTURE.md:133-147` — assign it here and add the row in the same commit.
**Gate:** `node src/sim/meta/harness.js` with exit codes added; deposit-rate vs strip-rate assertion over a 3600 s war run must be net non-negative.

### W2-D · silhouette rules + plate metric *(no game code, safe filler)*
**Writes:** `tools/silhouette.mjs`, `tools/plates.mjs` *(new)*
Implement R2.1–R2.5 sampled off **built geometry**, not `HULL_STATIONS`. Ship `plates.mjs` with **no pass band** until the six references are run through it.
**Gate:** `node tools/silhouette.mjs` exit 0.

*Wave 2 disjointness:* A = `sim/salvo.js, sim/combat.js, sim/heat.js, input/controls.js, tools/ripple.mjs, ARCHITECTURE.md`; B = `vfx/weapons.js, audio/weapons.js`; C = `sim/meta/attrition.js, sim/meta/index.js, world/factionWar.js`; D = `tools/silhouette.mjs, tools/plates.mjs`. ✔

---

## 4. WAVE 3 — readouts and reconciliation (2 agents, stretch)

### W3-A · UI fills the shells
**Writes:** `src/ui/weapons.js`, `src/ui/hud.js`, `src/ui/hold.js`, `src/ui/index.js`
Flank band (PORT/STBD) with one pip per slot in hull order fore-to-aft, `READY n/m`, cooldown clock, projected thermal cost, `P.struck('NO MOUNTS BEAR')` for a dead flank; per-cell fire-mode chips; four new STATE entries (**`HOLD` must not use tone `starved`** — `theme.js:167-169` defines starved as an absence); MEV listeners for sortie/derelict/refitGate; the S3 hold-full refusal string. Cache any new report call at 5 Hz.
**Gate:** `npm run uicheck`, `--screen combat`, `npm run smoke` with draws/programs unchanged.

### W3-B · integration close-out
**Writes:** `src/render/postfx.js`, `src/game.js`, `ARCHITECTURE.md`, `HANDOFF.md`, `docs/review/acceptance.md`
Salvo exposure transient **composed with** `game.js:229`'s per-frame `setExposureScale(1 - blend*0.78)`, not written over it; re-measure `acceptance.md:64` from `tools/flight.mjs`; reconcile the scorecard count (`HANDOFF.md:231` says 9/3/1/6, `acceptance.md:82-85` says 11/4/2/2, the body rows say 11/3/2/2); rewrite HANDOFF against what actually landed.

---

## 5. FLAGS — things in the briefs that look wrong or overambitious

**FLAG 1 — the armament brief's handedness fix is aimed the wrong way. Highest-value correction in this review.**
The contradiction is real and I confirmed it. But the brief's justification — *"under three.js's right-handed frame with forward +Z and up +Y an object's right is −X, so line 115 is correct and line 109 is the error"* — is **mathematically false**. For an orthonormal triad (right, up, forward) to be right-handed, `right × up = forward`; `(+X) × (+Y) = (+Z)` satisfies it. So `ARCHITECTURE.md:109` "Starboard is +X" is the **correct** line, the geometry is **correct** (port anchor at −158, `coalition.js:1130` `fg_port` at x −48), and the error is the `yawCentre` sign convention against `yawOf = atan2(x, z)`.
Consequence: the fix is **14 sign flips on data lines**, not "six anchors plus ~26 `yawCentre` values" and not "mirror every module's authored X." It stops being a hull remodel that blocks the wave and becomes a 20-minute change with a one-line assertion (`dot(worldForward, hardpoint.normal) > 0.9`) that regression-proofs it forever. Note also that `ARCHITECTURE.md:114`'s "counter-clockwise looking down" is itself inconsistent with `atan2(x, z)` — the doc's *measurement* convention is the thing that drifted. **This needs the owner's ruling before W1-A starts**, but the recommendation is unambiguous: do not move geometry.

**FLAG 2 — two validators, wildly different risk; the brief treats them as one.**
`ready >= shotsPerBurst` has exactly one known violator with a known fix, so it can throw. `muzzles.length === shotsPerBurst` is being validated against data authored *fresh in the same commit* for 12 modules — any single miscount bricks boot at import time (`contracts.js:266-271`), and `bow_mining_array` already publishes 3 emitters against `shotsPerBurst` 1. **Land the muzzles check as a warn; promote to a throw only after the spot-check prints 12 clean pairs.**

**FLAG 3 — `port_beam_array` publishes 3 emitters at LOD0 and 1 at LOD1/2.** A sim quantity that changes with graphics quality breaks determinism. The static-declaration-on-the-def approach in the brief is correct and non-negotiable; do not let anyone "simplify" it back to reading `group.userData` off the built mesh.

**FLAG 4 — the visual stream's own measurement disagrees about the direction of the failure.** 78.1/20.3/1.6 (game frame, HUD in the mask) says too calm; 44.9/45.7/9.3 (ship render, the framing `ship-language.md`'s reference table was actually built from) says **too medium**. Adding 6–9 dense greeble bands could be aimed at the wrong tier — and there are 11 triangles of headroom anyway. **Do the `--frame` contract first (W1-F), then decide, then ask for a budget.** Do not schedule the bands.

**FLAG 5 — `ARCHITECTURE.md:24-26` is a non-negotiable that cuts against the greeble work directly:** *"If you are about to add surface noise to make it look better, stop."* Any band that cannot name one of §3's four justifications does not get built.

**FLAG 6 — `angAccel` cannot be a global constant.** `controls.md:1063`'s flat 0.030 rad/s² applied to `PlaneBody` unconditionally gives `coalition_corvette` a 19 s yaw spool and `coalition_strikecraft` an 80 s one. Every escort in the game stops being able to turn. Must be `spec.angAccel ?? maxRate * 2.4`. This is the single easiest way to break the game while "implementing the spec."

**FLAG 7 — CONFIRMED: `onImpact` receives no mass.** `physics.js:343` passes `(a, b, |closing|, nx, ny, nz)`. Raising player mass 62,000 → 620,000 t takes the player's share of an overlap with a Bulwark from 61.3% to 13.6% while the damage the consumer computes from closing speed alone is unchanged. **Ramming becomes strictly better.** W1-C must read the `onImpact` consumer before landing the mass change, not after.

**FLAG 8 — removing the exotic mint may make exotic unobtainable.** Killing `condition.js:167` closes a working printer, correctly. But the perk tree then needs ~467 core scrap units (121 m³ of hold) and nothing in the tree would tell you it had become unreachable. `economyAudit.mjs` must assert **reachability**, not only non-negativity.

**FLAG 9 — S3's payout change can silently drop rewards.** Graded scrap into a full hold is intended pressure only if the refusal is legible. W1-D must emit the string; W3-A must render it. If Wave 3 slips, S3 ships a silent drop — in that case land the pricing half and hold the payout half.

**FLAG 10 — the one-accent palette collapse is not a scheduling decision.** It lives in Materials' `palette.js`, it would move `C.friendly`/`C.shield`/`C.salvage` across the whole HUD, and its own risk list says the 4.5:1 floor may break. But the *measurable* defect inside it is real and separable: `C.warn #ff4a2a` (hue 9) and `C.hostile #ff4433` (hue 5) are 4° apart at **1.02:1 luminance** — the code spends thirteen lines at `theme.js:160-172` defining a distinction no eye can make. **Ship `tools/uihue.mjs` in Wave 1 as measurement; fix that one pair; hold the eight-hue collapse for the owner.**

**FLAG 11 — turning on welded auditing turns `uicheck` red immediately**, including nine false 2.0 px overlaps from the ring-label stack's 10 px pitch against a 12 px box. Tag `P.owner` and tune the slack in one commit, or someone will disable the tool — which is how it came to measure zero panels the first time.

**FLAG 12 — `sweepMax` vs `stepMin`.** A maximally-armed hull at 20 slots produces a ~1.5 s sweep, 22% past the spec's own 1.25 s ceiling. Probably fine, but `tools/ripple.mjs` must **print the worst case** rather than leave it to a playtest.

**FLAG 13 — `npm run capture -- --shots close` is red on this commit** (luma 0.009, contrast 0.004, both of capture's own guards fire). Until W1-F fixes it, no surface or damage claim measured from `docs/review/look-surface/close.png` can be regenerated or verified. Nobody may quote that frame's numbers in the meantime.

**FLAG 14 — `npm run smoke` is order-dependent on a fresh checkout** (404s on stale hashed `dist/` assets on the first run only). It is the merge gate for every wave. Pin: `rm -rf dist && npm run smoke`, or run it twice and take the second.

**FLAG 15 — the determinism scanner covers less than everyone assumes.** `selftest.mjs:675-682` is `readdirSync` over `src/sim`, **non-recursive**. It does not cover `src/sim/meta/**`, `src/sim/ai/**`, `src/art/**` or `src/vfx/**`. `src/sim/salvo.js` is covered (good); `src/sim/meta/attrition.js` is **not**. Widening the root is three lines and is assigned to W1-D.

**FLAG 16 — three briefs claim files nobody owns.** `src/world/factionWar.js` (1337 lines) and `src/world/discovery.js` (1209) have no owner in `ARCHITECTURE.md:133-147`; neither does `tools/silhouette.mjs`, `tools/surface.mjs`, `src/sim/selftest.mjs`, or `src/sim/salvo.js`. This is the identical structural hole that left `src/sim/meta/**` with a dead `game.js` seam. Every one of them is assigned above, and each assignment must add its row to the ownership table **in the same commit as the first edit**.

**FLAG 17 — `ARCHITECTURE.md:210` requires smoke before any commit, and six agents commit in Wave 1.** Serialise the merge: each agent runs its own gate, then a single integration pass runs `npm run smoke && node src/sim/selftest.mjs && npm run uicheck` on the merged tree before Wave 2 is released. A green gate per-agent does not imply a green tree.