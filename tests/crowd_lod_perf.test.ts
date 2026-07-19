import { describe, expect, it } from 'vitest';
import { animatesEveryFrame, crowdLodScaleSq, midAnimCadence } from '../src/render/crowd_lod';

// Regression coverage gap: tests/crowd_lod.test.ts pins the DECISION VALUES
// (scale/cadence/exemption) but says nothing about the DECISION COST as the
// visible rig count grows. renderer.ts calls crowdLodScaleSq/midAnimCadence
// once per frame plus animatesEveryFrame once PER RIG every frame, so this is
// exactly the kind of per-frame, per-entity decision that can silently turn
// O(n) into O(n^2) in a crowded scene and tank FPS. This file mirrors the
// sim-side perf recipe (tests/mob_update_perf.test.ts, tests/aura_tick_perf.test.ts):
// warm up, sample the median of many repeated calls, assert an absolute budget
// plus a doubling-population scaling check.

const LOCAL_PLAYER_ID = 1;
const TARGET_ID = 2;

// Simulate one frame's worth of crowd-LOD decisions for `rigCount` visible
// rigs: the two per-frame policy calls, plus the per-rig exemption check
// every renderer.sync() actually performs for each visible character.
function runCrowdLodFrame(rigCount: number): number {
  const scaleSq = crowdLodScaleSq(rigCount);
  const cadence = midAnimCadence(rigCount);
  let everyFrameCount = 0;
  for (let id = 3; id < 3 + rigCount; id++) {
    const casting = id % 37 === 0 ? 'fireball' : null;
    if (animatesEveryFrame(id, LOCAL_PLAYER_ID, TARGET_ID, casting)) everyFrameCount++;
  }
  // fold scaleSq/cadence into the return so neither call can be dead-code-eliminated
  return everyFrameCount + Math.round(scaleSq * 0) + Math.round(cadence * 0);
}

// Median-of-N sampling, mirroring the sim-side perf test recipe: warm up,
// take SAMPLES repeated timings of one simulated frame, sort, take the median
// (rejects one-off GC/scheduling spikes from co-running Vitest workers).
function measureMedianMs(
  rigCount: number,
  samples: number,
): { medianMs: number; lastResult: number } {
  let lastResult = 0;
  for (let i = 0; i < 10; i++) lastResult = runCrowdLodFrame(rigCount);

  const times: number[] = [];
  for (let i = 0; i < samples; i++) {
    const start = performance.now();
    lastResult = runCrowdLodFrame(rigCount);
    times.push(performance.now() - start);
  }
  times.sort((a, b) => a - b);
  return { medianMs: times[Math.floor(times.length / 2)], lastResult };
}

describe('crowd_lod per-frame decision cost', () => {
  it('bounds the per-frame decision cost for a dense crowd', () => {
    const RIGS = 800;
    const { medianMs, lastResult } = measureMedianMs(RIGS, 60);

    console.log(
      `[crowd_lod perf] rigs=${RIGS} median=${medianMs.toFixed(3)}ms everyFrame=${lastResult}`,
    );

    // Generous by design: observed healthy median for 800 rigs is well under
    // 1ms (a handful of arithmetic ops per rig), so 8ms leaves ample headroom
    // for slow/contended CI hardware while still catching an order-of-
    // magnitude regression (e.g. an accidental O(n^2) scan per rig).
    expect(medianMs).toBeLessThan(8);
  }, 30_000);

  it('doubling the rig count does not more than roughly double the decision cost', () => {
    const SMALL = 400;
    const LARGE = SMALL * 2;

    const small = measureMedianMs(SMALL, 60);
    const large = measureMedianMs(LARGE, 60);

    console.log(
      `[crowd_lod perf] scaling small=${SMALL}rigs(${small.medianMs.toFixed(3)}ms) ` +
        `large=${LARGE}rigs(${large.medianMs.toFixed(3)}ms) ` +
        `ratio=${(large.medianMs / Math.max(small.medianMs, 0.001)).toFixed(2)}x`,
    );

    // Generous linear headroom (3.5x for a 2x population), same rationale as
    // aura_tick_perf.test.ts: catches an O(n^2) regression a flat ceiling
    // alone would miss, without flaking on noise at small ms magnitudes.
    expect(large.medianMs).toBeLessThan(Math.max(small.medianMs * 3.5, 2));
  }, 30_000);

  it('actually built a dense crowd and produced a real, non-trivial exemption split', () => {
    const RIGS = 800;
    const { lastResult } = measureMedianMs(RIGS, 5);

    // Sanity on the worst-case shape: with a cast-windup on every 37th rig
    // and only the local player/target otherwise exempt, most of the crowd
    // is throttleable (the common case the cadence actually degrades) while
    // a real, non-zero slice keeps animating every frame.
    let expectedCasting = 0;
    for (let id = 3; id < 3 + RIGS; id++) if (id % 37 === 0) expectedCasting++;
    expect(lastResult).toBeGreaterThan(0);
    expect(lastResult).toBeGreaterThanOrEqual(expectedCasting);
    expect(lastResult).toBeLessThan(RIGS / 4);

    // The scale/cadence policy itself really degraded at this population.
    expect(crowdLodScaleSq(RIGS)).toBeLessThan(1);
    expect(midAnimCadence(RIGS)).toBe(4);
  });
});
