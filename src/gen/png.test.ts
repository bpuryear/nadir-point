import { inflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { createBuf, fillBuf, rgba, setPx } from './pixbuf.js';
import { encodePng, PNG_SIGNATURE } from './png.js';

/** Reads the chunk type strings in order, so structure can be asserted without a decoder. */
function chunkTypes(png: Uint8Array): string[] {
  const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
  const types: string[] = [];
  let p = 8; // skip signature
  while (p < png.length) {
    const len = view.getUint32(p);
    types.push(String.fromCharCode(png[p + 4]!, png[p + 5]!, png[p + 6]!, png[p + 7]!));
    p += 12 + len; // length + type + data + crc
  }
  return types;
}

function idatPayload(png: Uint8Array): Uint8Array {
  const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
  const parts: Uint8Array[] = [];
  let p = 8;
  while (p < png.length) {
    const len = view.getUint32(p);
    const type = String.fromCharCode(png[p + 4]!, png[p + 5]!, png[p + 6]!, png[p + 7]!);
    if (type === 'IDAT') parts.push(png.slice(p + 8, p + 8 + len));
    p += 12 + len;
  }
  const total = parts.reduce((n, x) => n + x.length, 0);
  const joined = new Uint8Array(total);
  let o = 0;
  for (const part of parts) { joined.set(part, o); o += part.length; }
  return joined;
}

describe('png structure', () => {
  it('starts with the PNG signature', () => {
    const png = encodePng(createBuf(2, 2));
    expect(Array.from(png.slice(0, 8))).toEqual([...PNG_SIGNATURE]);
  });

  it('emits IHDR, IDAT and IEND in that order', () => {
    expect(chunkTypes(encodePng(createBuf(4, 4)))).toEqual(['IHDR', 'IDAT', 'IEND']);
  });

  it('records the dimensions in IHDR', () => {
    const png = encodePng(createBuf(7, 13));
    const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
    expect(view.getUint32(16)).toBe(7);  // IHDR data starts at byte 16
    expect(view.getUint32(20)).toBe(13);
    expect(png[24]).toBe(8); // bit depth
    expect(png[25]).toBe(6); // colour type: RGBA
  });

  it('ends with a zero-length IEND', () => {
    const png = encodePng(createBuf(2, 2));
    const tail = Array.from(png.slice(-12, -4));
    expect(tail.slice(0, 4)).toEqual([0, 0, 0, 0]); // length
    expect(String.fromCharCode(...tail.slice(4))).toBe('IEND');
  });
});

describe('png pixel fidelity', () => {
  it('round-trips pixel data through the IDAT stream', () => {
    const b = createBuf(2, 1);
    setPx(b, 0, 0, rgba(10, 20, 30, 255));
    setPx(b, 1, 0, rgba(40, 50, 60, 0));

    const raw = inflateSync(Buffer.from(idatPayload(encodePng(b))));
    // One scanline: a filter byte followed by 2 RGBA pixels.
    expect(Array.from(raw)).toEqual([0, 10, 20, 30, 255, 40, 50, 60, 0]);
  });

  it('writes one filter byte per scanline', () => {
    const b = createBuf(3, 4);
    const raw = inflateSync(Buffer.from(idatPayload(encodePng(b))));
    expect(raw.length).toBe(4 * (1 + 3 * 4));
    for (let y = 0; y < 4; y++) {
      expect(raw[y * (1 + 3 * 4)]).toBe(0); // filter type 0, "None"
    }
  });

  it('preserves a filled buffer exactly', () => {
    const b = createBuf(8, 8);
    fillBuf(b, rgba(1, 2, 3, 255));
    const raw = inflateSync(Buffer.from(idatPayload(encodePng(b))));
    expect(raw[1]).toBe(1);
    expect(raw[2]).toBe(2);
    expect(raw[3]).toBe(3);
    expect(raw[4]).toBe(255);
  });

  it('is deterministic — the same buffer encodes to identical bytes', () => {
    const b = createBuf(16, 16);
    fillBuf(b, rgba(9, 9, 9, 255));
    expect(Array.from(encodePng(b))).toEqual(Array.from(encodePng(b)));
  });
});
