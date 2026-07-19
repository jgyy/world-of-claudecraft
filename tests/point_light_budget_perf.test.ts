import { describe, expect, it } from 'vitest';
import { applyPointLightBudget, type RankedPointLight } from '../src/render/point_light_budget';

// Regression coverage gap: there is no existing point_light_budget.test.ts
// pinning applyPointLightBudget's per-call COST as the candidate light count
// grows. renderer.ts calls this once per frame over every streamed entity's
// point lights (VFX + view lights), so the distance recompute + conditional
// sort + budget assignment loop is exactly the per-frame, per-light decision
// that can silently regress from O(n) to O(n log n log n) or worse in a
// crowded scene full of glowing props/casters. This mirrors the sim-side perf
// recipe (tests/mob_update_perf.test.ts, tests/aura_tick_perf.test.ts): warm
// up, sample the median of many repeated calls, assert an absolute budget
// plus a doubling-population scaling check.

// Minimal duck-typed stand-in for THREE.PointLight: applyPointLightBudget only
// ever reads/writes `.visible`, `.intensity`, and (for dynamic entries) calls
// `.getWorldPosition`, so a real Three.js instance is unnecessary.
function fakeLight(dynamic: boolean, worldX: number, worldZ: number): RankedPointLight['light'] {
  const light = {
    visible: true,
    intensity: 1,
    getWorldPosition(target: { x: number; y: number; z: number }) {
      target.x = worldX;
      target.y = 0;
      target.z = worldZ;
      return target;
    },
  };
  return light as unknown as RankedPointLight['light'];
}

// Build `count` ranked candidate lights scattered on a ring around the
// player, roughly half static view-lights (fixed base intensity) and half
// dynamic VFX lights (re-fetch world position every call): the worst-case mix
// the renderer actually assembles in a busy scene.
function buildCandidates(count: number): RankedPointLight[] {
  const ranked: RankedPointLight[] = [];
  for (let i = 0; i < count; i++) {
    const ang = (i / count) * Math.PI * 2;
    const r = 5 + (i % 40);
    const worldX = Math.sin(ang) * r;
    const worldZ = Math.cos(ang) * r;
    const dynamic = i % 2 === 0;
    ranked.push({
      light: fakeLight(dynamic, worldX, worldZ),
      d2: 0,
      worldPos: { x: worldX, y: 0, z: worldZ } as RankedPointLight['worldPos'],
      base: dynamic ? null : 3,
      dynamic,
    });
  }
  return ranked;
}

const VISIBLE_COUNT = 24;
const LIVE_BUDGET = 8;
const RANGE_SQ = 30 * 30;

function runBudgetPass(count: number): RankedPointLight[] {
  const ranked = buildCandidates(count);
  applyPointLightBudget(ranked, 0, 0, VISIBLE_COUNT, LIVE_BUDGET, RANGE_SQ);
  return ranked;
}

// Median-of-N sampling, mirroring the sim-side perf test recipe.
function measureMedianMs(
  count: number,
  samples: number,
): { medianMs: number; lastRanked: RankedPointLight[] } {
  let lastRanked: RankedPointLight[] = [];
  for (let i = 0; i < 10; i++) lastRanked = runBudgetPass(count);

  const times: number[] = [];
  for (let i = 0; i < samples; i++) {
    const start = performance.now();
    lastRanked = runBudgetPass(count);
    times.push(performance.now() - start);
  }
  times.sort((a, b) => a - b);
  return { medianMs: times[Math.floor(times.length / 2)], lastRanked };
}

describe('point_light_budget per-call decision cost', () => {
  it('bounds the per-call cost for a scene with many candidate point lights', () => {
    const CANDIDATES = 600;
    const { medianMs } = measureMedianMs(CANDIDATES, 50);

    console.log(
      `[point_light_budget perf] candidates=${CANDIDATES} median=${medianMs.toFixed(3)}ms`,
    );

    // Generous by design: the pass is one distance recompute + a conditional
    // sort + a linear budget-assignment loop over a few hundred lights, so a
    // healthy median is well under 1ms; 10ms leaves ample headroom for
    // slow/contended CI hardware while catching an order-of-magnitude
    // regression (e.g. a sort added unconditionally, or an O(n^2) scan).
    expect(medianMs).toBeLessThan(10);
  }, 30_000);

  it('doubling the candidate count does not more than roughly double the cost', () => {
    const SMALL = 300;
    const LARGE = SMALL * 2;

    const small = measureMedianMs(SMALL, 50);
    const large = measureMedianMs(LARGE, 50);

    console.log(
      `[point_light_budget perf] scaling small=${SMALL}(${small.medianMs.toFixed(3)}ms) ` +
        `large=${LARGE}(${large.medianMs.toFixed(3)}ms) ` +
        `ratio=${(large.medianMs / Math.max(small.medianMs, 0.001)).toFixed(2)}x`,
    );

    // Generous linear headroom: the sort is O(n log n), which is close enough
    // to linear at these scales that 3.5x still leaves room to catch a true
    // quadratic regression without flaking on noise.
    expect(large.medianMs).toBeLessThan(Math.max(small.medianMs * 3.5, 3));
  }, 30_000);

  it('actually enforced the visible/live budgets over a real oversubscribed candidate set', () => {
    const CANDIDATES = 600;
    const { lastRanked } = measureMedianMs(CANDIDATES, 5);

    expect(lastRanked.length).toBe(CANDIDATES);
    const visible = lastRanked.filter((entry) => entry.light.visible);
    const shining = lastRanked.filter((entry) => entry.light.intensity > 0);

    // Exactly VISIBLE_COUNT of the far-oversubscribed candidates stay
    // visible, and no more than LIVE_BUDGET actually shine, proving the
    // budgets were really applied against a genuinely oversubscribed set
    // (CANDIDATES >> VISIBLE_COUNT >> LIVE_BUDGET) rather than a no-op.
    expect(visible.length).toBe(VISIBLE_COUNT);
    expect(shining.length).toBeGreaterThan(0);
    expect(shining.length).toBeLessThanOrEqual(LIVE_BUDGET);
  });
});
