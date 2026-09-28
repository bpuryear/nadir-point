// Uniform grid rebuilt every tick with a counting sort. Cell order and in-cell
// order both follow unit index, so queries visit units in a fixed order.

export interface Grid {
  cellSize: number;
  cols: number;
  rows: number;
  /** cellStart[c]..cellStart[c + 1] indexes into `items`. Length cols * rows + 1. */
  cellStart: Int32Array;
  cursor: Int32Array;
  items: Int32Array;
  cellOf: Int32Array;
}

export function createGrid(width: number, height: number, cellSize: number, capacity: number): Grid {
  const cols = Math.ceil(width / cellSize);
  const rows = Math.ceil(height / cellSize);
  return {
    cellSize,
    cols,
    rows,
    cellStart: new Int32Array(cols * rows + 1),
    cursor: new Int32Array(cols * rows),
    items: new Int32Array(capacity),
    cellOf: new Int32Array(capacity),
  };
}

export function cellX(g: Grid, x: number): number {
  const c = Math.floor(x / g.cellSize);
  return c < 0 ? 0 : c >= g.cols ? g.cols - 1 : c;
}

export function cellY(g: Grid, y: number): number {
  const c = Math.floor(y / g.cellSize);
  return c < 0 ? 0 : c >= g.rows ? g.rows - 1 : c;
}

export function rebuildGrid(g: Grid, count: number, alive: Uint8Array, x: Float64Array, y: Float64Array): void {
  const cells = g.cols * g.rows;
  const start = g.cellStart;
  start.fill(0);
  for (let i = 0; i < count; i++) {
    if (!alive[i]) {
      g.cellOf[i] = -1;
      continue;
    }
    const c = cellY(g, y[i]) * g.cols + cellX(g, x[i]);
    g.cellOf[i] = c;
    start[c + 1]++;
  }
  for (let c = 0; c < cells; c++) start[c + 1] += start[c];
  g.cursor.set(start.subarray(0, cells));
  for (let i = 0; i < count; i++) {
    const c = g.cellOf[i];
    if (c >= 0) g.items[g.cursor[c]++] = i;
  }
}
