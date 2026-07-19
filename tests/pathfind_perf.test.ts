// Perf budget for src/sim/pathfind.ts findPath over long/complex routes (through
// obstacles). Mirrors the measurement recipe from tests/mob_update_perf.test.ts and
// tests/aura_tick_perf.test.ts: warm up, sample many iterations, sort, and gate on
// the MEDIAN. pathfind.ts is a pure leaf, so this builds a deterministic zigzag
// blocker maze (via WorldContent.blockers, the same mechanism
// tests/blocker_colliders.test.ts uses) and times findPlayerPath directly with
// performance.now() in this test file.

import { afterEach, describe, expect, it } from 'vitest';
import { BUILTIN_WORLD, setActiveWorldContent } from '../src/sim/data';
import { findPlayerPath } from '../src/sim/pathfind';
import type { BlockerDef, WorldContent } from '../src/sim/types';

const SEED = 20064;
const ROW_SPACING = 6; // yards between maze rows (dense enough to force real A* work)
const GAP_WIDTH = 2.2; // yards; wide enough to be walkable at PLAYER_BODY_RADIUS 0.5
// findPath's search window is only MARGIN (8yd) beyond the from/to bounding box
// (both share x=0 here), so every wall/gap must stay within roughly +/-8yd of
// x=0 or it falls outside the searched grid and the goal reads as unreachable.
const HALF_WIDTH = 5;

function world(extra: Partial<WorldContent>): WorldContent {
  return { ...BUILTIN_WORLD, ...extra };
}

// Builds a snake maze of `rows` staggered wall segments running from z=0 to
// z=rows*ROW_SPACING. Each row spans the full corridor width except for a
// GAP_HALF_WIDTH-wide gap, alternating left/right, so a straight-line route is
// always blocked and findPath must genuinely search around each wall.
function buildMaze(rows: number): {
  blockers: BlockerDef[];
  from: { x: number; z: number };
  to: { x: number; z: number };
} {
  const blockers: BlockerDef[] = [];
  for (let r = 1; r <= rows; r++) {
    const z = r * ROW_SPACING;
    const gapOnLeft = r % 2 === 0;
    if (gapOnLeft) {
      // wall covers [-halfWidth+gap, halfWidth], gap on the left
      blockers.push({ x1: -HALF_WIDTH + GAP_WIDTH, z1: z, x2: HALF_WIDTH, z2: z });
    } else {
      // wall covers [-halfWidth, halfWidth-gap], gap on the right
      blockers.push({ x1: -HALF_WIDTH, z1: z, x2: HALF_WIDTH - GAP_WIDTH, z2: z });
    }
  }
  return {
    blockers,
    from: { x: 0, z: -2 },
    to: { x: 0, z: (rows + 1) * ROW_SPACING },
  };
}

afterEach(() => {
  setActiveWorldContent(null);
});

function maxSpanFor(rows: number): number {
  return Math.max(64, Math.ceil(rows * ROW_SPACING + 32));
}

function measureMedian(rows: number, sampleCalls: number): { median: number; pathLen: number } {
  const { blockers, from, to } = buildMaze(rows);
  setActiveWorldContent(world({ blockers }));
  const maxSpan = maxSpanFor(rows);

  // Warm up (also primes the collider grid cache for this content).
  let warmPath = findPlayerPath(SEED, from, to, maxSpan);
  for (let i = 0; i < 5; i++) findPlayerPath(SEED, from, to, maxSpan);

  const samples: number[] = [];
  for (let i = 0; i < sampleCalls; i++) {
    const start = performance.now();
    warmPath = findPlayerPath(SEED, from, to, maxSpan);
    samples.push(performance.now() - start);
  }
  samples.sort((a, b) => a - b);
  return { median: samples[Math.floor(samples.length / 2)], pathLen: warmPath.length };
}

describe('pathfind (A*) long/complex-route regression budget', () => {
  it('bounds per-call cost of findPath over a long zigzag maze', () => {
    const ROWS = 12;
    const { median, pathLen } = measureMedian(ROWS, 40);

    console.log(
      `[pathfind perf] rows=${ROWS} pathWaypoints=${pathLen} median=${median.toFixed(2)}ms`,
    );

    // A dozen-row zigzag maze A* search over a bounded grid is a low single-digit
    // ms figure (observed ~5ms); 50ms leaves generous headroom for slow/contended
    // CI hardware while still catching an order-of-magnitude regression in the
    // search or the string-pull smoothing pass.
    expect(median).toBeLessThan(50);
  }, 60_000);

  it('doubling maze rows (route length/complexity) does not more than roughly double search cost', () => {
    const SMALL = 6;
    const LARGE = SMALL * 2;

    const { median: smallMedian } = measureMedian(SMALL, 25);
    const { median: largeMedian } = measureMedian(LARGE, 25);

    console.log(
      `[pathfind perf] scaling rows=${SMALL}(${smallMedian.toFixed(2)}ms) ` +
        `rows=${LARGE}(${largeMedian.toFixed(2)}ms) ` +
        `ratio=${(largeMedian / Math.max(smallMedian, 0.001)).toFixed(2)}x`,
    );

    // A* over a grid whose area also roughly doubles along one axis should scale
    // close to linearly with the searched cell count for this corridor shape; the
    // bound is generous above 2x to absorb noise while still catching a
    // regression that turns the search superlinear in maze complexity.
    expect(largeMedian).toBeLessThan(Math.max(smallMedian * 3.5, 5));
  }, 60_000);

  it('shape sanity: the maze route is long and genuinely detours around every wall', () => {
    const ROWS = 16;
    const { blockers, from, to } = buildMaze(ROWS);
    setActiveWorldContent(world({ blockers }));
    const path = findPlayerPath(SEED, from, to, maxSpanFor(ROWS));

    // A real detoured route has many more waypoints than a trivial straight hop,
    // and its total length is well beyond the straight-line distance (it snakes
    // left/right through every gap).
    expect(path.length).toBeGreaterThan(ROWS / 3);
    let total = 0;
    let px = from.x,
      pz = from.z;
    for (const p of path) {
      total += Math.hypot(p.x - px, p.z - pz);
      px = p.x;
      pz = p.z;
    }
    const straight = Math.hypot(to.x - from.x, to.z - from.z);
    expect(total).toBeGreaterThan(straight * 1.02);
  });
});
