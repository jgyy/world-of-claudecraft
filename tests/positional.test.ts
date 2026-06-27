import { describe, expect, it } from 'vitest';
import { isBehindTarget, withinMeleeArc } from '../src/sim/positional';
import { angleTo, MELEE_ARC, type Vec3 } from '../src/sim/types';

const at = (x: number, z: number): Vec3 => ({ x, y: 0, z });

describe('withinMeleeArc (front-arc gate)', () => {
  const from = at(0, 0);
  const target = at(0, 10); // due +z

  it('passes when the caster faces the target', () => {
    expect(withinMeleeArc(angleTo(from, target), from, target, MELEE_ARC)).toBe(true);
  });

  it('fails when the caster faces away from the target', () => {
    expect(withinMeleeArc(angleTo(from, target) + Math.PI, from, target, MELEE_ARC)).toBe(false);
  });

  it('treats exactly-arc as still facing (inclusive boundary)', () => {
    expect(withinMeleeArc(angleTo(from, target) + MELEE_ARC, from, target, MELEE_ARC)).toBe(true);
    expect(withinMeleeArc(angleTo(from, target) - MELEE_ARC, from, target, MELEE_ARC)).toBe(true);
  });

  it('is robust to a forged, non-normalized facing many turns wound up', () => {
    // A cheat client can send a huge accumulated yaw; normAngle canonicalizes it,
    // so a value coterminal with "facing the target" still passes, and one
    // coterminal with "facing away" still fails. The result never depends on the
    // raw winding.
    const toward = angleTo(from, target);
    expect(withinMeleeArc(toward + 400 * Math.PI, from, target, MELEE_ARC)).toBe(true);
    expect(withinMeleeArc(toward + Math.PI + 400 * Math.PI, from, target, MELEE_ARC)).toBe(false);
  });
});

describe('isBehindTarget (backstab/ambush rear-arc gate)', () => {
  const target = at(0, 0);
  const targetFacing = 0; // target looks down +z

  it('is true when the attacker stands behind the target', () => {
    expect(isBehindTarget(targetFacing, target, at(0, -10))).toBe(true);
  });

  it('is false when the attacker stands in front of the target', () => {
    expect(isBehindTarget(targetFacing, target, at(0, 10))).toBe(false);
  });

  it('treats exactly to-the-side (90 degrees) as behind (inclusive boundary, matching the original < PI/2 rejection)', () => {
    expect(isBehindTarget(targetFacing, target, at(10, 0))).toBe(true);
    expect(isBehindTarget(targetFacing, target, at(-10, 0))).toBe(true);
  });

  it('is robust to a forged, non-normalized target facing', () => {
    // The "behind" check reads the TARGET's facing, which is forgeable for a
    // player target. Canonicalization means the predicate still reports the true
    // geometric relationship for any coterminal facing value; it cannot be flipped
    // by winding the angle. (Hittability must never be gated on this; see module.)
    const attackerBehind = at(0, -10);
    expect(isBehindTarget(400 * Math.PI, target, attackerBehind)).toBe(true);
    expect(isBehindTarget(Math.PI + 400 * Math.PI, target, attackerBehind)).toBe(false);
  });
});
