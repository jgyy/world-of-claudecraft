import { describe, expect, it } from 'vitest';
import { type FctEntry, placeFctY } from '../src/ui/fct_layout';

const OPTS = { rowHeight: 22, columnWidth: 44, lifeMs: 1250, maxRows: 6 };

describe('placeFctY', () => {
  it('places the first text at its anchor', () => {
    expect(placeFctY([], 100, 200, 0, OPTS)).toBe(200);
  });

  it('stacks a second text in the same column one row up', () => {
    const existing: FctEntry[] = [{ x: 100, y: 200, bornMs: 0 }];
    expect(placeFctY(existing, 100, 200, 0, OPTS)).toBe(200 - 22);
  });

  it('stacks three same-column texts on consecutive rows', () => {
    const existing: FctEntry[] = [];
    const a = placeFctY(existing, 100, 200, 0, OPTS);
    existing.push({ x: 100, y: a, bornMs: 0 });
    const b = placeFctY(existing, 100, 200, 0, OPTS);
    existing.push({ x: 100, y: b, bornMs: 0 });
    const c = placeFctY(existing, 100, 200, 0, OPTS);
    expect([a, b, c]).toEqual([200, 178, 156]);
  });

  it('does not bump a text in a different column', () => {
    const existing: FctEntry[] = [{ x: 100, y: 200, bornMs: 0 }];
    // 100px away horizontally is well beyond columnWidth (44) -> no collision.
    expect(placeFctY(existing, 200, 200, 0, OPTS)).toBe(200);
  });

  it('ignores expired texts when stacking', () => {
    const existing: FctEntry[] = [{ x: 100, y: 200, bornMs: 0 }];
    // The old text has aged past lifeMs, so the column is effectively empty.
    expect(placeFctY(existing, 100, 200, 2000, OPTS)).toBe(200);
  });

  it('reuses the lowest free row, not the next one up', () => {
    // Row 0 (y=200) is free but row 1 (y=178) is taken -> new text takes row 0.
    const existing: FctEntry[] = [{ x: 100, y: 178, bornMs: 0 }];
    expect(placeFctY(existing, 100, 200, 0, OPTS)).toBe(200);
  });

  it('falls back to the anchor row once every row is full', () => {
    const existing: FctEntry[] = [];
    for (let r = 0; r < 6; r++) existing.push({ x: 100, y: 200 - r * 22, bornMs: 0 });
    expect(placeFctY(existing, 100, 200, 0, OPTS)).toBe(200);
  });

  it('is deterministic: same inputs give the same output', () => {
    const existing: FctEntry[] = [{ x: 100, y: 200, bornMs: 0 }];
    expect(placeFctY(existing, 100, 200, 0, OPTS)).toBe(placeFctY(existing, 100, 200, 0, OPTS));
  });
});
