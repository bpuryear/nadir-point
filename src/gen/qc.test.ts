import { describe, expect, it } from 'vitest';
import { createBuf, fillBuf, rgba, setPx } from './pixbuf.js';
import { CONCORD_RAMP, EMISSIVE, NEUTRAL } from './palette.js';
import {
  assertQc, checkBinaryAlpha, checkLightDirection, checkPalette,
  formatQcReport, LIGHT_MARGIN, MIN_LIGHT_SAMPLES, qcSprite,
} from './qc.js';

/**
 * A lit blob: a filled rectangle whose top-left border is the ramp's bright end
 * and whose bottom-right border is its dark end. This is what every generated
 * sprite is supposed to look like to the light checker.
 */
function litBlob(size = 10, inverted = false): ReturnType<typeof createBuf> {
  const b = createBuf(size, size);
  const lit = inverted ? NEUTRAL[1]! : NEUTRAL[6]!;
  const shadow = inverted ? NEUTRAL[6]! : NEUTRAL[1]!;
  for (let y = 1; y < size - 1; y++) {
    for (let x = 1; x < size - 1; x++) {
      const onTopLeft = x === 1 || y === 1;
      const onBottomRight = x === size - 2 || y === size - 2;
      setPx(b, x, y, onTopLeft ? lit : onBottomRight ? shadow : NEUTRAL[3]!);
    }
  }
  return b;
}

describe('palette check', () => {
  it('passes a sprite built from palette colours', () => {
    const b = createBuf(4, 4);
    fillBuf(b, NEUTRAL[2]!);
    expect(checkPalette(b)).toEqual([]);
  });

  it('passes a fully transparent sprite', () => {
    expect(checkPalette(createBuf(4, 4))).toEqual([]);
  });

  it('reports an off-palette pixel with its location and nearest match', () => {
    const b = createBuf(4, 4);
    setPx(b, 2, 1, rgba(200, 7, 99));
    const violations = checkPalette(b);
    expect(violations).toHaveLength(1);
    expect(violations[0]!.x).toBe(2);
    expect(violations[0]!.y).toBe(1);
    expect(violations[0]!.nearest).not.toBe(violations[0]!.color);
  });

  it('reports every offending pixel, not just the first', () => {
    const b = createBuf(4, 4);
    setPx(b, 0, 0, rgba(1, 2, 3));
    setPx(b, 3, 3, rgba(4, 5, 6));
    expect(checkPalette(b)).toHaveLength(2);
  });

  it('enforces a restricted allowed set — a faction lock', () => {
    const b = createBuf(2, 2);
    setPx(b, 0, 0, CONCORD_RAMP[3]!);
    expect(checkPalette(b, CONCORD_RAMP)).toEqual([]);
    // The same pixel is off-palette when the sprite claims to be Coalition.
    expect(checkPalette(b, [NEUTRAL[0]!, NEUTRAL[1]!])).toHaveLength(1);
  });
});

describe('binary alpha check', () => {
  it('accepts fully opaque and fully transparent pixels', () => {
    const b = createBuf(2, 2);
    setPx(b, 0, 0, NEUTRAL[3]!);
    expect(checkBinaryAlpha(b)).toEqual([]);
  });

  it('rejects partial alpha', () => {
    const b = createBuf(2, 2);
    b.data[3] = 128; // alpha of pixel (0,0)
    expect(checkBinaryAlpha(b)).toHaveLength(1);
  });
});

