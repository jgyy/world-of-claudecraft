import { describe, expect, it } from 'vitest';
import { facingAlpha, remoteEntityAlpha } from '../src/render/net_interp_core';

// Regression coverage gap: tests/net_interp.test.ts pins remoteEntityAlpha /
// facingAlpha CORRECTNESS (the fallback-clock saturation, extrapolation caps)
// but says nothing about the per-call COST as the number of concurrently
// tracked remote entities grows. renderer.ts's sync() calls both once PER
// non-self streamed entity, every frame, so in a crowded online zone (many
// players/mobs/npcs all interpolating on their own measured cadence) this is
// exactly the per-frame, per-entity decision that can silently regress. This
// mirrors the sim-side perf recipe (tests/mob_update_perf.test.ts,
// tests/aura_tick_perf.test.ts): warm up, sample the median of many repeated
// calls, assert an absolute budget plus a doubling-population scaling check.

interface RemoteEntitySnapshot {
  netUpdatedAt: number | undefined;
  netInterval: number | undefined;
}

// Build `count` concurrently tracked remote entities in a realistic mix:
// most with a measured cadence (fast movers), some still on the fallback
// clock (idle mobs that only ever get sparse records), matching the
// production shape net_interp.test.ts's regression targets.
function buildEntities(count: number): RemoteEntitySnapshot[] {
  const entities: RemoteEntitySnapshot[] = [];
  for (let i = 0; i < count; i++) {
    const idle = i % 5 === 0;
    entities.push({
      netUpdatedAt: 1000,
      netInterval: idle ? undefined : 80 + (i % 100),
    });
  }
  return entities;
}

// Simulate one frame's interpolation pass over every concurrently tracked
// remote entity: what renderer.sync() actually does per non-self entity.
function runInterpFrame(
  entities: RemoteEntitySnapshot[],
  nowMs: number,
  globalAlpha: number,
): number {
  let saturatedCount = 0;
  for (const entity of entities) {
    const alpha = remoteEntityAlpha(nowMs, entity.netUpdatedAt, entity.netInterval, globalAlpha);
    const fAlpha = facingAlpha(alpha);
    if (fAlpha >= 1) saturatedCount++;
  }
  return saturatedCount;
}

function measureMedianMs(
  count: number,
  samples: number,
): { medianMs: number; lastSaturated: number } {
  const entities = buildEntities(count);
  // 100ms after the shared update instant: past the fallback interval's
  // saturation point for entities on the fallback clock, but still
  // mid-interpolation for entities whose measured cadence runs longer than
  // 100ms, guaranteeing a genuine mix rather than an all-one-value scenario.
  const nowMs = 1100;

  let lastSaturated = 0;
  for (let i = 0; i < 10; i++) lastSaturated = runInterpFrame(entities, nowMs, 0.4);

  const times: number[] = [];
  for (let i = 0; i < samples; i++) {
    const start = performance.now();
    lastSaturated = runInterpFrame(entities, nowMs, 0.4);
    times.push(performance.now() - start);
  }
  times.sort((a, b) => a - b);
  return { medianMs: times[Math.floor(times.length / 2)], lastSaturated };
}

describe('net_interp per-frame concurrent-entity cost', () => {
  it('bounds the per-frame interpolation cost across many concurrent entities', () => {
    const ENTITIES = 500;
    const { medianMs } = measureMedianMs(ENTITIES, 60);

    console.log(`[net_interp perf] entities=${ENTITIES} median=${medianMs.toFixed(3)}ms`);

    // Generous by design: each entity is a couple of arithmetic/min ops, so a
    // healthy median at 500 concurrent entities is well under 1ms; 8ms leaves
    // ample headroom for slow/contended CI hardware while still catching an
    // order-of-magnitude regression.
    expect(medianMs).toBeLessThan(8);
  }, 30_000);

  it('doubling the concurrent entity count does not more than roughly double the cost', () => {
    const SMALL = 250;
    const LARGE = SMALL * 2;

    const small = measureMedianMs(SMALL, 60);
    const large = measureMedianMs(LARGE, 60);

    console.log(
      `[net_interp perf] scaling small=${SMALL}(${small.medianMs.toFixed(3)}ms) ` +
        `large=${LARGE}(${large.medianMs.toFixed(3)}ms) ` +
        `ratio=${(large.medianMs / Math.max(small.medianMs, 0.001)).toFixed(2)}x`,
    );

    // Generous linear headroom, same rationale as aura_tick_perf.test.ts.
    expect(large.medianMs).toBeLessThan(Math.max(small.medianMs * 3.5, 2));
  }, 30_000);

  it('actually produced a real mix of interpolated and saturated remote entities', () => {
    const ENTITIES = 500;
    const { lastSaturated } = measureMedianMs(ENTITIES, 5);

    // Shape sanity: this proves the worst-case mix was really built (both
    // measured-cadence entities still mid-interpolation and fallback-clock
    // entities saturated at 1), not a degenerate all-one-value scenario.
    expect(lastSaturated).toBeGreaterThan(0);
    expect(lastSaturated).toBeLessThan(ENTITIES);
  });
});
