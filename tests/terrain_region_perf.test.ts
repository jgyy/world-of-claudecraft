import { describe, expect, it } from 'vitest';
import { chunkIntersectsRegion } from '../src/render/terrain_region_core';

// Regression coverage gap: tests/terrain_region_core.test.ts pins the
// chunkIntersectsRegion PREDICATE (border inclusivity, super-chunks, etc) but
// says nothing about the selection COST as the world's chunk count grows.
// terrain.ts calls this once per stored chunk for every sculpt-region rebuild
// in the map editor, so a large open world (hundreds of regular + far
// super-chunks) walking this per edit is exactly the per-action, per-chunk
// decision that can silently regress and stall the editor. This mirrors the
// sim-side perf recipe (tests/mob_update_perf.test.ts, tests/aura_tick_perf.test.ts):
// warm up, sample the median of many repeated calls, assert an absolute
// budget plus a doubling-population scaling check.

const CHUNK = 60;

// Build a grid of `gridDim` x `gridDim` regular chunks covering a large open
// world, mirroring terrain.ts's regular chunk layout.
function buildChunkGrid(gridDim: number): { x0: number; z0: number }[] {
  const chunks: { x0: number; z0: number }[] = [];
  for (let cx = 0; cx < gridDim; cx++) {
    for (let cz = 0; cz < gridDim; cz++) {
      chunks.push({ x0: cx * CHUNK, z0: cz * CHUNK });
    }
  }
  return chunks;
}

// Simulate one sculpt-region rebuild pass: walk every stored chunk and select
// which ones the edit region invalidates, exactly as terrain.ts does per edit.
function runRegionSelection(
  chunks: { x0: number; z0: number }[],
  minX: number,
  minZ: number,
  maxX: number,
  maxZ: number,
): number {
  let hits = 0;
  for (const chunk of chunks) {
    if (chunkIntersectsRegion(chunk.x0, chunk.z0, CHUNK, minX, minZ, maxX, maxZ)) hits++;
  }
  return hits;
}

function measureMedianMs(
  gridDim: number,
  samples: number,
): { medianMs: number; lastHits: number; chunkCount: number } {
  const chunks = buildChunkGrid(gridDim);
  // A brush footprint near the middle of the grid, wide enough to straddle
  // several chunk borders (the worst case: border-inclusive matches on every
  // side).
  const centerX = ((gridDim * CHUNK) / 2) | 0;
  const centerZ = ((gridDim * CHUNK) / 2) | 0;
  const minX = centerX - 90;
  const minZ = centerZ - 90;
  const maxX = centerX + 90;
  const maxZ = centerZ + 90;

  let lastHits = 0;
  for (let i = 0; i < 10; i++) lastHits = runRegionSelection(chunks, minX, minZ, maxX, maxZ);

  const times: number[] = [];
  for (let i = 0; i < samples; i++) {
    const start = performance.now();
    lastHits = runRegionSelection(chunks, minX, minZ, maxX, maxZ);
    times.push(performance.now() - start);
  }
  times.sort((a, b) => a - b);
  return { medianMs: times[Math.floor(times.length / 2)], lastHits, chunkCount: chunks.length };
}

describe('terrain_region chunk-selection cost', () => {
  it('bounds the per-edit chunk-selection cost across a large chunk grid', () => {
    const GRID_DIM = 80; // 6400 chunks: a large open world's regular chunk count
    const { medianMs, chunkCount } = measureMedianMs(GRID_DIM, 50);

    console.log(`[terrain_region perf] chunks=${chunkCount} median=${medianMs.toFixed(3)}ms`);

    // Generous by design: this is a flat linear scan with cheap arithmetic
    // per chunk, so a healthy median for a few thousand chunks is well under
    // 1ms; 10ms leaves ample headroom for slow/contended CI hardware while
    // still catching an order-of-magnitude regression.
    expect(medianMs).toBeLessThan(10);
  }, 30_000);

  it('doubling the chunk grid does not more than roughly double the selection cost', () => {
    const SMALL_DIM = 56; // ~3136 chunks
    const LARGE_DIM = Math.round(SMALL_DIM * Math.SQRT2); // ~2x the chunk count

    const small = measureMedianMs(SMALL_DIM, 50);
    const large = measureMedianMs(LARGE_DIM, 50);

    console.log(
      `[terrain_region perf] scaling small=${small.chunkCount}chunks(${small.medianMs.toFixed(3)}ms) ` +
        `large=${large.chunkCount}chunks(${large.medianMs.toFixed(3)}ms) ` +
        `ratio=${(large.medianMs / Math.max(small.medianMs, 0.001)).toFixed(2)}x`,
    );

    expect(large.chunkCount).toBeGreaterThan(small.chunkCount * 1.8);
    // Generous linear headroom (3.5x for a ~2x population), same rationale as
    // aura_tick_perf.test.ts.
    expect(large.medianMs).toBeLessThan(Math.max(small.medianMs * 3.5, 2));
  }, 30_000);

  it('actually built a large chunk grid and selected a real, non-trivial subset', () => {
    const GRID_DIM = 80;
    const { lastHits, chunkCount } = measureMedianMs(GRID_DIM, 5);

    // Shape sanity: a real world-scale grid with more than a handful of
    // chunks genuinely selected by the brush footprint (not zero, not the
    // whole grid).
    expect(chunkCount).toBe(GRID_DIM * GRID_DIM);
    expect(lastHits).toBeGreaterThan(0);
    expect(lastHits).toBeLessThan(chunkCount / 10);
  });
});
