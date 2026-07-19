// Perf budget for src/sim/spatial.ts SpatialGrid.forEachInRadius at high entity
// density. Mirrors the measurement recipe from tests/mob_update_perf.test.ts and
// tests/aura_tick_perf.test.ts: warm up, sample many iterations, sort, and gate on
// the MEDIAN. spatial.ts is a pure leaf (no SimContext import), so this builds a
// SpatialGrid directly and times forEachInRadius with performance.now() in this
// test file.

import { describe, expect, it } from 'vitest';
import { SpatialGrid } from '../src/sim/spatial';
import type { Entity } from '../src/sim/types';

function fakeEntity(id: number, x: number, z: number): Entity {
  return {
    id,
    pos: { x, y: 0, z },
  } as unknown as Entity;
}

// Packs `count` entities into a dense square field (deterministic layout, no
// rng) so a radius query at the center always crosses many populated cells.
function buildDenseGrid(count: number, cellSize = 32): { grid: SpatialGrid; entities: Entity[] } {
  const grid = new SpatialGrid(cellSize);
  const entities: Entity[] = [];
  const side = Math.ceil(Math.sqrt(count));
  const spacing = 0.75; // yards between neighbors: dense enough to pack many per cell
  let i = 0;
  for (let row = 0; row < side && i < count; row++) {
    for (let col = 0; col < side && i < count; col++) {
      const e = fakeEntity(i + 1, (col - side / 2) * spacing, (row - side / 2) * spacing);
      grid.insert(e);
      entities.push(e);
      i++;
    }
  }
  return { grid, entities };
}

function measureMedianQuery(count: number, radius: number, sampleCalls: number): number {
  const { grid } = buildDenseGrid(count);

  // Warm up.
  for (let i = 0; i < 20; i++) {
    let hits = 0;
    grid.forEachInRadius(0, 0, radius, () => hits++);
  }

  const samples: number[] = [];
  for (let i = 0; i < sampleCalls; i++) {
    const start = performance.now();
    let hits = 0;
    grid.forEachInRadius(0, 0, radius, () => hits++);
    samples.push(performance.now() - start);
  }
  samples.sort((a, b) => a - b);
  return samples[Math.floor(samples.length / 2)];
}

const DENSE_COUNT = 5000;
const RADIUS = 40;

describe('spatial grid radius query high-density regression budget', () => {
  it('bounds per-query cost at high entity density', () => {
    const median = measureMedianQuery(DENSE_COUNT, RADIUS, 60);

    console.log(
      `[spatial perf] entities=${DENSE_COUNT} radius=${RADIUS} median=${median.toFixed(3)}ms`,
    );

    // A radius query over a dense field visits a bounded number of cells plus a
    // per-candidate distance check; the healthy median at this density is well
    // under a ms. 10ms leaves generous headroom for slow/contended CI hardware
    // while still catching an order-of-magnitude regression (e.g. a bucket-key
    // collision or an unbounded cell scan).
    expect(median).toBeLessThan(10);
  }, 60_000);

  it('doubling entity count does not more than roughly double query cost', () => {
    const SMALL = 4000;
    const LARGE = SMALL * 2;

    const smallMedian = measureMedianQuery(SMALL, RADIUS, 40);
    const largeMedian = measureMedianQuery(LARGE, RADIUS, 40);

    console.log(
      `[spatial perf] scaling small=${SMALL}(${smallMedian.toFixed(3)}ms) ` +
        `large=${LARGE}(${largeMedian.toFixed(3)}ms) ` +
        `ratio=${(largeMedian / Math.max(smallMedian, 0.001)).toFixed(2)}x`,
    );

    // Doubling the entity count at fixed density roughly doubles the candidates
    // inside the fixed-radius window, so genuinely linear per-candidate work
    // should land near 2x. The bound is set generously above that to absorb
    // noise at small absolute ms magnitudes while still failing hard on a
    // regression that turns per-cell lookup into a scan of the whole grid.
    expect(largeMedian).toBeLessThan(Math.max(smallMedian * 3.5, 5));
  }, 60_000);

  it('shape sanity: the dense field and radius query actually produce many hits', () => {
    const { grid, entities } = buildDenseGrid(DENSE_COUNT);
    expect(entities.length).toBe(DENSE_COUNT);
    let hits = 0;
    grid.forEachInRadius(0, 0, RADIUS, () => hits++);
    // With 0.75yd spacing over a square field, a 40yd-radius query should
    // sweep a large majority of the population, not just a handful.
    expect(hits).toBeGreaterThan(DENSE_COUNT * 0.5);
  });
});
