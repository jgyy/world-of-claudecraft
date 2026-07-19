// Perf budget for src/sim/colliders.ts resolvePosition against a dense static prop
// field. Mirrors the measurement recipe from tests/mob_update_perf.test.ts and
// tests/aura_tick_perf.test.ts: warm up, sample many iterations, sort, and gate on
// the MEDIAN. colliders.ts is a pure leaf, so this builds a custom WorldContent
// packed with many circle-collider placements near the resolved position (the same
// `placements[].collideRadius` mechanism tests/blocker_colliders.test.ts uses) and
// times resolvePosition directly with performance.now() in this test file.

import { afterEach, describe, expect, it } from 'vitest';
import { isBlocked, resolvePosition } from '../src/sim/colliders';
import { BUILTIN_WORLD, setActiveWorldContent } from '../src/sim/data';
import type { PlacedAsset, WorldContent } from '../src/sim/types';

const SEED = 20065;
// Resolve near this point: the dense prop field is centered here so the grid
// cell(s) the query lands in are maximally packed.
const CENTER = { x: -400, z: -400 };

function world(extra: Partial<WorldContent>): WorldContent {
  return { ...BUILTIN_WORLD, ...extra };
}

// Deterministic dense ring-and-grid field of `count` small circle colliders
// packed into one collider-grid cell (GRID_CELL=16yd in colliders.ts) around
// CENTER, so a resolvePosition call there must push out of many overlapping
// candidates from the same bucket.
function buildDenseField(count: number): PlacedAsset[] {
  const placements: PlacedAsset[] = [];
  const cols = Math.ceil(Math.sqrt(count));
  const spacing = 12 / cols; // pack within a ~12yd square, well inside one 16yd cell
  let i = 0;
  for (let row = 0; row < cols && i < count; row++) {
    for (let col = 0; col < cols && i < count; col++) {
      placements.push({
        path: '/models/props/rock.glb',
        x: CENTER.x - 6 + col * spacing,
        z: CENTER.z - 6 + row * spacing,
        rotY: 0,
        scale: 1,
        collideRadius: 0.4,
      });
      i++;
    }
  }
  return placements;
}

function measureMedian(propCount: number, sampleCalls: number): number {
  const placements = buildDenseField(propCount);
  setActiveWorldContent(world({ placements }));

  // Warm up (also primes the per-content collider grid cache).
  for (let i = 0; i < 20; i++) resolvePosition(SEED, CENTER.x, CENTER.z, 0.5);

  const samples: number[] = [];
  for (let i = 0; i < sampleCalls; i++) {
    const start = performance.now();
    resolvePosition(SEED, CENTER.x, CENTER.z, 0.5);
    samples.push(performance.now() - start);
  }
  samples.sort((a, b) => a - b);
  return samples[Math.floor(samples.length / 2)];
}

afterEach(() => {
  setActiveWorldContent(null);
});

describe('collider resolution high-density regression budget', () => {
  it('bounds resolvePosition per-call cost against a dense prop field', () => {
    const PROPS = 400;
    const median = measureMedian(PROPS, 60);

    console.log(`[collider perf] props=${PROPS} median=${median.toFixed(3)}ms`);

    // resolvePosition iterates one collider-grid cell's list up to 3 push-out
    // passes; the healthy median at this density is well under a ms. 10ms leaves
    // generous headroom for slow/contended CI hardware while still catching an
    // order-of-magnitude regression (e.g. losing the per-cell bucketing and
    // scanning the whole prop set).
    expect(median).toBeLessThan(10);
  }, 60_000);

  it('doubling prop count near the resolved position does not more than roughly double cost', () => {
    const SMALL = 300;
    const LARGE = SMALL * 2;

    const smallMedian = measureMedian(SMALL, 40);
    const largeMedian = measureMedian(LARGE, 40);

    console.log(
      `[collider perf] scaling small=${SMALL}(${smallMedian.toFixed(3)}ms) ` +
        `large=${LARGE}(${largeMedian.toFixed(3)}ms) ` +
        `ratio=${(largeMedian / Math.max(smallMedian, 0.001)).toFixed(2)}x`,
    );

    // Doubling the packed-cell prop count roughly doubles the per-pass candidate
    // list resolveAgainst walks, so genuinely linear work should land near 2x.
    // The bound is generous above that to absorb noise at small absolute ms
    // magnitudes while still failing hard on a regression that makes grid lookup
    // itself scale with total prop count.
    expect(largeMedian).toBeLessThan(Math.max(smallMedian * 3.5, 5));
  }, 60_000);

  it('shape sanity: the dense field is actually built and blocks the resolved point', () => {
    const PROPS = 400;
    const placements = buildDenseField(PROPS);
    expect(placements.length).toBe(PROPS);
    setActiveWorldContent(world({ placements }));
    // The center of the packed field must be inside at least one collider, so
    // resolvePosition genuinely does push-out work rather than a no-op pass.
    expect(isBlocked(SEED, CENTER.x, CENTER.z, 0.5)).toBe(true);
  });
});
