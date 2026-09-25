import { describe, expect, it } from 'vitest';
import {
  type ClickMoveTargetWorld,
  clickMovePathTo,
  resolvedClickMoveTarget,
} from '../src/game/click_move_target';

const world: ClickMoveTargetWorld = {
  cfg: { seed: 42 },
  player: { pos: { x: 0, z: 0 } },
  riftCollisionToken: 0,
};

describe('click_move_target (extracted from main.ts)', () => {
  it('resolves a destination near the requested point', () => {
    const dest = resolvedClickMoveTarget(world, { x: 10, z: 10 });
    expect(Number.isFinite(dest.x)).toBe(true);
    expect(Number.isFinite(dest.z)).toBe(true);
  });

  it('builds a path from the player toward the destination', () => {
    const path = clickMovePathTo(world, { x: 10, z: 10 });
    expect(Array.isArray(path)).toBe(true);
    expect(path.length).toBeGreaterThan(0);
    const last = path[path.length - 1];
    expect(last.x).toBeCloseTo(10, 0);
    expect(last.z).toBeCloseTo(10, 0);
  });
});
