/**
 * Rectangle packing for the rotation-bin atlas.
 *
 * A fitted cruiser bakes into 64 bins. Uploading those as 64 textures and
 * binding a different one every frame would spend the draw-call budget on a
 * single ship, so they share one atlas and the renderer changes UVs instead.
 *
 * The bins are all the same size, so a uniform grid is the whole algorithm —
 * no bin-packing heuristics needed. This lives apart from any GPU call because
 * it is arithmetic, and arithmetic is the part a unit test can reach.
 */

import type { PixBuf } from '../gen/pixbuf.js';

/** Conservative ceiling that every WebGL2 and WebGPU target supports. */
export const MAX_ATLAS_DIMENSION = 4096;

export interface PackedRect {
  index: number;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface AtlasLayout {
  width: number;
  height: number;
  rects: readonly PackedRect[];
}

export function packUniform(
  count: number,
  cellW: number,
  cellH: number,
  maxWidth: number = MAX_ATLAS_DIMENSION,
): AtlasLayout {
  if (count <= 0) throw new RangeError(`atlas needs at least one cell, got ${count}`);
  if (cellW <= 0 || cellH <= 0) {
    throw new RangeError(`cell size must be positive, got ${cellW}x${cellH}`);
  }

  const columns = Math.max(1, Math.floor(maxWidth / cellW));
  const rows = Math.ceil(count / columns);

  const width = Math.min(maxWidth, columns * cellW);
  const height = rows * cellH;

  if (cellW > maxWidth || height > MAX_ATLAS_DIMENSION) {
    throw new RangeError(
      `${count} cells of ${cellW}x${cellH} need ${width}x${height}, ` +
      `over the ${MAX_ATLAS_DIMENSION} limit`,
    );
  }

  const rects: PackedRect[] = [];
  for (let i = 0; i < count; i++) {
    rects.push({
      index: i,
      x: (i % columns) * cellW,
      y: Math.floor(i / columns) * cellH,
      w: cellW,
      h: cellH,
    });
  }

  return { width, height, rects };
}

/**
 * Lays out a baked rotation set.
 *
 * `bakeRotations` returns equally-sized bins, but the cell is sized to the
 * largest anyway — an unequal set then wastes space instead of writing one bin
 * over its neighbour.
 */
export function layoutForBins(bins: readonly PixBuf[]): AtlasLayout {
  if (bins.length === 0) throw new RangeError('cannot lay out an empty bin list');

  let cellW = 0;
  let cellH = 0;
  for (const b of bins) {
    if (b.w > cellW) cellW = b.w;
    if (b.h > cellH) cellH = b.h;
  }

  return packUniform(bins.length, cellW, cellH);
}
