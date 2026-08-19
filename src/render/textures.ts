/**
 * The boundary where a generated buffer becomes something a GPU can sample.
 *
 * `PixBuf` is deliberately ignorant of rendering — it is a flat RGBA array the
 * generator can build headlessly in Node, which is what lets the contact sheet
 * exist without a browser. This file is the only place that changes, so the
 * generator never grows a dependency on a renderer.
 *
 * Every texture is nearest-neighbour. Linear filtering on a 47x128 hull is the
 * single fastest way to undo the entire pixel-integrity chain.
 */

import { Texture, BufferImageSource, Rectangle } from 'pixi.js';
import type { PixBuf } from '../gen/pixbuf.js';
import { layoutForBins, type AtlasLayout } from './atlaspack.js';

// `BufferImageSource`, not the base `TextureSource`: constructing the base
// class directly with a raw typed-array `resource` leaves `uploadMethodId`
// at its default `'unknown'`, which both the WebGL and WebGPU upload systems
// silently skip — the GPU texture is allocated but never written, so the
// sprite exists, is `visible`/`renderable`, and draws nothing. Verified in
// the browser: with the base class the canvas stayed pure background colour;
// switching to `BufferImageSource` (which sets `uploadMethodId = 'buffer'`)
// made the ship appear. `format: 'rgba8unorm'` overrides its default guess of
// `'bgra8unorm'` for a `Uint8Array`, which would otherwise swap the red and
// blue channels — `PixBuf.data` is byte order R,G,B,A (see gen/pixbuf.ts).
export function textureFromPixBuf(buf: PixBuf): Texture {
  const source = new BufferImageSource({
    resource: new Uint8Array(buf.data.buffer.slice(0)),
    width: buf.w,
    height: buf.h,
    format: 'rgba8unorm',
    scaleMode: 'nearest',
    alphaMode: 'premultiply-alpha-on-upload',
  });
  return new Texture({ source });
}

export interface BinAtlas {
  texture: Texture;
  /** One sub-texture per rotation bin, indexed by bin number. */
  frames: readonly Texture[];
  layout: AtlasLayout;
}

/**
 * Packs a baked rotation set into a single texture.
 *
 * 64 separate textures per ship would spend the whole draw-call budget on one
 * hull; sharing an atlas means the renderer swaps UVs instead of rebinding.
 */
export function atlasFromBins(bins: readonly PixBuf[]): BinAtlas {
  const layout = layoutForBins(bins);

  const packed = new Uint8Array(layout.width * layout.height * 4);
  for (const rect of layout.rects) {
    const bin = bins[rect.index]!;
    for (let y = 0; y < bin.h; y++) {
      const src = y * bin.w * 4;
      const dst = ((rect.y + y) * layout.width + rect.x) * 4;
      packed.set(bin.data.subarray(src, src + bin.w * 4), dst);
    }
  }

  // Same BufferImageSource + explicit format fix as textureFromPixBuf above.
  const source = new BufferImageSource({
    resource: packed,
    width: layout.width,
    height: layout.height,
    format: 'rgba8unorm',
    scaleMode: 'nearest',
    alphaMode: 'premultiply-alpha-on-upload',
  });

  const sheet = new Texture({ source });
  const frames = layout.rects.map(
    (r) => new Texture({ source, frame: new Rectangle(r.x, r.y, r.w, r.h) }),
  );

  return { texture: sheet, frames, layout };
}

export function destroyAtlas(atlas: BinAtlas): void {
  for (const frame of atlas.frames) frame.destroy(false);
  atlas.texture.destroy(true);
}
