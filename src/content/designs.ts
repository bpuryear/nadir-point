import type { Design, Doctrine } from './types.ts';

// Standard patterns issued to the player, and the opposing force for Exercise 1.

const lineDoctrine: Doctrine = { role: 'line', engage: 'optimal', priority: [], withdrawAt: 0.25 };

export const STANDARD_PATTERNS: readonly Design[] = [
  {
    id: 'picket-a',
    name: 'Picket, pattern A',
    hull: 'picket',
    modules: { B1: 'md-m', D1: 'ac-s', C1: 'reactor-m', C2: 'bridge', E1: 'drive-m' },
    armour: [30, 15, 15, 10],
    doctrine: lineDoctrine,
  },
  {
    id: 'warden-a',
    name: 'Warden, pattern A',
    hull: 'warden',
    modules: {
      B1: 'md-m',
      D1: 'md-m',
      D2: 'md-m',
      P1: 'ac-s',
      S1: 'ac-s',
      C1: 'reactor-l',
      C2: 'damage-control',
      C3: 'bridge',
      E1: 'drive-m',
      E2: 'drive-m',
    },
    armour: [50, 35, 35, 20],
    doctrine: lineDoctrine,
  },
  {
    id: 'bastion-a',
    name: 'Bastion, pattern A',
    hull: 'bastion',
    modules: {
      B1: 'md-l',
      D1: 'md-l',
      D2: 'md-m',
      P1: 'md-m',
      P2: 'md-m',
      S1: 'md-m',
      S2: 'md-m',
      C1: 'reactor-l',
      C2: 'reactor-m',
      C3: 'damage-control',
      C4: 'bridge',
      E1: 'drive-l',
      E2: 'drive-l',
    },
    armour: [80, 50, 50, 30],
    doctrine: lineDoctrine,
  },
];

/** Exercise 1 opposing force: fast gun frigates that close in and circle. */
export const RAIDER_LANCET: Design = {
  id: 'opfor-lancet-raider',
  name: 'Lancet, raider fit',
  hull: 'lancet',
  modules: { B1: 'ac-m', B2: 'ac-s', D1: 'ac-s', C1: 'reactor-m', C2: 'bridge', E1: 'drive-m' },
  armour: [25, 10, 10, 5],
  doctrine: { role: 'strike', engage: 'short', priority: ['cruiser', 'destroyer'], withdrawAt: 0 },
};
