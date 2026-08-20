/**
 * A minimal PNG encoder: 8-bit RGBA, no interlacing, filter type 0.
 *
 * Hand-rolled over node:zlib rather than taken as a dependency. The whole
 * encoder is shorter than the install it replaces, it keeps `gen/` free of
 * runtime dependencies, and it is deterministic — the same buffer always
 * encodes to the same bytes, which the contact sheet's reproducibility relies
 * on.
 */

import { deflateSync } from 'node:zlib';
import { alphaOf, blueOf, getPx, greenOf, redOf, type PixBuf } from './pixbuf.js';

export const PNG_SIGNATURE: readonly number[] = [137, 80, 78, 71, 13, 10, 26, 10];

const CRC_TABLE: Uint32Array = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    c = CRC_TABLE[(c ^ bytes[i]!) & 255]! ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  const view = new DataView(out.buffer);

  view.setUint32(0, data.length);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);

  // The CRC covers the type and the data, but not the length field.
  view.setUint32(8 + data.length, crc32(out.slice(4, 8 + data.length)));
  return out;
}

function ihdr(w: number, h: number): Uint8Array {
  const data = new Uint8Array(13);
  const view = new DataView(data.buffer);
  view.setUint32(0, w);
  view.setUint32(4, h);
  data[8] = 8;  // bit depth
  data[9] = 6;  // colour type 6 = truecolour with alpha
  data[10] = 0; // compression: deflate
  data[11] = 0; // filter method: adaptive
  data[12] = 0; // interlace: none
  return data;
}

/**
 * Raw scanlines, each prefixed with filter byte 0 ("None").
 *
 * Per-scanline filters would compress better, but sprite sheets of flat palette
 * colour already deflate well and an unfiltered stream is trivially verifiable
 * in tests — which is worth more here than a smaller file.
 */
function scanlines(buf: PixBuf): Uint8Array {
  const stride = buf.w * 4;
  const out = new Uint8Array(buf.h * (stride + 1));
  let o = 0;
  for (let y = 0; y < buf.h; y++) {
    out[o++] = 0;
    for (let x = 0; x < buf.w; x++) {
      const c = getPx(buf, x, y);
      out[o++] = redOf(c);
      out[o++] = greenOf(c);
      out[o++] = blueOf(c);
      out[o++] = alphaOf(c);
    }
  }
  return out;
}

export function encodePng(buf: PixBuf): Uint8Array {
  const idat = new Uint8Array(deflateSync(Buffer.from(scanlines(buf)), { level: 9 }));

  const parts = [
    Uint8Array.from(PNG_SIGNATURE),
    chunk('IHDR', ihdr(buf.w, buf.h)),
    chunk('IDAT', idat),
    chunk('IEND', new Uint8Array(0)),
  ];

  const total = parts.reduce((n, p) => n + p.length, 0);
  const png = new Uint8Array(total);
  let o = 0;
  for (const part of parts) {
    png.set(part, o);
    o += part.length;
  }
  return png;
}
