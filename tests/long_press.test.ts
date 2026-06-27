import { describe, expect, it } from 'vitest';
import {
  LONG_PRESS_SLOP_PX,
  LongPressClickGuard,
  movedBeyondSlop,
} from '../src/ui/long_press';

describe('movedBeyondSlop', () => {
  const start = { x: 100, y: 100 };

  it('treats a stationary press as a hold (no movement)', () => {
    expect(movedBeyondSlop(start, { x: 100, y: 100 })).toBe(false);
  });

  it('keeps small jitter within the slop radius', () => {
    expect(movedBeyondSlop(start, { x: 105, y: 103 })).toBe(false); // ~5.8px < 10
  });

  it('cancels once the finger drags past the slop radius', () => {
    expect(movedBeyondSlop(start, { x: 100, y: 100 + LONG_PRESS_SLOP_PX + 1 })).toBe(true);
  });

  it('uses true 2D distance, not per-axis', () => {
    // dx=8, dy=8 -> 11.3px, beyond a 10px radius even though neither axis alone is
    expect(movedBeyondSlop(start, { x: 108, y: 108 })).toBe(true);
  });

  it('honours a caller-supplied slop', () => {
    expect(movedBeyondSlop(start, { x: 120, y: 100 }, 25)).toBe(false);
    expect(movedBeyondSlop(start, { x: 120, y: 100 }, 15)).toBe(true);
  });
});

describe('LongPressClickGuard', () => {
  it('does not suppress a plain click when no long-press fired', () => {
    const g = new LongPressClickGuard();
    expect(g.consume()).toBe(false);
  });

  it('suppresses exactly the one click following a long-press', () => {
    const g = new LongPressClickGuard();
    g.arm();
    expect(g.consume()).toBe(true); // the release click is eaten
    expect(g.consume()).toBe(false); // the next real tap activates
  });

  it('reset clears a stale arm so the next quick tap activates', () => {
    const g = new LongPressClickGuard();
    g.arm();
    g.reset();
    expect(g.consume()).toBe(false);
  });
});
