/**
 * Automated sprite quality control. Turns three acceptance criteria into build
 * failures rather than things somebody is supposed to notice.
 *
 * The light-direction check deserves an explanation, because it is the one that
 * looks like magic. Every sprite bakes a single global light from the top-left.
 * That means edge pixels facing up-and-left should be drawn from the bright end
 * of their ramp, and edge pixels facing down-and-right from the dark end. So:
 * classify each opaque edge pixel by which way its exposed side faces, take the
 * mean luminance of each group, and require the lit group to win by a margin.
 *
 * Emissive pixels are excluded. They are self-lit by definition, and an engine
 * glow sits along the stern — the bottom edge — where counting it would invert
 * the verdict on a correctly shaded hull.
 */

import {
  alphaOf, getPx, isOpaque, luminance, type PixBuf, type Rgba,
} from './pixbuf.js';
import { isEmissive, isInPalette, snapToPalette } from './palette.js';

export interface PaletteViolation {
  x: number;
  y: number;
  color: Rgba;
  nearest: Rgba;
}

export interface LightReport {
  litMean: number;
  shadowMean: number;
  margin: number;
  samples: number;
  pass: boolean;
}

export interface QcReport {
  name: string;
  palette: PaletteViolation[];
  alpha: PaletteViolation[];
  light: LightReport | null;
  pass: boolean;
}

/** Required luminance gap between the lit and shadowed edges. */
export const LIGHT_MARGIN = 8;

/** Below this many edge samples the check abstains instead of guessing. */
export const MIN_LIGHT_SAMPLES = 12;

/**
 * Each side needs its own floor, not just the combined total. A verdict resting
 * on one shadow pixel is not a measurement — an almost-unshaded hull with a
 * single incidentally dark pixel would otherwise read as correctly lit.
 */
export const MIN_SIDE_SAMPLES = 4;

export function checkPalette(buf: PixBuf, allowed?: readonly Rgba[]): PaletteViolation[] {
  const violations: PaletteViolation[] = [];
  const allowedSet = allowed ? new Set(allowed) : null;

  for (let y = 0; y < buf.h; y++) {
    for (let x = 0; x < buf.w; x++) {
      const c = getPx(buf, x, y);
      if (!isOpaque(c)) continue;

      const ok = allowedSet ? allowedSet.has(c) : isInPalette(c);
      if (!ok) {
        violations.push({
          x, y, color: c,
          nearest: snapToPalette(c, allowed),
        });
      }
    }
  }
  return violations;
}

export function checkBinaryAlpha(buf: PixBuf): PaletteViolation[] {
  const violations: PaletteViolation[] = [];
  for (let y = 0; y < buf.h; y++) {
    for (let x = 0; x < buf.w; x++) {
      const c = getPx(buf, x, y);
      const a = alphaOf(c);
      if (a !== 0 && a !== 255) {
        violations.push({ x, y, color: c, nearest: c });
      }
    }
  }
  return violations;
}

export function checkLightDirection(buf: PixBuf): LightReport | null {
  let litSum = 0, litCount = 0;
  let shadowSum = 0, shadowCount = 0;

  for (let y = 0; y < buf.h; y++) {
    for (let x = 0; x < buf.w; x++) {
      const c = getPx(buf, x, y);
      if (!isOpaque(c) || isEmissive(c)) continue;

      // Which way does this pixel's exposed side face?
      const openUpLeft =
        !isOpaque(getPx(buf, x, y - 1)) ||
        !isOpaque(getPx(buf, x - 1, y)) ||
        !isOpaque(getPx(buf, x - 1, y - 1));
      const openDownRight =
        !isOpaque(getPx(buf, x, y + 1)) ||
        !isOpaque(getPx(buf, x + 1, y)) ||
        !isOpaque(getPx(buf, x + 1, y + 1));

      // A pixel open on both sides is a thin strut with no meaningful facing.
      if (openUpLeft === openDownRight) continue;

      if (openUpLeft) {
        litSum += luminance(c);
        litCount++;
      } else {
        shadowSum += luminance(c);
        shadowCount++;
      }
    }
  }

  const samples = litCount + shadowCount;
  if (
    litCount < MIN_SIDE_SAMPLES ||
    shadowCount < MIN_SIDE_SAMPLES ||
    samples < MIN_LIGHT_SAMPLES
  ) {
    return null;
  }

  const litMean = litSum / litCount;
  const shadowMean = shadowSum / shadowCount;
  const margin = litMean - shadowMean;

  return { litMean, shadowMean, margin, samples, pass: margin >= LIGHT_MARGIN };
}

export function qcSprite(name: string, buf: PixBuf, allowed?: readonly Rgba[]): QcReport {
  const palette = checkPalette(buf, allowed);
  const alpha = checkBinaryAlpha(buf);
  const light = checkLightDirection(buf);

  return {
    name,
    palette,
    alpha,
    light,
    // An abstaining light check is not a failure — a 3px sprite has nothing to
    // measure, and demanding a verdict there would only produce noise.
    pass: palette.length === 0 && alpha.length === 0 && (light === null || light.pass),
  };
}

function hex(c: Rgba): string {
  return `#${((c >>> 8) & 0xffffff).toString(16).padStart(6, '0')}`;
}

export function formatQcReport(report: QcReport): string {
  if (report.pass) return `${report.name}: PASS`;

  const lines: string[] = [`${report.name}: FAIL`];

  if (report.palette.length > 0) {
    lines.push(`  off-palette pixels: ${report.palette.length}`);
    for (const v of report.palette.slice(0, 8)) {
      lines.push(`    at ${v.x},${v.y}: ${hex(v.color)} (nearest ${hex(v.nearest)})`);
    }
    if (report.palette.length > 8) {
      lines.push(`    ...and ${report.palette.length - 8} more`);
    }
  }

  if (report.alpha.length > 0) {
    lines.push(`  partial-alpha pixels: ${report.alpha.length}`);
    for (const v of report.alpha.slice(0, 8)) {
      lines.push(`    at ${v.x},${v.y}: alpha ${v.color & 255}`);
    }
  }

  if (report.light !== null && !report.light.pass) {
    lines.push(
      `  light direction: lit edges ${report.light.litMean.toFixed(1)} vs ` +
      `shadowed ${report.light.shadowMean.toFixed(1)} ` +
      `(margin ${report.light.margin.toFixed(1)}, need ${LIGHT_MARGIN}) ` +
      `over ${report.light.samples} samples`,
    );
  }

  return lines.join('\n');
}

export function assertQc(report: QcReport): void {
  if (!report.pass) {
    throw new Error(formatQcReport(report));
  }
}
