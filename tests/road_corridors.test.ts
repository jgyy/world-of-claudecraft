import { describe, it, expect } from 'vitest';
import { ROADS } from '../src/sim/data';
import { resolvePosition } from '../src/sim/colliders';

// Roads are the deterministic travel paths that mobs/quests route along and that
// players naturally follow. A static prop collider (building, stall, tent, well,
// crate, campfire, fence) sitting on a road centerline shoves a road-walker
// sideways the moment they pass it: the "random colliders knock you off the path"
// bug. Decorations (trees/rocks) already avoid roads (generateDecorations excludes
// roadDistance < 5); props had no such guard. This test pins the invariant so a
// future road tweak or new prop can't silently re-introduce an on-road collider.
//
// We walk every road centerline at the live world seed and resolve each sample
// through the SAME collision function the server runs (resolvePosition). If a
// collider overlaps the centerline it pushes the point; a player should never be
// displaced more than a fraction of a body radius while following the road.

const SEED = 20061; // the fixed persistent world seed (src/main.ts, server/main.ts)
const BODY_RADIUS = 0.5;
const MAX_PUSH = 0.5; // yards; below a single body radius == still on the path
const STEP = 0.3; // sample spacing along the centerline

function maxCenterlinePush(road: { x: number; z: number }[]): { push: number; x: number; z: number } {
  let worst = 0;
  let wx = road[0]?.x ?? 0;
  let wz = road[0]?.z ?? 0;
  for (let i = 0; i < road.length - 1; i++) {
    const a = road[i];
    const b = road[i + 1];
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const len = Math.hypot(dx, dz);
    const n = Math.max(1, Math.floor(len / STEP));
    for (let s = 0; s <= n; s++) {
      const t = s / n;
      const x = a.x + dx * t;
      const z = a.z + dz * t;
      const res = resolvePosition(SEED, x, z, BODY_RADIUS);
      const push = Math.hypot(res.x - x, res.z - z);
      if (push > worst) {
        worst = push;
        wx = x;
        wz = z;
      }
    }
  }
  return { push: worst, x: wx, z: wz };
}

describe('road corridors stay clear of prop colliders', () => {
  ROADS.forEach((road, idx) => {
    it(`road ${idx} does not push a road-walker off the path`, () => {
      const { push, x, z } = maxCenterlinePush(road);
      expect(
        push,
        `road ${idx} pushes a centerline walker ${push.toFixed(2)}yd at (${x.toFixed(1)}, ${z.toFixed(1)}) ` +
          `- a prop collider overlaps the road; reroute the road around it`,
      ).toBeLessThanOrEqual(MAX_PUSH);
    });
  });
});
