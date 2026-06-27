import { describe, expect, it } from 'vitest';
import { FLEE_MAX_SPEED, FLEE_SPEED_MULT, fleeSpeed } from '../src/sim/flee_speed';
import { RUN_SPEED } from '../src/sim/types';

describe('fleeSpeed', () => {
  it('caps the final flee speed at the player base run speed', () => {
    expect(FLEE_MAX_SPEED).toBe(RUN_SPEED);
    // A normal (unbuffed) mob flees at base * FLEE_SPEED_MULT, never above the cap.
    expect(fleeSpeed(4, 1)).toBeCloseTo(4 * FLEE_SPEED_MULT);
    expect(fleeSpeed(6, 1)).toBe(RUN_SPEED); // 6 * 1.4 = 8.4 -> capped to 7
  });

  it('never lets a speed-buffed fleeing mob outrun the player (the bug)', () => {
    // buff_speed / form_travel carry a >1 multiplier. The flee speed must STILL
    // be capped at the player's base run speed, not multiplied past it.
    expect(fleeSpeed(5, 1.4)).toBeLessThanOrEqual(RUN_SPEED);
    expect(fleeSpeed(7, 1.4)).toBe(RUN_SPEED);
    // Even a fast mob with a big haste buff cannot exceed the cap.
    expect(fleeSpeed(7, 2)).toBe(RUN_SPEED);
  });

  it('still slows a fleeing mob below the cap when it is snared', () => {
    // A slow aura (mult < 1) brings the mob below the cap; the cap is only a ceiling.
    expect(fleeSpeed(5, 0.5)).toBeCloseTo(5 * FLEE_SPEED_MULT * 0.5);
    expect(fleeSpeed(5, 0.5)).toBeLessThan(RUN_SPEED);
  });

  it('is deterministic for the same inputs', () => {
    expect(fleeSpeed(5, 1.4)).toEqual(fleeSpeed(5, 1.4));
  });
});
