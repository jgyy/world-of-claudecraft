import { describe, expect, it } from 'vitest';
import {
  advanceSelfFacing,
  approachAngle,
  releaseSelfFacing,
  stepSelfFacing,
} from '../src/render/facing_smooth';

// Perf-budget coverage for the render-side hot path: facing_smooth.ts's
// step/advance/release functions run once PER RENDERED FRAME for the online
// local player's model yaw (renderer.sync() calls one of them every frame
// while the camera-driven override is engaged or disengaging). It does not
// scale with entity/population count. tests/facing_smooth.test.ts pins the
// POLICY (shortest-path wrapping, rate cap, residual-gap decay, convergence);
// this file pins the per-call COST and, since the cost is inherently O(1),
// checks for a growth/drift trend instead of a population-scaling check.

const FRAME_DT = 1 / 60;

function runFrames(count: number): number[] {
  const samples: number[] = [];
  let current = 0;
  let lastTarget = 0;
  for (let i = 0; i < count; i++) {
    const target = Math.sin(i * 0.1) * Math.PI;
    const t0 = performance.now();
    current = stepSelfFacing(current, target, FRAME_DT);
    const advanced = advanceSelfFacing(current, target, lastTarget, FRAME_DT);
    releaseSelfFacing(current, target, FRAME_DT);
    approachAngle(current, target, 0.5);
    samples.push(performance.now() - t0);
    current = advanced;
    lastTarget = target;
  }
  return samples;
}

describe('facing_smooth perf: per-frame yaw smoothing cost', () => {
  it('bounds the per-frame cost of the yaw-smoothing call set', () => {
    runFrames(10); // warm up

    const samples = runFrames(60);
    samples.sort((a, b) => a - b);
    const median = samples[Math.floor(samples.length / 2)];

    console.log(`[facing_smooth perf] median=${median.toFixed(4)}ms`);

    // O(1) per call (pure scalar trig/arithmetic, no allocation, no
    // population scaling); the healthy median is a tiny fraction of a ms, so
    // 1ms leaves generous headroom for slow/contended CI hardware while still
    // catching an accidental per-frame allocation or an O(n) creep.
    expect(median).toBeLessThan(1);
  }, 30_000);

  it('shows no growth trend across many consecutive frames (drift/leak guard)', () => {
    runFrames(10); // warm up

    const samples = runFrames(400);
    const firstTen = samples.slice(0, 10).sort((a, b) => a - b);
    const lastTen = samples.slice(-10).sort((a, b) => a - b);
    const firstMedian = firstTen[Math.floor(firstTen.length / 2)];
    const lastMedian = lastTen[Math.floor(lastTen.length / 2)];

    console.log(
      `[facing_smooth perf] drift-guard firstMedian=${firstMedian.toFixed(4)}ms ` +
        `lastMedian=${lastMedian.toFixed(4)}ms`,
    );

    // These are pure functions with no internal state and no allocation, so
    // per-call cost must stay flat over hundreds of calls; a growing trend
    // would signal an accidental per-frame allocation creeping into what
    // should be a scalar-only hot path. Bound generously (2x, floor 0.2ms)
    // since both medians are tiny absolute numbers where relative noise
    // dominates.
    expect(lastMedian).toBeLessThan(Math.max(firstMedian * 2, 0.2));
  }, 30_000);

  it('actually advances the yaw every frame toward a moving target (shape sanity)', () => {
    let current = 0;
    let lastTarget = 0;
    let moved = false;
    for (let i = 0; i < 30; i++) {
      const target = Math.sin(i * 0.3) * Math.PI;
      const next = advanceSelfFacing(current, target, lastTarget, FRAME_DT);
      if (next !== current) moved = true;
      current = next;
      lastTarget = target;
    }
    expect(moved).toBe(true);
    // releaseSelfFacing genuinely converges given enough frames.
    let releasing = Math.PI;
    let done = false;
    for (let i = 0; i < 200 && !done; i++) {
      const r = releaseSelfFacing(releasing, 0, FRAME_DT);
      releasing = r.facing;
      done = r.done;
    }
    expect(done).toBe(true);
  });
});
