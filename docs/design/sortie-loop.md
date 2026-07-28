# The sortie loop

What `closest-comparables.md` §5.2 identified as the single highest-value change in the
project, built. Five systems, one shape:

> **leave a berth with a loadout you have committed to, work until the tank or the hold
> ends it, come back somewhere, and read what it cost.**

Nothing here invents a resource. Propellant, hold volume, condition, materials, the
codex, reputation and the faction war all existed; this document is about the wiring
between them that did not.

---

## What was actually there before

Checked against the tree, not against our own documents.

| Claim in the research | Verified |
|---|---|
| `travel.refuel()` at `travel.js:671`, called by nobody | **True.** Zero call sites in `src/`. |
| Six station and yard POIs with blurbs and no interaction | **Five, not six.** `vault-nine` is `kind: 'graveyard'` with a derelict-yard blurb. The five are Ironhold, Cinderport, Hollow Anchor, Meridian Gate, Tallow. |
| `installTime = 2.5` declared at `refit.js:51`, never consumed | **True.** |
| Every `SHIP_DESTROYED` listener handles the NPC case, none handles the player | **True.** The player became `dead: true` and the world ran on around a corpse. |
| No `localStorage` anywhere in `src/` | **True.** |
| Pursuit model is `reputation <= -40` and nothing else | **True.** |

Two things the research did not find, that the headless harness did:

- **`stores.js:279` reads `world.systems.travel.transiting`** before charging manoeuvring
  propellant, so a transit leg is not billed twice. `TravelSystem` had no such property.
  The check was permanently `undefined`, and every burn paid *both* the published
  0.8 units/km *and* the per-delta-v manoeuvring rate.
- **`factionWar.dematerialise` turned a loose module into a frigate.** A `DetachedModule`
  you shot off a mount pad and did not collect fell through the generic hulk branch,
  which has no `sourceClass`, so it came back as a whole frigate hulk on your next visit.

---

## 1. Docking and anchorages

`src/world/system.js` (the table), `src/world/travel.js` (the verbs).

The five berths are deliberately **not interchangeable**, because a service you can get
anywhere is not a reason to go anywhere. Measured from the running harness:

| Berth | Kind | Propellant | Repair subsidy | Repair rate | Refine rate | Refit speed | Min standing | Heavy |
|---|---|---|---|---|---|---|---|---|
| Ironhold Repair Yard | yard | 1.35 /u | 50% | ×4.5 | ×1.8 | ×4.0 | −20 | yes |
| Cinderport Anchorage | station | **0.62 /u** | 18% | ×2.0 | **×3.6** | ×1.8 | −40 | no |
| Hollow Anchor | station | 1.10 /u | 12% | ×2.4 | ×2.2 | ×1.6 | **0** | no |
| Meridian Gate | station | 0.85 /u | 34% | ×3.4 | ×3.0 | ×2.6 | **+5** | no |
| Tallow Fitting Yard | yard | 1.05 /u | 22% | ×2.6 | ×2.0 | **×5.0** | −15 | yes |

Propellant is bought with **refined alloy** — the same alloy that repairs, ammunition,
pattern rebuilds and perks come out of. That is the point: propellant becomes a fourth
claim on the pool the scope decision asked to keep scarce, rather than a number that only
goes down. A full 460-unit fill costs 271 alloy at Cinderport and 590 at Ironhold.

An anchorage that cannot be paid extends **credit**, which becomes `sortie.debt`, settled
out of refined stock the next time you dock. That is Hardspace's one genuinely
load-bearing persistent number and it costs one integer.

**Refusals are the design.** Every one names the thing that is wrong and what would fix
it: `900 m/s — come alongside under 90`, `40 km out — close to 9 km`, `COALITION WILL NOT
BERTH YOU — standing -50, minimum -40`, `THE GRAVEYARD IS CONTESTED — the berth is shut`.

### The four questions

1. **Decision.** Which berth. Cheap propellant and a fast refinery, or heavy gantries and
   a subsidised rebuild, or the one that is merely closest — against standing, against
   who currently holds it, and against the propellant to get there.
2. **Interlocks.** Propellant, materials, reputation, the control field (a berth in
   contested space is shut), the repair queue, the refinery queue, refit gating, the
   debrief, the save.
3. **Abstracts.** The berth itself. There is no docking sequence, no station interior, no
   dock master and no crew. Coming alongside is a range and a speed check.
4. **Visible.** `travel.dockStatus()`, `travel.services()` and `travel.status().anchorages`
   — the last of which marks every known berth `reachable` or not, on the current tank.

---

## 2. Refit commitment

`src/sim/meta/refitGate.js`. Implements `docs/design/look-target.md` §2, which is binding.

