/**
 * THE FACTION ROSTER.
 *
 * The world sim needs hulls to fight with. When the geometry stream has registered
 * faction ship classes we use those and nothing in here runs. Until it has, the war
 * would otherwise be an abstraction with nothing to spawn - so this file provides
 * fallback classes that are real `ShipClassDef`s: real masses, real turn rates, and
 * above all REAL FIRING ARCS, because arcs are the thing the ship AI is written
 * against and an AI tested on a ship that can shoot in every direction is an AI that
 * has never been tested.
 *
 * These are NOT registered with `registerShipClass`. They are plain definitions handed
 * to `new Ship(...)`, so the day the geometry stream lands its own `coalition_frigate`
 * the registry wins and this file goes quiet on its own.
 *
 * Arc layout, and why it is the important part:
 *
 *   corvette   one bow mount, 80 degrees wide. Has to point at you. Fast enough that
 *              pointing is cheap, which is why it harasses instead of trading.
 *   frigate    port and starboard batteries, 109 degrees each, with a 40 degree dead
 *              zone fore and aft. To fire it must show you its flank. That single fact
 *              is the whole of frigate behaviour.
 *   destroyer  heavy port and starboard batteries plus a narrow bow lance, so it has
 *              something to do while it is turning and a reason to close.
 */

import * as THREE from 'three';
import { HULL_LENGTH, RANGE } from '../../core/units.js';
import { shipClassesForFaction } from '../../core/contracts.js';

const PI = Math.PI;

/** Box/triplanar UVs in metres - the material registry authors its maps that way. */
function metreUV(geometry) {
  const pos = geometry.attributes.position;
  const nor = geometry.attributes.normal;
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    const nx = Math.abs(nor.getX(i)), ny = Math.abs(nor.getY(i)), nz = Math.abs(nor.getZ(i));
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    let u, v;
    if (nx >= ny && nx >= nz) { u = z; v = y; }
    else if (ny >= nz) { u = x; v = z; }
    else { u = x; v = y; }
    uv[i * 2] = u;
    uv[i * 2 + 1] = v;
  }
  geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return geometry;
}

