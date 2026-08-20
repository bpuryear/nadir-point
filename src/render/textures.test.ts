/**
 * Tests the atlas row copy.
 *
 * This is pure arithmetic over a flat byte array — no GPU is involved in
 * `atlasFromBins`'s packing loop, only in what happens to the array afterwards,
 * so it is fully reachable from Node. It needs to be. The renderer now packs
 * four atlases of 64 bins each, and 63 of every 64 rects sit at a non-zero
 * offset, but only bin 0 was ever rendered during browser verification: a
 * row-stride error would shear every rotated frame and nothing downstream
 * would notice. The pixels are read straight back out of the buffer the
 * texture source was handed.
 */

import { describe, expect, it } from 'vitest';
import { createBuf, getPx, setPx, type PixBuf } from '../gen/pixbuf.js';
import { layoutForBins } from './atlaspack.js';
import { atlasFromBins, textureFromPixBuf } from './textures.js';

/** The bytes `atlasFromBins` handed to the texture source. */
function packedBytes(atlas: ReturnType<typeof atlasFromBins>): Uint8Array {
  return (atlas.texture.source as unknown as { resource: Uint8Array }).resource;
}

function pixelAt(bytes: Uint8Array, width: number, x: number, y: number): number[] {
  const i = (y * width + x) * 4;
  return [bytes[i]!, bytes[i + 1]!, bytes[i + 2]!, bytes[i + 3]!];
}

/**
 * A bin whose every pixel is unique both within the bin and across bins, so a
 * copy that lands one row or one column out cannot accidentally match.
 */
function patternedBin(index: number, w: number, h: number): PixBuf {
  const buf = createBuf(w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const r = (index * 7 + 1) & 0xff;
      const g = (x * 13 + 1) & 0xff;
      const b = (y * 29 + 1) & 0xff;
      setPx(buf, x, y, ((r << 24) | (g << 16) | (b << 8) | 0xff) >>> 0);
    }
  }
  return buf;
}

function expectEveryBinCopiedExactly(bins: readonly PixBuf[]): void {
  const layout = layoutForBins(bins);
  const atlas = atlasFromBins(bins);
  const bytes = packedBytes(atlas);

  expect(bytes.length).toBe(layout.width * layout.height * 4);

  for (const rect of layout.rects) {
    const bin = bins[rect.index]!;
    for (let y = 0; y < bin.h; y++) {
      for (let x = 0; x < bin.w; x++) {
        const c = getPx(bin, x, y);
        expect(pixelAt(bytes, layout.width, rect.x + x, rect.y + y)).toEqual([
          (c >>> 24) & 0xff, (c >>> 16) & 0xff, (c >>> 8) & 0xff, c & 0xff,
        ]);
      }
    }
  }
}

describe('atlasFromBins', () => {
  it('copies a single bin at the origin', () => {
    expectEveryBinCopiedExactly([patternedBin(0, 5, 3)]);
  });

  it('copies every bin to its own rect, at the real bin count', () => {
    // 64 bins, the number bakeRotations actually produces.
    expectEveryBinCopiedExactly(
      Array.from({ length: 64 }, (_, i) => patternedBin(i, 24, 24)),
    );
  });

  it('uses the bin width as the source stride and the atlas width as the destination', () => {
    // The failure this test exists for. A bin that is not square, and not the
    // same width as the atlas, makes every plausible stride mix-up produce a
    // different — and visibly sheared — result.
    expectEveryBinCopiedExactly(
      Array.from({ length: 7 }, (_, i) => patternedBin(i, 11, 29)),
    );
  });

  it('handles a bin count that does not fill its last grid row', () => {
    expectEveryBinCopiedExactly(
      Array.from({ length: 5 }, (_, i) => patternedBin(i, 100, 40)),
    );
  });

  it('leaves the padding between and after the rects untouched', () => {
    // 3 bins of 1000x40 pack 4 to a 4096 row, so the fourth cell is empty.
    const bins = Array.from({ length: 3 }, (_, i) => patternedBin(i, 1000, 40));
    const layout = layoutForBins(bins);
    const bytes = packedBytes(atlasFromBins(bins));

    const covered = (x: number, y: number): boolean =>
      layout.rects.some((r) => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h);

    let checked = 0;
    for (let y = 0; y < layout.height; y++) {
      for (let x = 0; x < layout.width; x += 7) {
        if (covered(x, y)) continue;
        expect(pixelAt(bytes, layout.width, x, y)).toEqual([0, 0, 0, 0]);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(0);
  });

  it('gives every bin a frame whose rectangle is its packed rect', () => {
    const bins = Array.from({ length: 9 }, (_, i) => patternedBin(i, 13, 17));
    const atlas = atlasFromBins(bins);
    expect(atlas.frames.length).toBe(bins.length);
    atlas.layout.rects.forEach((rect, i) => {
      const frame = atlas.frames[i]!.frame;
      expect([frame.x, frame.y, frame.width, frame.height]).toEqual([rect.x, rect.y, rect.w, rect.h]);
    });
  });

  it('shares one source across every frame, so a bin change is a UV change', () => {
    const bins = Array.from({ length: 4 }, (_, i) => patternedBin(i, 8, 8));
    const atlas = atlasFromBins(bins);
    for (const frame of atlas.frames) expect(frame.source).toBe(atlas.texture.source);
  });
});

describe('textureFromPixBuf', () => {
  it('uploads the buffer at its own size', () => {
    const buf = patternedBin(3, 17, 5);
    const texture = textureFromPixBuf(buf);
    expect([texture.source.width, texture.source.height]).toEqual([17, 5]);
  });

  it('copies rather than aliases, so later edits to the PixBuf do not mutate the GPU copy', () => {
    const buf = createBuf(2, 2);
    setPx(buf, 0, 0, 0x11223344);
    const texture = textureFromPixBuf(buf);
    const bytes = (texture.source as unknown as { resource: Uint8Array }).resource;
    setPx(buf, 0, 0, 0xaabbccdd);
    expect([bytes[0], bytes[1], bytes[2], bytes[3]]).toEqual([0x11, 0x22, 0x33, 0x44]);
  });
});