| Where | Install time (400 t tier 2) | Condition cost | Occupied mount | Tier 3 |
|---|---|---|---|---|
| Cinderport | 2.4 s | — | swap allowed | refused |
| Ironhold / Tallow | 1.1–1.4 s | — | swap allowed | **allowed** |
| Open space | 15.2 s | **−10%** | **refused** | refused |
| Open space + Field Dock | 7.7 s | −3.5% | refused | refused |

The Field Dock (`ventral_repair_bay`) buys autonomy at the price of a ventral hardpoint
that could have carried cargo pods, a hangar deck, a drone bay or the salvage tractor.
That tension needed no new system; it is the one the research asked for.

### The four questions

1. **Decision.** Which six modules you leave the berth with — previously not a decision,
   because it was free to undo from anywhere. And the live one: cut your own cargo pods
   off, at a condition cost and thirty seconds of dead mount, to bolt on the thing
   floating in front of you?
2. **Interlocks.** The sortie (a fit is chosen where a sortie begins), the anchorage table,
   the Field Dock, condition, and every downstream system that already reads condition.
3. **Abstracts.** The work. A duration and a condition delta; no minigame, no crew.
4. **Visible.** `refitGate.describe()` returns per hardpoint, per stored part, the seconds
   and the condition cost, or the sentence explaining what would make it possible.

---

## 3. Crippling, not death

`Ship._cripple` (mechanism) and `src/sim/meta/derelict.js` (consequences). Implements
`look-target.md` §3, which is binding and **differs from the research brief on one
point**: the brief said the hold is lost; the decision says the hold survives, because
losing an hour of careful cutting to one bad fight reads as punishing while losing your
installed guns reads as dramatic. `DERELICT.ventHold` is the one constant that flips it.

From the harness, a hull with three modules fitted at 30% / 90% / 20% structure:

```
dead: false   crippled: true   scrammed: true
engine efficiency 0   steering 0
fit before: bow@30% dorsal@90% port@20%
fit after : dorsal
hold after: 60 plate scrap  <- survives
drifting  : 45 s, tender from Hollow Anchor, bill 335 alloy
site      : 2 modules — Bow Rail @0.80, Port Cannon Bank @0.80
after     : crippled=false, hull 28%, towed to hollow-anchor, docked
site now  : 521 km away, still on the record
```

A mount that was already failing goes; a mount at full structure holds. **That makes
pre-sortie structure repair insurance rather than housekeeping.** At least one always
goes, or a hull that reached zero cost nothing.

### The four questions

1. **Decision.** Whether to go back — four mounts instead of six, in contested space,
   with whatever killed you possibly still there. And, earlier, whether to break off:
   losing now costs named hardware rather than a reload.
2. **Interlocks.** Hardpoint structure, the detached-module path that already existed and
   was already symmetric, salvage, the anchorages, reputation (who will tow you), debt.
3. **Abstracts.** The tow. A duration and a bill; the interesting part is the wreck you
   left, not the journey back.
4. **Visible.** `derelict.status()` while drifting, `derelict.sites()` afterwards, with
   what is at each site and how far away it is.

### The stranding path

The harness found a soft lock immediately: with the authored POI spacing and 0.8 units per
kilometre, a full 640-unit tank affords **roughly one long leg and not two**. Burn 463 km
from Cinderport to Marrow Shoal and the way home costs 371 of the 229 you have left — even
under SILENT at 0.5 u/km it is 232 against 229.

`integration-decisions.md` had already promised the answer and nobody had built it: a
tender from the faction that dislikes you least, at a price that reflects how they feel.
`DERELICT.strandGrace` (45 s, long enough to notice and decide) then a 90 s tow and a
surcharged bill. Running the tank dry is now expensive rather than terminal.

**This is a live tuning question, not a solved one** — see the weaknesses in the stream
report. The loop as built is berth-to-berth and one-way, which is a defensible shape, but
nobody has decided that it is the intended one.

---

## 4. Persistence

`src/core/persistence.js`. One slot, versioned, refusing rather than migrating.

The rule that decides what is in the file: **everything the player earned, nothing the
world can regenerate.** The star system is authored and the module registry is built from
code, so neither is saved. Saved: hull and fit and per-section condition, hardpoint
structure, stores, hold, scrap and refining queue, refined pools, codex, perks, patterns,
discovery, the whole faction war including per-POI hulks and strays, reputation, the
salvage ledger, debt, and every site where the player has left hardware.

A save whose `version` or `seed` does not match is **refused and the world is not
touched**. For a game with no run structure a corrupted persistent hull has no recovery
path, so refusing a load is strictly better than half-applying one.

**Determinism, honestly.** Every system forks `world.rng` by label, so a restored world
draws from the same seed and the same labels. What is *not* preserved is the position of
each fork's stream — around twenty forks, and serialising each one's internal word buys
bit-exactness in exchange for a format that breaks whenever a system adds a fork. Saving
and reloading reproduces the same **world** and re-rolls future dice.

