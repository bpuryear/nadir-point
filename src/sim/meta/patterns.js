import { getModule, allModules } from '../../core/contracts.js';
import { EV } from '../../core/events.js';
import { MEV } from './events.js';
import { moduleVolume } from './cargo.js';

/**
 * PATTERNS.
 *
 * `beta-decay-systems.md` #31: Beta Decay gates fabrication on blueprints. Ours solves
 * a specific failure state that a parts-not-currency game produces and cannot otherwise
 * fix: *you need one specific part, you know exactly which part, and the RNG will not
 * give you one.* That is not tension, it is a wall.
 *
 * A pattern converts a luck problem into a materials problem, which is the correct
 * trade in a roguelike. It never converts it into a free problem: rebuilding costs
 * roughly three and a half scrapped modules' worth of alloy, so finding the real thing
 * is still better, and the rebuild comes out at 0.85 condition rather than pristine.
 *
 * WHERE PATTERNS COME FROM. Cutting an INTACT section - integrity >= 0.6 - has a chance
 * to yield the pattern as well as the part. That means the careful kill pays a fourth
 * time: the part, its condition, its item drop, and the knowledge of how to make more.
 * Blowing a hull apart with a reactor kill teaches you nothing.
 */

/** Chance an intact cut section also teaches its pattern. */
const LEARN_CHANCE = 0.22;

/** Condition a rebuilt module comes out at. Never 1.0 - a copy is a copy. */
const REBUILD_CONDITION = 0.85;

/**
 * What rebuilding a module costs, derived from its mass and what it is - never
 * authored, so all twenty-four existing modules are covered without a content pass.
 *
 * The arithmetic is meant to be doable in the player's head: alloy is about a third of
 * the module's tonnage, and a scrapped module gives about a tenth of its tonnage back.
 */
export function patternCost(def) {
  if (!def) return null;
  const mass = def.mass ?? 200;
  const g = def.grants ?? {};
  const cost = { alloy: Math.round(mass * 0.35) };
  const structural = !def.weapon && !g.powerOutput && !g.sensorRange;
  if (structural || g.armour || g.cargo) cost.composite = Math.round(mass * 0.10);
  if (def.weapon || g.sensorRange || g.powerOutput || g.hangarBays) {
    cost.electronics = Math.round(mass * 0.08);
  }
  // Only tier 3 costs the irreplaceable material, and only a little. Exotic is the
  // scarcity that perks compete for; patterns must not drain it.
  if (def.tier >= 3) cost.exotic = 1;
  return cost;
}

export class PatternSystem {
  constructor(world) {
    this.world = world;
    this.bus = world.bus;
    this.rng = world.rng.fork('patterns');
    this.name = 'patterns';

    /** @type {Map<string, {moduleId:string, learnedAt:number, builds:number}>} */
    this.known = new Map();

    /** Multiplied into every rebuild cost. A perk lowers it. */
    this.costMultiplier = 1;
  }

  has(moduleId) { return this.known.has(moduleId); }

  /** Learn a pattern outright. Used by objective payouts and by the harness. */
  learn(moduleId, reason = '') {
    const def = getModule(moduleId);
    if (!def || this.known.has(moduleId)) return false;
    this.known.set(moduleId, { moduleId, learnedAt: this.world.time ?? 0, builds: 0 });
    this.world.systems.codex?.markModule(moduleId, 'scanned');
    this.bus?.emit(MEV.PATTERN_LEARNED, { moduleId, def, reason });
    this.bus?.emit(EV.NOTIFY, { text: `PATTERN RECOVERED — ${def.name}`, important: true });
    return true;
  }

  /**
   * Roll a cut section for its pattern. Only intact sections teach anything, which is
   * the rule that reaches back into how you are told to fight.
   */
  rollFromSection(section, rng = this.rng) {
    if (!section?.moduleId) return null;
    if ((section.integrity ?? 0) < 0.6) return null;
    if (this.known.has(section.moduleId)) return null;
    if (rng.next() > LEARN_CHANCE) return null;
    return this.learn(section.moduleId, 'salvage') ? section.moduleId : null;
  }

  /** Cost to rebuild, after the perk multiplier. */
  costOf(moduleId) {
    const raw = patternCost(getModule(moduleId));
    if (!raw) return null;
    const out = {};
    for (const k in raw) out[k] = Math.max(1, Math.round(raw[k] * this.costMultiplier));
    return out;
  }

  /** Can this be rebuilt right now, and if not, why not. */
  canBuild(moduleId) {
    const def = getModule(moduleId);
    if (!def) return { ok: false, reason: `unknown module "${moduleId}"` };
    if (!this.known.has(moduleId)) return { ok: false, reason: 'no pattern' };
    const econ = this.world.systems.economy;
    const cost = this.costOf(moduleId);
    if (econ && !econ.canAfford(cost)) {
      return { ok: false, reason: 'insufficient materials', cost, shortfall: econ.shortfall(cost) };
    }
    const hold = this.world.systems.cargo;
    const room = hold?.canTakeModule(def);
    if (room && !room.ok) return { ok: false, reason: room.reason, cost, volume: room.volume };
    return { ok: true, cost, volume: moduleVolume(def) };
  }

  /**
   * Rebuild one, into the hold. The refit system installs it from there like any other
   * salvaged part - there is exactly one path by which a module reaches a mount.
   */
  build(moduleId) {
    const check = this.canBuild(moduleId);
    if (!check.ok) return check;
    const def = getModule(moduleId);
    const econ = this.world.systems.economy;
    const paid = econ ? econ.spend(check.cost, `pattern:${moduleId}`) : { ok: true };
    if (!paid.ok) return paid;

    const rec = this.known.get(moduleId);
    rec.builds++;
    const item = {
      moduleId,
      condition: REBUILD_CONDITION,
      uid: `pattern:${moduleId}#${rec.builds}`,
      volume: moduleVolume(def),
      rebuilt: true,
    };
    this.world.inventory.push(item);
    this.bus?.emit(MEV.PATTERN_BUILT, { moduleId, def, cost: check.cost, item });
    this.bus?.emit(MEV.CARGO_CHANGED, { reason: 'pattern' });
    this.bus?.emit(EV.NOTIFY, { text: `${def.name} REBUILT FROM PATTERN`, important: true });
    return { ok: true, item, cost: check.cost };
  }

  // --- read API -------------------------------------------------------------

  /**
   * Every module, whether its pattern is known, what rebuilding costs, and whether it
   * can be paid for right now. A rebuild screen is a filter over this list.
   */
  describe() {
    const econ = this.world.systems.economy;
    return allModules().map((def) => {
      const rec = this.known.get(def.id);
      const cost = this.costOf(def.id);
      const check = rec ? this.canBuild(def.id) : { ok: false, reason: 'no pattern' };
      return {
        moduleId: def.id,
        name: def.name,
        hardpoint: def.hardpoint,
        tier: def.tier,
        faction: def.faction,
        known: !!rec,
        builds: rec?.builds ?? 0,
        cost,
        affordable: !!(rec && econ?.canAfford(cost)),
        shortfall: rec && econ && !econ.canAfford(cost) ? econ.shortfall(cost) : null,
        volumeM3: moduleVolume(def),
        buildable: check.ok,
        reason: check.ok ? null : check.reason,
        condition: REBUILD_CONDITION,
      };
    });
  }

  /** Just the ones you hold. The short list. */
  describeKnown() {
    return this.describe().filter((r) => r.known);
  }
}
