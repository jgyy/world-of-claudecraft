import { describe, expect, it } from 'vitest';
import { nameplatePlanInto, newNameplatePlan } from '../src/render/nameplate_view';
import type { Entity } from '../src/sim/types';

// Perf-budget coverage for the render-side hot path: nameplate_view.ts's
// nameplatePlanInto runs once PER VISIBLE ENTITY, PER FRAME (the painter drives
// it from renderer.sync()). tests/nameplate_view.test.ts pins its DECISIONS;
// this file pins its COST at crowd scale (a dense raid/crowd scene), which is
// the actual FPS-relevant question the sim-side perf suite (mob_update_perf,
// aura_tick_perf) does not answer: those bound server tick cost, not the
// per-frame render-side work that competes with draw calls for the frame budget.
//
// Recipe mirrors tests/mob_update_perf.test.ts / tests/aura_tick_perf.test.ts:
// warm up, sample many calls, take the median (rejects one-off GC/scheduler
// spikes from co-running Vitest workers), assert a generous absolute budget
// plus a doubling-population scaling check.

const PLAYER_ID = 1;

function makeEntity(id: number, x: number, z: number): Entity {
  return {
    id,
    kind: id % 5 === 0 ? 'player' : 'mob',
    templateId: 'forest_wolf',
    pos: { x, y: 0, z },
    prevPos: { x, y: 0, z },
    facing: 0,
    prevFacing: 0,
    scale: 1,
    dead: false,
    lootable: false,
    dungeonId: null,
    overheadEmoteId: null,
    castingAbility: null,
    aggroTargetId: id % 3 === 0 ? PLAYER_ID : null,
    ownerId: null,
    targetId: null,
    comboPoints: 0,
  } as unknown as Entity;
}

function makeViewer(): Entity {
  return {
    id: PLAYER_ID,
    kind: 'player',
    pos: { x: 0, y: 0, z: 0 },
    dead: false,
    targetId: 2,
    comboPoints: 3,
  } as unknown as Entity;
}

// Dense crowd: entities packed within nameplate range around the viewer, the
// worst case for the per-frame nameplate pass (a raid stack or town crowd).
function buildCrowd(count: number): Entity[] {
  const entities: Entity[] = [];
  for (let i = 0; i < count; i++) {
    const ang = (i / count) * Math.PI * 2;
    const r = 2 + (i % 20);
    entities.push(makeEntity(i + 2, Math.sin(ang) * r, Math.cos(ang) * r));
  }
  return entities;
}

function measurePlanMedianMs(count: number): number {
  const player = makeViewer();
  const entities = buildCrowd(count);
  // One reused plan per entity, mirroring the painter's per-entity out-param
  // reuse contract (allocation-light per nameplate_view.ts's header comment).
  const plans = entities.map(() => newNameplatePlan());

  const runOnce = (): void => {
    for (let i = 0; i < entities.length; i++) {
      nameplatePlanInto(plans[i], entities[i], player, 2, true, false);
    }
  };

  for (let i = 0; i < 10; i++) runOnce();

  const SAMPLES = 60;
  const samples: number[] = [];
  for (let i = 0; i < SAMPLES; i++) {
    const t0 = performance.now();
    runOnce();
    samples.push(performance.now() - t0);
  }
  samples.sort((a, b) => a - b);
  return samples[Math.floor(samples.length / 2)];
}

describe('nameplate_view perf: nameplatePlanInto crowd cost', () => {
  it('bounds the per-frame cost of planning a dense crowd of nameplates', () => {
    const COUNT = 300;
    const median = measurePlanMedianMs(COUNT);

    console.log(`[nameplate_view perf] entities=${COUNT} median=${median.toFixed(3)}ms`);

    // Generous by design (see mob_update_perf.test.ts): observed healthy median
    // for 300 pure per-entity decisions is a small fraction of a ms; 5ms leaves
    // ample headroom for slow/contended CI hardware while still catching an
    // order-of-magnitude regression well inside a 16.6ms (60fps) frame budget.
    expect(median).toBeLessThan(5);
  }, 30_000);

  it('doubling the crowd does not more than roughly double the plan cost', () => {
    const SMALL = 200;
    const LARGE = SMALL * 2;

    const smallMedian = measurePlanMedianMs(SMALL);
    const largeMedian = measurePlanMedianMs(LARGE);

    console.log(
      `[nameplate_view perf] scaling small=${SMALL}(${smallMedian.toFixed(3)}ms) ` +
        `large=${LARGE}(${largeMedian.toFixed(3)}ms) ` +
        `ratio=${(largeMedian / Math.max(smallMedian, 0.001)).toFixed(2)}x`,
    );

    // Linear-per-entity work doubling should land near 2x; bound set generously
    // (3.5x, matching aura_tick_perf's scaling check) to absorb noise at these
    // small absolute ms magnitudes while still failing hard on an accidental
    // O(n^2) regression (e.g. a nested scan added across the crowd).
    expect(largeMedian).toBeLessThan(Math.max(smallMedian * 3.5, 0.5));
  }, 30_000);

  it('actually built a dense, mixed-kind worst-case crowd (shape sanity)', () => {
    const entities = buildCrowd(300);
    expect(entities.length).toBe(300);
    const mobs = entities.filter((e) => e.kind === 'mob').length;
    const players = entities.filter((e) => e.kind === 'player').length;
    expect(mobs).toBeGreaterThan(0);
    expect(players).toBeGreaterThan(0);
    // Every entity really sits within nameplate range of the viewer (worst case).
    const player = makeViewer();
    const plans = entities.map((e) =>
      nameplatePlanInto(newNameplatePlan(), e, player, 2, true, false),
    );
    const visible = plans.filter((p) => !p.hidden).length;
    expect(visible).toBeGreaterThan(200);
  });
});