function box(w, h, d, mat, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(metreUV(new THREE.BoxGeometry(w, h, d)), mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

/**
 * A blunt, hard-edged hull. Twelve boxes at the outside, which is well inside the
 * module budget and reads at tactical zoom as a silhouette rather than a blob - the
 * only property that matters at the ranges these are seen from.
 */
function buildHull(ctx, { length, beam, height, faction, sponsons }) {
  const g = new THREE.Group();
  const materials = ctx?.materials;
  if (!materials?.get) return g;   // headless: the sim runs, nothing is drawn

  const wear = faction === 'coalition' ? 0.62 : 0.30;
  const hull = materials.get('hull', { faction, wear, tier: 2 });
  const dark = materials.get('hullDark', { faction, wear: Math.min(1, wear + 0.15) });
  const greeble = materials.get('greeble', { faction, wear });

  g.add(box(beam, height, length * 0.62, hull, 0, 0, -length * 0.04));
  // prow: narrower and lower, so the silhouette has a direction from any angle
  g.add(box(beam * 0.56, height * 0.66, length * 0.30, hull, 0, -height * 0.10, length * 0.40));
  // dorsal spine
  g.add(box(beam * 0.40, height * 0.72, length * 0.28, dark, 0, height * 0.72, -length * 0.14));
  // engine block
  g.add(box(beam * 0.78, height * 0.86, length * 0.12, dark, 0, 0, -length * 0.44));

  if (sponsons) {
    for (const side of [-1, 1]) {
      g.add(box(beam * 0.30, height * 0.52, length * 0.34, greeble, side * beam * 0.62, height * 0.06, -length * 0.02));
    }
  }

  // Engine bells: additive glow, one per side. The only bright thing on the hull.
  const glow = materials.get('engineGlow', { faction, intensity: 2.6 });
  for (const side of [-1, 1]) {
    const q = new THREE.Mesh(new THREE.PlaneGeometry(beam * 0.30, height * 0.60), glow);
    q.position.set(side * beam * 0.22, 0, -length * 0.505);
    q.rotation.y = PI;
    q.renderOrder = 4;
    g.add(q);
  }
  return g;
}

function weapon(id, name, type, over = {}) {
  const base = {
    id, name, type,
    range: RANGE.cannon,
    damage: 42,
    shotsPerBurst: 3,
    burstInterval: 0.16,
    cooldown: 3.4,
    projectileSpeed: 1400,
    tracking: 0.55,
    powerDraw: 8,
    subsystemAccuracy: 0.55,
    mount: [0, 0, 0],
    yawCentre: 0,
    yawWidth: PI * 0.45,
  };
  return { ...base, ...over };
}

/**
 * Fallback classes, by role. Numbers are chosen so the three roles genuinely play
 * differently against each other rather than being one ship at three sizes:
 * a corvette out-turns a frigate three to one and dies to two hits from it.
 */
const ROLES = {
  corvette: (faction) => ({
    id: `${faction}_corvette_fallback`,
    name: faction === 'coalition' ? 'Coalition Lancet' : 'Concord Whipcord',
    faction, role: 'corvette',
    length: HULL_LENGTH.corvette,
    mass: 3200, maxSpeed: 240, accel: 26, turnRate: 0.62,
    hullHP: 900, triBudget: 400, planeLocked: true,
    beam: 26, height: 20,
    subsystems: [
      { id: 'engine', kind: 'engine', hp: 180, position: [0, 0, -38], radius: 16, salvageValue: 0.18, label: 'Drive' },
      { id: 'guns', kind: 'weapon', hp: 150, position: [0, 4, 26], radius: 14, salvageValue: 0.30, label: 'Bow Guns' },
      { id: 'reactor', kind: 'reactor', hp: 220, position: [0, 0, -8], radius: 12, salvageValue: 0.34, label: 'Core' },
    ],
    weapons: [
      weapon('cv_bow', 'Bow Autocannon', 'cannon', {
        mount: [0, 3, 34], yawCentre: 0, yawWidth: PI * 0.44,
        range: RANGE.cannon * 0.72, damage: 26, shotsPerBurst: 5, burstInterval: 0.11,
        cooldown: 2.2, projectileSpeed: 1700, tracking: 1.1,
      }),
      weapon('cv_pd', 'Point Defence', 'pd', {
        mount: [0, 8, 0], yawCentre: 0, yawWidth: PI * 1.9, pitchWidth: PI * 0.9,
        range: RANGE.pointDefence, damage: 9, shotsPerBurst: 4, burstInterval: 0.06,
        cooldown: 0.9, projectileSpeed: 2400, tracking: 3.2,
      }),
    ],
  }),

  frigate: (faction) => ({
    id: `${faction}_frigate_fallback`,
    name: faction === 'coalition' ? 'Coalition Ardent' : 'Concord Meridian',
    faction, role: 'frigate',
    length: HULL_LENGTH.frigate,
    mass: 22000, maxSpeed: 155, accel: 9.5, turnRate: 0.20,
    hullHP: 3400, triBudget: 700, planeLocked: true,
    beam: 46, height: 34,
    subsystems: [
      { id: 'engine', kind: 'engine', hp: 620, position: [0, 0, -84], radius: 26, salvageValue: 0.20, label: 'Main Drive' },
      { id: 'port_battery', kind: 'weapon', hp: 420, position: [-26, 4, -6], radius: 24, salvageValue: 0.32, label: 'Port Battery' },
      { id: 'stbd_battery', kind: 'weapon', hp: 420, position: [26, 4, -6], radius: 24, salvageValue: 0.32, label: 'Starboard Battery' },
      { id: 'reactor', kind: 'reactor', hp: 700, position: [0, 0, -20], radius: 22, salvageValue: 0.38, label: 'Reactor' },
      { id: 'sensor', kind: 'sensor', hp: 240, position: [0, 26, 42], radius: 16, salvageValue: 0.12, label: 'Sensor Mast' },
    ],
    weapons: [
      weapon('fg_port', 'Port Mass Driver Bank', 'cannon', {
        mount: [-26, 4, -6], yawCentre: PI * 0.5, yawWidth: PI * 0.605,
        range: RANGE.cannon, damage: 46, shotsPerBurst: 4, cooldown: 3.8, tracking: 0.5,
      }),
      weapon('fg_stbd', 'Starboard Mass Driver Bank', 'cannon', {
        mount: [26, 4, -6], yawCentre: -PI * 0.5, yawWidth: PI * 0.605,
        range: RANGE.cannon, damage: 46, shotsPerBurst: 4, cooldown: 3.8, tracking: 0.5,
      }),
      weapon('fg_pd', 'Point Defence', 'pd', {
        mount: [0, 20, 20], yawCentre: 0, yawWidth: PI * 1.9, pitchWidth: PI * 0.9,
        range: RANGE.pointDefence, damage: 8, shotsPerBurst: 4, burstInterval: 0.07,
        cooldown: 1.1, projectileSpeed: 2400, tracking: 3.0,
      }),
    ],
  }),

  destroyer: (faction) => ({
    id: `${faction}_destroyer_fallback`,
    name: faction === 'coalition' ? 'Coalition Bulwark' : 'Concord Peregrine',
    faction, role: 'destroyer',
    length: HULL_LENGTH.destroyer,
    mass: 96000, maxSpeed: 128, accel: 6.4, turnRate: 0.115,
    hullHP: 9600, triBudget: 1100, planeLocked: true,
    beam: 92, height: 66,
    subsystems: [
      { id: 'engine', kind: 'engine', hp: 1500, position: [0, 0, -192], radius: 52, salvageValue: 0.20, label: 'Main Drive' },
      { id: 'port_battery', kind: 'weapon', hp: 1050, position: [-52, 8, -20], radius: 46, salvageValue: 0.34, label: 'Port Battery' },
      { id: 'stbd_battery', kind: 'weapon', hp: 1050, position: [52, 8, -20], radius: 46, salvageValue: 0.34, label: 'Starboard Battery' },
      { id: 'lance', kind: 'weapon', hp: 620, position: [0, -4, 172], radius: 32, salvageValue: 0.30, label: 'Bow Lance' },
      { id: 'reactor', kind: 'reactor', hp: 1900, position: [0, 0, -52], radius: 44, salvageValue: 0.40, label: 'Reactor' },
      { id: 'sensor', kind: 'sensor', hp: 520, position: [0, 52, 96], radius: 28, salvageValue: 0.14, label: 'Sensor Mast' },
    ],
    weapons: [
      weapon('dd_port', 'Port Heavy Battery', 'cannon', {
        mount: [-52, 8, -20], yawCentre: PI * 0.5, yawWidth: PI * 0.545,
        range: RANGE.cannon * 1.15, damage: 92, shotsPerBurst: 3, cooldown: 4.6,
        projectileSpeed: 1250, tracking: 0.38,
      }),
      weapon('dd_stbd', 'Starboard Heavy Battery', 'cannon', {
        mount: [52, 8, -20], yawCentre: -PI * 0.5, yawWidth: PI * 0.545,
        range: RANGE.cannon * 1.15, damage: 92, shotsPerBurst: 3, cooldown: 4.6,
        projectileSpeed: 1250, tracking: 0.38,
      }),
      weapon('dd_lance', 'Bow Lance', 'lance', {
        mount: [0, -4, 186], yawCentre: 0, yawWidth: PI * 0.22, pitchWidth: PI * 0.14,
        range: RANGE.lance, damage: 120, shotsPerBurst: 1, burstInterval: 0.2,
        cooldown: 7.5, projectileSpeed: Infinity, tracking: 0.30, subsystemAccuracy: 0.88,
      }),
      weapon('dd_pd', 'Point Defence', 'pd', {
        mount: [0, 40, 40], yawCentre: 0, yawWidth: PI * 1.9, pitchWidth: PI * 0.9,
        range: RANGE.pointDefence, damage: 10, shotsPerBurst: 5, burstInterval: 0.06,
        cooldown: 0.85, projectileSpeed: 2400, tracking: 3.0,
      }),
    ],
  }),
};

export const AI_ROLES = ['corvette', 'frigate', 'destroyer'];

const _cache = new Map();

function fallbackClass(faction, role) {
  const key = `${faction}/${role}`;
  const hit = _cache.get(key);
  if (hit) return hit;

  const spec = (ROLES[role] ?? ROLES.frigate)(faction);
  const { beam, height, ...rest } = spec;
  const def = {
    ...rest,
    build(ctx) {
      return buildHull(ctx, {
        length: spec.length, beam, height, faction,
        sponsons: role !== 'corvette',
      });
    },
  };
  _cache.set(key, def);
  return def;
}

/**
 * The class the war should spawn for this faction and role.
 *
 * Registry first, always. `role` is honoured when the registry has one; otherwise the
 * closest registered hull by length is used, because a war fought with whatever
 * happens to be registered is better than a war that refuses to start.
 */
export function pickClass(faction, role) {
  const registered = shipClassesForFaction(faction).filter((c) => c.role !== 'fighter' && c.role !== 'hulk');
  if (registered.length) {
    const exact = registered.filter((c) => c.role === role);
    if (exact.length) return exact[0];
    const want = HULL_LENGTH[role] ?? HULL_LENGTH.frigate;
    let best = registered[0];
    let bestErr = Infinity;
    for (const c of registered) {
      const err = Math.abs((c.length ?? want) - want);
      if (err < bestErr) { bestErr = err; best = c; }
    }
    return best;
  }
  return fallbackClass(faction, role);
}

/** True when the war is running on fallback hulls. The probe prints this. */
export function usingFallbackRoster(faction = 'coalition') {
  return shipClassesForFaction(faction).filter((c) => c.role !== 'fighter').length === 0;
}
