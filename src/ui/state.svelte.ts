import { STANDARD_PATTERNS } from '../content/designs.ts';
import { EXERCISE_1, type ExerciseDef } from '../content/exercises.ts';
import type { Design } from '../content/types.ts';
import type { BattleReport } from '../sim/report.ts';
import type { InspectDetail } from '../worker/protocol.ts';

export type Screen = 'briefing' | 'designer' | 'fleet' | 'battle' | 'report';

export interface BattleView {
  active: boolean;
  seed: number;
  tick: number;
  onField: [number, number];
  ended: boolean;
  winner: number;
  speed: number;
  paused: boolean;
  /** The camera frames the fight until the player takes it. */
  follow: boolean;
  selected: number;
  inspect: InspectDetail | null;
  names: string[];
}

const LIBRARY_KEY = 'nadir.v1.library';
const ORDER_KEY = 'nadir.v1.order';

function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function store(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Private windows and blocked storage: the session still works, it just will not persist.
  }
}

function defaultOrder(ex: ExerciseDef): Record<string, number> {
  return Object.fromEntries(ex.issued.map((o) => [o.design.id, o.count]));
}

class AppState {
  screen = $state<Screen>('briefing');
  exercise = $state<ExerciseDef>(EXERCISE_1);
  library = $state<Design[]>(load(LIBRARY_KEY, structuredClone([...STANDARD_PATTERNS])));
  order = $state<Record<string, number>>(load(ORDER_KEY, defaultOrder(EXERCISE_1)));
  editing = $state<string>(STANDARD_PATTERNS[0].id);
  report = $state<BattleReport | null>(null);
  lastHash = $state<string>('');
  battle = $state<BattleView>({
    active: false,
    seed: 1,
    tick: 0,
    onField: [0, 0],
    ended: false,
    winner: -1,
    speed: 2,
    paused: false,
    follow: true,
    selected: -1,
    inspect: null,
    names: [],
  });

  saveLibrary(): void {
    store(LIBRARY_KEY, this.library);
  }

  saveOrder(): void {
    store(ORDER_KEY, this.order);
  }

  design(id: string): Design | undefined {
    return this.library.find((d) => d.id === id);
  }

  resetToIssue(): void {
    this.library = structuredClone([...STANDARD_PATTERNS]);
    this.order = defaultOrder(this.exercise);
    this.editing = STANDARD_PATTERNS[0].id;
    this.saveLibrary();
    this.saveOrder();
  }
}

export const app = new AppState();
