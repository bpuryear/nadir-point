export const TICK_HZ = 30;
export const DT = 1 / TICK_HZ;
export const TICK_MS = 1000 / TICK_HZ;

/** Bump when a change alters sim results. Replays and fleet files carry it. */
export const SIM_VERSION = 3;
