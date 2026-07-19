// Perf budget for src/sim/mob/targeting.ts updateMobTarget in isolation, at very
// deep hate tables. Complements tests/mob_update_perf.test.ts (which budgets the
// WHOLE mob.update pipeline: targeting + movement + melee, at ~100-entry tables)
// by isolating JUST target selection at a much deeper table (500+ entries), the
// same fake-SimContext harness tests/mob_targeting.test.ts uses for its
// correctness pins. Mirrors the measurement recipe from mob_update_perf.test.ts and
// tests/aura_tick_perf.test.ts: warm up, sample many iterations, sort, gate on the
// MEDIAN.

import { describe, expect, it } from 'vitest';
import { createMobScanCounters } from '../src/sim/mob/scan_counters';
import { updateMobTarget } from '../src/sim/mob/targeting';
import type { SimContext } from '../src/sim/sim_context';
import { type Entity, MELEE_RANGE } from '../src/sim/types';

function ent(id: number, over: Partial<Entity> = {}): Entity {
  return {
    id,
    dead: false,
    pos: { x: 0, y: 0, z: 0 },
    level: 1,
    templateId: 'forest_wolf',
    ownerId: null,
    scale: 1,
    aiState: 'attack',
    inCombat: true,
    despawnTimer: undefined,
    aggroTargetId: null,
    forcedTargetId: null,
    forcedTargetTimer: 0,
    shuffleTargetTimer: 0,
    threat: new Map<number, number>(),
    ...over,
  } as unknown as Entity;
}

function fakeCtx(entities: Map<number, Entity>): SimContext {
  return {
    entities,
    mobScanCounters: createMobScanCounters(),
    rng: { int: () => 0 },
    nythraxisAddFallbackTarget: () => null,
    scheduleNythraxisAddDespawnIfBossReset: () => false,
  } as unknown as SimContext;
}

const MELEE_OUT = MELEE_RANGE * 1.2 + 10; // outside melee reach: exercises the 130% ranged branch

// Builds a mob with a `depth`-entry hate table (descending threat, so
// updateMobTarget's candidate scan can never short-circuit on `t <= bestT`) and
// a matching entities map, each attacker standing outside melee range so every
// candidate walks the ranged-switch-threshold branch.
function buildDeepPull(depth: number): { ctx: SimContext; mob: Entity } {
  const entities = new Map<number, Entity>();
  const threat = new Map<number, number>();
  for (let i = 0; i < depth; i++) {
    const id = i + 1;
    entities.set(id, ent(id, { pos: { x: MELEE_OUT + i * 0.01, y: 0, z: 0 } }));
    // Descending threat: entry 1 has the highest value, matching the current
    // target, so the scan visits every remaining entry looking for a switch.
    threat.set(id, depth - i);
  }
  const mob = ent(depth + 1, { pos: { x: 0, y: 0, z: 0 }, aggroTargetId: 1, threat });
  return { ctx: fakeCtx(entities), mob };
}

function measureMedian(depth: number, sampleCalls: number): number {
  const { ctx, mob } = buildDeepPull(depth);

  // Warm up.
  for (let i = 0; i < 20; i++) updateMobTarget(ctx, mob);

  const samples: number[] = [];
  for (let i = 0; i < sampleCalls; i++) {
    const start = performance.now();
    updateMobTarget(ctx, mob);
    samples.push(performance.now() - start);
  }
  samples.sort((a, b) => a - b);
  return samples[Math.floor(samples.length / 2)];
}

describe('mob targeting (updateMobTarget) high-depth regression budget', () => {
  it('bounds per-call cost of updateMobTarget at 500+ hate-table entries', () => {
    const DEPTH = 512;
    const median = measureMedian(DEPTH, 60);

    console.log(`[mob targeting perf] depth=${DEPTH} median=${median.toFixed(3)}ms`);

    // updateMobTarget's candidate scan is a single linear pass over the hate
    // table; the healthy median at this depth is well under a ms. 5ms leaves
    // generous headroom for slow/contended CI hardware while still catching an
    // order-of-magnitude regression (e.g. a nested scan added per candidate).
    expect(median).toBeLessThan(5);
  }, 60_000);

  it('doubling hate-table depth does not more than roughly double per-call cost', () => {
    const SMALL = 500;
    const LARGE = SMALL * 2;

    const smallMedian = measureMedian(SMALL, 40);
    const largeMedian = measureMedian(LARGE, 40);

    console.log(
      `[mob targeting perf] scaling small=${SMALL}(${smallMedian.toFixed(3)}ms) ` +
        `large=${LARGE}(${largeMedian.toFixed(3)}ms) ` +
        `ratio=${(largeMedian / Math.max(smallMedian, 0.001)).toFixed(2)}x`,
    );

    // A single linear scan over the hate table should land near 2x when the
    // table doubles; the bound sits generously above that to absorb noise at
    // small absolute ms magnitudes while still failing hard on a regression that
    // turns the per-entry cost itself table-size-dependent (O(n^2)).
    expect(largeMedian).toBeLessThan(Math.max(smallMedian * 3.5, 2));
  }, 60_000);

  it('shape sanity: the hate table is 500+ entries deep and every candidate is out of melee', () => {
    const DEPTH = 512;
    const { ctx, mob } = buildDeepPull(DEPTH);
    expect(mob.threat.size).toBe(DEPTH);
    let outOfMelee = 0;
    for (const [id] of mob.threat) {
      const e = ctx.entities.get(id);
      if (e && Math.hypot(e.pos.x - mob.pos.x, e.pos.z - mob.pos.z) > MELEE_RANGE * 1.2)
        outOfMelee++;
    }
    expect(outOfMelee).toBe(DEPTH);
  });
});
