// Perf/regression budget for world.ts (terrainHeight/groundHeight) and voxel.ts
// (voxelDensity) at scale: a full chunk grid worth of sample points. Both are pure
// leaves (no SimContext, per src/sim/CLAUDE.md), so this file calls them directly with
// performance.now() timing in the test file (fine here; only banned inside src/sim/
// source itself). Mirrors the measurement recipe in tests/mob_update_perf.test.ts /
// tests/aura_tick_perf.test.ts: warm up, sample many iterations, take the MEDIAN,
// assert a generous absolute budget plus a scaling check.
import { describe, expect, it } from 'vitest';
import { voxelDensity } from '../src/sim/voxel';
import { groundHeight, terrainHeight } from '../src/sim/world';

const WORLD_SEED = 20066;

// Build a dense square grid of (x, z) sample points, mirroring a chunk-sized terrain
// sampling pass (e.g. mesh generation or a bulk LOS/collider precompute).
function buildGrid(sizePerAxis: number, spacing: number): Array<{ x: number; z: number }> {
  const points: Array<{ x: number; z: number }> = [];
  const half = (sizePerAxis * spacing) / 2;
  for (let ix = 0; ix < sizePerAxis; ix++) {
    for (let iz = 0; iz < sizePerAxis; iz++) {
      points.push({ x: -half + ix * spacing, z: -half + iz * spacing });
    }
  }
  return points;
}

function measureTerrainGridMedian(
  sizePerAxis: number,
  spacing: number,
  samples: number,
): { median: number; points: number } {
  const grid = buildGrid(sizePerAxis, spacing);

  const runOnce = (): number => {
    const start = performance.now();
    let acc = 0;
    for (const p of grid) {
      acc += terrainHeight(p.x, p.z, WORLD_SEED);
      acc += groundHeight(p.x, p.z, WORLD_SEED);
      // Sample a handful of y levels per (x,z) for the voxel density field, mirroring
      // a chunked-mesher pass that walks vertical columns of the 3D field.
      acc += voxelDensity(p.x, 0, p.z, WORLD_SEED);
      acc += voxelDensity(p.x, 10, p.z, WORLD_SEED);
      acc += voxelDensity(p.x, -10, p.z, WORLD_SEED);
    }
    // Prevent dead-code elimination of the accumulated result.
    if (!Number.isFinite(acc) && acc !== -Infinity) throw new Error('unreachable');
    return performance.now() - start;
  };

  runOnce(); // warm up
  const times: number[] = [];
  for (let i = 0; i < samples; i++) times.push(runOnce());
  times.sort((a, b) => a - b);
  return { median: times[Math.floor(times.length / 2)], points: grid.length };
}

describe('terrain/voxel sampling (terrainHeight/groundHeight/voxelDensity) high-load regression budget', () => {
  it('bounds the cost of a full chunk-grid terrain + voxel sampling pass', () => {
    const SIZE = 64; // 64x64 = 4096 (x,z) points, each sampled at 5 field calls
    const SPACING = 1;

    const { median, points } = measureTerrainGridMedian(SIZE, SPACING, 30);

    console.log(
      `[terrain.sampling perf] grid=${SIZE}x${SIZE} points=${points} median=${median.toFixed(2)}ms`,
    );

    // Generous by design (see mob_update_perf.test.ts), calibrated against MEASURED
    // reality rather than an assumed figure: a full 64x64 grid (4096 points, 5 field
    // calls each = 20480 total samples) genuinely runs a low-tens-of-ms median on an
    // idle host (~30-40ms observed across multiple hosts), not the single-digit-ms this
    // bound originally assumed. 120ms leaves real headroom (roughly 3x the observed
    // median, with margin over spikes as high as ~79ms seen under CI-like contention
    // from co-running Vitest workers) while still catching a sustained
    // order-of-magnitude regression.
    expect(median).toBeLessThan(120);
  }, 60_000);

  it('doubling the sample-point count does not more than roughly double the sampling cost', () => {
    const SMALL = 32; // 32x32 = 1024 points
    const LARGE = 45; // 45x45 = 2025 points, ~2x SMALL's point count
    const SPACING = 1;

    const small = measureTerrainGridMedian(SMALL, SPACING, 20);
    const large = measureTerrainGridMedian(LARGE, SPACING, 20);

    console.log(
      `[terrain.sampling perf] scaling small=${small.points}pts(${small.median.toFixed(2)}ms) ` +
        `large=${large.points}pts(${large.median.toFixed(2)}ms) ` +
        `ratio=${(large.median / Math.max(small.median, 0.001)).toFixed(2)}x`,
    );

    // A doubled point count doing genuinely per-point work should land near 2x; the
    // bound is set generously above that (3.5x) to absorb noise at small absolute ms
    // magnitudes while still failing hard on a regression that turns a per-point
    // constant-cost sample into something that scales with total world content (e.g.
    // an unbounded scan over every camp/prop/dock per sample instead of the
    // radius/threshold-scoped ones the field functions use today).
    expect(large.median).toBeLessThan(Math.max(small.median * 3.5, 5));
  }, 60_000);

  it('actually sampled the full chunk-grid worth of distinct terrain points (shape sanity)', () => {
    const SIZE = 64;
    const grid = buildGrid(SIZE, 1);
    expect(grid.length).toBe(SIZE * SIZE);

    // Every point should produce a finite terrain height and a valid (non-NaN) voxel
    // density reading: proves the worst-case dense-grid shape was really sampled, not
    // a degenerate empty or all-identical one.
    let finiteHeights = 0;
    const heights = new Set<number>();
    for (const p of grid) {
      const h = terrainHeight(p.x, p.z, WORLD_SEED);
      if (Number.isFinite(h)) finiteHeights++;
      heights.add(Math.round(h * 100));
      const density = voxelDensity(p.x, h, p.z, WORLD_SEED);
      expect(Number.isNaN(density)).toBe(false);
    }
    expect(finiteHeights).toBe(grid.length);
    // A real, varied terrain field should not sample as perfectly flat.
    expect(heights.size).toBeGreaterThan(1);
  });
});
