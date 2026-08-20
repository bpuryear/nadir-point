import { describe, expect, it } from 'vitest';
import { countOpaque } from '../src/gen/pixbuf.js';
import { encodePng, PNG_SIGNATURE } from '../src/gen/png.js';
import { buildContactSheet } from './contactsheet.js';

describe('contact sheet', () => {
  it('renders a large page', () => {
    const { buf } = buildContactSheet('milestone-0');
    expect(buf.w).toBeGreaterThan(600);
    expect(buf.h).toBeGreaterThan(600);
  });

  it('draws a substantial amount of content', () => {
    const { buf } = buildContactSheet('milestone-0');
    expect(countOpaque(buf)).toBeGreaterThan(50_000);
  });

  it('covers every sprite family the milestone calls for', () => {
    const { spriteCount } = buildContactSheet('milestone-0');
    // Hull LODs, six installed modules, faction classes, damage frames,
    // rotation bins, debris, and POI layers.
    expect(spriteCount).toBeGreaterThan(60);
  });

  it('QCs every sprite it draws', () => {
    const { reports, spriteCount } = buildContactSheet('milestone-0');
    expect(reports.length).toBe(spriteCount);
  });

  it('passes QC on every sprite', () => {
    const { failures } = buildContactSheet('milestone-0');
    const detail = failures.map((f) => f.name).join(', ');
    expect(failures.length, detail).toBe(0);
  });

  it('encodes to a valid PNG', () => {
    const png = encodePng(buildContactSheet('milestone-0').buf);
    expect(Array.from(png.slice(0, 8))).toEqual([...PNG_SIGNATURE]);
    expect(png.length).toBeGreaterThan(1000);
  });

  it('is deterministic from its seed', () => {
    const a = buildContactSheet('fixed');
    const b = buildContactSheet('fixed');
    expect(Array.from(a.buf.data)).toEqual(Array.from(b.buf.data));
  });

  it('changes with the seed', () => {
    const a = buildContactSheet('seed-a');
    const b = buildContactSheet('seed-b');
    expect(Array.from(a.buf.data)).not.toEqual(Array.from(b.buf.data));
  });
});
