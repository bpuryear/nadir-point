import type { Zone } from '../sim/deploy.ts';
import { RAIDER_LANCET, STANDARD_PATTERNS } from './designs.ts';
import type { Design } from './types.ts';

export interface ExerciseDef {
  id: string;
  number: number;
  title: string;
  /** Terse fleet-directive text, one paragraph per entry. */
  briefing: string[];
  width: number;
  height: number;
  maxSeconds: number;
  budget: number;
  playerZone: Zone;
  enemyZone: Zone;
  enemy: { design: Design; count: number }[];
  /** The fleet a new player is issued. */
  issued: { design: Design; count: number }[];
}

const byId = (id: string): Design => STANDARD_PATTERNS.find((d) => d.id === id)!;

export const EXERCISE_1: ExerciseDef = {
  id: 'ex1-picket-line',
  number: 1,
  title: 'PICKET LINE',
  briefing: [
    'FLEET TRAINING DIRECTIVE 1. EXERCISE PICKET LINE.',
    'OPPOSING FORCE: TWELVE LANCET-CLASS GUNBOATS, RAIDER FIT, UNDER STRIKE DOCTRINE. THEY WILL GO FOR YOUR HEAVY UNITS FIRST.',
    'ALLOCATION: 7,000 REQUISITION. STANDARD PATTERNS ARE ISSUED. YOU MAY REFIT THEM.',
    'THE UMPIRES WILL NOT INTERVENE. REPORT THE CAUSES OF ANY LOSS IN FULL.',
  ],
  width: 6000,
  height: 4000,
  maxSeconds: 480,
  budget: 7000,
  playerZone: { x0: 300, x1: 1600, y0: 600, y1: 3400 },
  enemyZone: { x0: 4400, x1: 5700, y0: 600, y1: 3400 },
  enemy: [{ design: RAIDER_LANCET, count: 12 }],
  issued: [
    { design: byId('bastion-a'), count: 1 },
    { design: byId('warden-a'), count: 1 },
    { design: byId('picket-a'), count: 3 },
  ],
};

export const EXERCISES: readonly ExerciseDef[] = [EXERCISE_1];