describe('light direction check', () => {
  it('passes a blob lit from the top-left', () => {
    const report = checkLightDirection(litBlob());
    expect(report).not.toBeNull();
    expect(report!.pass).toBe(true);
    expect(report!.litMean).toBeGreaterThan(report!.shadowMean);
    expect(report!.margin).toBeGreaterThanOrEqual(LIGHT_MARGIN);
  });

  it('fails a blob lit from the bottom-right', () => {
    const report = checkLightDirection(litBlob(10, true));
    expect(report!.pass).toBe(false);
  });

  it('fails a flat blob with no shading at all', () => {
    const b = createBuf(10, 10);
    for (let y = 1; y < 9; y++) for (let x = 1; x < 9; x++) setPx(b, x, y, NEUTRAL[3]!);
    expect(checkLightDirection(b)!.pass).toBe(false);
  });

  it('abstains rather than guessing when there is too little to measure', () => {
    const b = createBuf(4, 4);
    setPx(b, 1, 1, NEUTRAL[3]!);
    expect(checkLightDirection(b)).toBeNull();
  });

  it('abstains on a fully transparent buffer', () => {
    expect(checkLightDirection(createBuf(8, 8))).toBeNull();
  });

  it('ignores emissive pixels, which are self-lit', () => {
    // An engine glow sits along the stern — the bottom edge, in shadow. If the
    // check counted it, a correctly shaded hull would read as lit from the
    // wrong side. Placing the strip on the true shadow edge is what makes this
    // test exercise the exclusion rather than merely coexist with it.
    const plain = checkLightDirection(litBlob(12))!;

    const glowing = litBlob(12);
    for (let x = 2; x <= 8; x++) setPx(glowing, x, 10, EMISSIVE.amber);
    const report = checkLightDirection(glowing)!;

    // The emissive pixels sat on edge rows, so excluding them must reduce the
    // sample count. If this fails, the strip is landing on interior pixels
    // again and the test has gone hollow.
    expect(report.samples).toBeLessThan(plain.samples);
    expect(report.pass).toBe(true);
  });

  it('counts enough samples to be meaningful', () => {
    const report = checkLightDirection(litBlob(16));
    expect(report!.samples).toBeGreaterThanOrEqual(MIN_LIGHT_SAMPLES);
  });

  it('abstains when there is too little of the sprite to measure at all', () => {
    // Ten edge samples against a floor of twelve: this is the total-sample
    // abstention, not the per-side one.
    const b = createBuf(14, 14);
    for (let y = 1; y < 5; y++) {
      for (let x = 1; x < 5; x++) {
        const onTopLeft = x === 1 || y === 1;
        setPx(b, x, y, onTopLeft ? NEUTRAL[6]! : NEUTRAL[3]!);
      }
    }
    expect(checkLightDirection(b)).toBeNull();
  });

  it('abstains when one side is starved, even with plenty of samples overall', () => {
    // A hull whose shadowed flank is almost entirely covered by running lights.
    // Emissives are excluded from sampling, so the shadow side starves while the
    // lit side stays healthy — and the total stays well above MIN_LIGHT_SAMPLES.
    // That is what makes this test isolate the per-side floor: if it abstains,
    // the total floor cannot be the reason.
    const build = (bare: number) => {
      const b = createBuf(14, 14);
      for (let y = 1; y <= 11; y++) {
        for (let x = 1; x <= 11; x++) {
          setPx(b, x, y, x === 1 || y === 1 ? NEUTRAL[6]! : NEUTRAL[3]!);
        }
      }
      const edge: [number, number][] = [];
      for (let y = 1; y <= 11; y++) {
        for (let x = 1; x <= 11; x++) {
          if (x === 11 || y === 11) edge.push([x, y]);
        }
      }
      for (let i = 0; i < edge.length - bare; i++) {
        setPx(b, edge[i]![0], edge[i]![1], EMISSIVE.amber);
      }
      return b;
    };

    // 21 samples, but only 2 face the shadow side. Not a measurement.
    expect(checkLightDirection(build(2))).toBeNull();

    // Four bare pixels meets MIN_SIDE_SAMPLES exactly and judging resumes.
    // Without this second assertion the first one proves nothing about which
    // floor fired.
    expect(checkLightDirection(build(4))).not.toBeNull();
  });
});

describe('qcSprite', () => {
  it('passes a well-formed sprite', () => {
    const report = qcSprite('blob', litBlob());
    expect(report.pass).toBe(true);
    expect(report.palette).toEqual([]);
    expect(report.alpha).toEqual([]);
  });

  it('fails when a pixel is off-palette', () => {
    const b = litBlob();
    setPx(b, 5, 5, rgba(3, 3, 3));
    expect(qcSprite('blob', b).pass).toBe(false);
  });

  it('fails when the light runs the wrong way', () => {
    expect(qcSprite('blob', litBlob(10, true)).pass).toBe(false);
  });

  it('passes when the light check abstains — silence is not failure', () => {
    const b = createBuf(4, 4);
    setPx(b, 1, 1, NEUTRAL[3]!);
    const report = qcSprite('tiny', b);
    expect(report.light).toBeNull();
    expect(report.pass).toBe(true);
  });

  it('names the sprite in its report', () => {
    const b = litBlob();
    setPx(b, 5, 5, rgba(3, 3, 3));
    expect(formatQcReport(qcSprite('cruiser-bow', b))).toContain('cruiser-bow');
  });

  it('reports the offending coordinates so the defect is findable', () => {
    const b = litBlob();
    setPx(b, 5, 6, rgba(3, 3, 3));
    expect(formatQcReport(qcSprite('x', b))).toContain('5,6');
  });

  it('assertQc throws on failure and stays quiet on success', () => {
    const bad = litBlob();
    setPx(bad, 5, 5, rgba(3, 3, 3));
    expect(() => assertQc(qcSprite('bad', bad))).toThrow(/bad/);
    expect(() => assertQc(qcSprite('good', litBlob()))).not.toThrow();
  });

  it('fails a fully transparent sprite — passing every other check vacuously is not a pass', () => {
    // Every other check is happy with nothing drawn: no pixels to be
    // off-palette, none to have partial alpha, and the light check abstains
    // for lack of edges. Without an explicit emptiness gate this reports PASS,
    // which is how a generator that silently draws nothing slips through.
    const report = qcSprite('blank', createBuf(8, 8));
    expect(report.empty).toBe(true);
    expect(report.palette).toEqual([]);
    expect(report.alpha).toEqual([]);
    expect(report.light).toBeNull();
    expect(report.pass).toBe(false);
  });

  it('passes a sprite with a single opaque palette pixel', () => {
    const b = createBuf(4, 4);
    setPx(b, 1, 1, NEUTRAL[3]!);
    const report = qcSprite('speck', b);
    expect(report.empty).toBe(false);
    expect(report.pass).toBe(true);
  });
});
