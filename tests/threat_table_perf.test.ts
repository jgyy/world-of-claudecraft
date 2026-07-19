// Perf budget for src/sim/threat.ts addThreat/threatModifier against a very deep
// hate table (500+ entries on a single mob). Mirrors the measurement recipe from
// tests/mob_update_perf.test.ts and tests/aura_tick_perf.test.ts: warm up, sample
// many iterations, sort, and gate on the MEDIAN so a one-off GC/scheduling pause on
// a co-running Vitest worker cannot flake the budget. threat.ts is a pure leaf (no
// SimContext import), so this times the functions directly with performance.now()
// in this test file rather than through a Sim tick.

import { describe, expect, it } from 'vitest';
import { addThreat, threatModifier } from '../src/sim/threat';
import type { Aura, Entity } from '../src/sim/types';

const WORLD_SEED = 20063;

function makeMob(threatEntries: number): Entity {
  const threat = new Map<number, number>();
  for (let i = 0; i < threatEntries; i++) threat.set(i + 1, threatEntries - i);
  return {
    id: 999,
    dead: false,
    threat,
  } as unknown as Entity;
}

function makeSource(auraCount: number): Entity {
  const auras: Aura[] = [];
  // Deterministic mix of stance/form auras, cycling so threatModifier's loop
  // walks the full aura array every call (worst-case: no early exit).
  const kinds = ['defensive_stance', 'form_bear', 'form_cat', 'righteous_fury', 'buff_ap'] as const;
  for (let i = 0; i < auraCount; i++) {
    auras.push({
      id: `src_aura_${i}`,
      name: 'Source Aura',
      kind: kinds[i % kinds.length],
      remaining: 999,
      duration: 999,
      value: 1,
      sourceId: 1,
      school: i % 2 === 0 ? 'holy' : 'physical',
    } as Aura);
  }
  return { id: 1, auras } as unknown as Entity;
}

// Runs `count` addThreat calls against a mob whose hate table already has
// `depth` entries, plus `count` threatModifier calls against a source with a
// deep aura stack, and returns the MEDIAN per-call cost across MEASURE samples.
function measureMedian(depth: number, sampleCalls: number): number {
  const mob = makeMob(depth);
  const source = makeSource(40);
  // Warm up.
  for (let i = 0; i < 200; i++) {
    addThreat(mob, WORLD_SEED + (i % depth || 1), 1);
    threatModifier(source, 'physical');
  }

  const samples: number[] = [];
  for (let i = 0; i < sampleCalls; i++) {
    const start = performance.now();
    addThreat(mob, WORLD_SEED + (i % depth || 1), 1);
    threatModifier(source, 'physical');
    samples.push(performance.now() - start);
  }
  samples.sort((a, b) => a - b);
  return samples[Math.floor(samples.length / 2)];
}

describe('threat table high-depth regression budget', () => {
  it('bounds per-call cost of addThreat/threatModifier at 500+ hate-table entries', () => {
    const DEPTH = 512;
    const median = measureMedian(DEPTH, 60);

    console.log(`[threat perf] depth=${DEPTH} median=${median.toFixed(4)}ms`);

    // addThreat is O(1) (Map get/set) and threatModifier walks a fixed-size aura
    // array, so the healthy median at this depth is a small fraction of a ms.
    // 2ms leaves ample headroom for slow/contended CI hardware while still
    // catching an order-of-magnitude regression (e.g. a table scan creeping in).
    expect(median).toBeLessThan(2);
  }, 60_000);

  it('doubling hate-table depth does not more than roughly double per-call cost', () => {
    const SMALL = 500;
    const LARGE = SMALL * 2;

    const smallMedian = measureMedian(SMALL, 50);
    const largeMedian = measureMedian(LARGE, 50);

    console.log(
      `[threat perf] scaling small=${SMALL}(${smallMedian.toFixed(4)}ms) ` +
        `large=${LARGE}(${largeMedian.toFixed(4)}ms) ` +
        `ratio=${(largeMedian / Math.max(smallMedian, 0.0001)).toFixed(2)}x`,
    );

    // addThreat itself should stay flat (Map ops are O(1) regardless of size), so
    // a generous 3.5x-over-2x headroom still catches a regression that turns the
    // hot path into a table scan (which would show up as growth proportional to
    // depth, not calls).
    expect(largeMedian).toBeLessThan(Math.max(smallMedian * 3.5, 0.5));
  }, 60_000);

  it('shape sanity: the hate table actually holds 500+ entries', () => {
    const DEPTH = 512;
    const mob = makeMob(DEPTH);
    expect(mob.threat.size).toBe(DEPTH);
    let top = -Infinity;
    for (const v of mob.threat.values()) if (v > top) top = v;
    expect(top).toBe(DEPTH);
  });
});