Verified: 16 of 16 fingerprinted fields identical across save → fresh world → load.

### The four questions

1. **Decision.** None. This is the one system here that creates no decision, and it is
   included anyway because a persistent-hull premise with no save is not a premise.
2. **Interlocks.** Everything, by reading it.
3. **Abstracts.** RNG stream position, live battles (discarded on load), transient dock
   multipliers, and anything mid-animation.
4. **Visible.** `persistence.peek()` reports the file's version, seed, sim time and
   whether it is compatible, without applying it. Autosave fires on docking and says so.

---

## 5. The escalation ledger

`src/world/factionWar.js`. FTL's Rebel Fleet, earned rather than imposed.

| Tier | At claim | Sends | Cooldown |
|---|---|---|---|
| tender | 110 | corvette + corvette | 200 s |
| picket | 260 | frigate + corvette + corvette | 260 s |
| hunter | 480 | destroyer + frigate | 340 s |

A tender and a picket come to the **field**; a hunter plots to **you**, on your bearing,
even mid-transit. All three use the same `pickClass` / `new Ship` / `fleetAI.create` path
the interception code already used, so an escalation group is not a new kind of enemy — it
is the fleet AI arriving with a reason.

Accrual is scaled by how much of the place the faction holds, so the same cut is worth
3.3× more attention deep in their space than deep in the enemy's. Decay is scaled the
opposite way. Measured:

```
at Ironhold, Coalition control share 0.95   -> sheds 0.61/s
at Meridian Gate, share 0.18                -> sheds 1.45/s
120 s of the same waiting: 73 shed vs 174 shed
```

Docking at a berth they run buys 35% of the claim off. You paid them.

The ledger deliberately **does not touch reputation**. Being on excellent terms with the
Coalition is not a licence to strip their dead, and keeping attention and hostility
separable means the two systems can be read independently.

### The four questions

1. **Decision.** When to leave a field that is still paying, and where to go next. Both
   were previously free.
2. **Interlocks.** Salvage, the control field, travel, the anchorages, the fleet AI.
3. **Abstracts.** The bookkeeping. One number per faction and where you were standing when
   it moved — no per-hull ownership record, no bounty board, no adjuster.
4. **Visible.** `war.ledgerStatus()` gives claim, tier, distance to the next rung and the
   live decay rate, and the notification fires at **70% of a threshold** — before the
   response, not with it.

---

## Handover: the change `src/sim/refit.js` needs

`src/sim/refit.js` belongs to another stream this wave, so the gate lives outside it and
`RefitGateSystem.enforce()` wraps the live instance's `install` and `uninstall` at runtime.
That works and is exercised end to end in the harness, but it is a wrapper and it should
not survive. **The proper change is four lines and one field.** At the top of
`RefitSystem.install(hardpointId, inventoryUid, opts)` and `uninstall(hardpointId, opts)`,
delegate unless told not to:

```js
const gate = this.world.systems.refitGate;
if (gate && !opts?.bypassGate) return gate.beginInstall(hardpointId, inventoryUid);
```

…with `beginUninstall(hardpointId)` in `uninstall`, and set `this.gated = true` in the
constructor so `enforce()` permanently stands down. The gate calls back through the
originals when its timer expires, applies the condition penalty to the inventory entry
*before* installing (so there is exactly one condition number and `_applyModuleEffects`
reads the same one everything else does), and needs nothing else from that file. Keeping
`installTime = 2.5` where it is is correct — the gate reads it as its base and scales it
by module mass, tier and where the work is happening.

### Handover: `src/ui/refit.js`

`RefitScreen.install()` at line 240 calls `refit.install(...)` and, on `ok`, immediately
says `INSTALLED <name>`. Under the gate that call now returns
`{ ok: true, pending: true, module, seconds, job }` — the job has been *accepted*, not
finished. The return keeps `ok` and `module` populated so nothing breaks, and the player
is told the truth by the notification stream (`REFIT — X → PORT — 15s`, then
`REFIT COMPLETE — X → PORT`), but the order-bar line is optimistic by up to thirty
seconds. **The fix is to branch on `res.pending`** and say `FITTING <name> · <n>s`,
listening for `MEV.REFIT_FINISHED` for the confirmation. `refitGate.status().job` gives
`{label, remaining, total}` for a progress bar, and `refitGate.describe()` gives per-mount
seconds and condition cost for the part list, so the screen can price a swap before the
player commits to it.

Two smaller notes for the refit stream: `repairPlan()` rows of `kind: 'structure'` on a
breached mount should carry a flag rather than being detected by the string
`'BREACHED — …'`, which is what `travel.serviceRepair` currently matches on; and
`repairHardpoint`, `repairHull` and `fabricateAmmo` report their price three different ways
(a bare number, a cost object, and named `alloy`/`composite` fields), which the dock
subsidy has to normalise.
