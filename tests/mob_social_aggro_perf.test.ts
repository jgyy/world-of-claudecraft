// Perf/regression budget for mob/social_aggro.ts (rallyFleeingAllies) at dense mob
// packs: many idle same-family mobs sit within FLEE_HELP_RADIUS of a fleeing mob, so
// every flee tick's grid query has to walk a crowded local cell. Mirrors the
// measurement recipe in tests/mob_update_perf.test.ts / tests/aura_tick_perf.test.ts:
// warm up, sample many iterations, take the MEDIAN, assert a generous absolute budget
// plus a scaling check.
//
// rallyFleeingAllies is a SimContext-seam function, not wired to a named sim.tick()
// perfLap phase, so this file calls it directly in a loop against a real Sim's ctx,
// exactly like tests/social_aggro.test.ts does.
import { describe, expect, it } from 'vitest';
import { FLEE_HELP_RADIUS, rallyFleeingAllies } from '../src/sim/mob/social_aggro';
import { Sim } from '../src/sim/sim';
import type { Entity } from '../src/sim/types';

const WORLD_SEED = 20064;
const FAMILY_TEMPLATE = 'gravecaller_cultist';

// biome-ignore lint/suspicious/noExplicitAny: mirrors the (sim as any).ctx idiom used throughout tests/social_aggro.test.ts to reach the SimContext seam.
const ctxOf = (sim: Sim): any => (sim as any).ctx;

// Build a fleeing mob plus `count` idle same-family allies packed WITHIN
// FLEE_HELP_RADIUS of it (the worst case: every ally is a real rally candidate the
// grid query must actually visit and re-validate), and a target for the rally to
// aggro onto.
function buildDensePack(count: number): {
  sim: Sim;
  fleer: Entity;
  target: Entity;
  allies: Entity[];
} {
  const sim = new Sim({ seed: WORLD_SEED, playerClass: 'warrior', noPlayer: true });
  const pid = sim.addPlayer('warrior', 'Target');
  const target = sim.entities.get(pid) as Entity;
  target.pos = { x: 0, y: 0, z: 0 };
  target.prevPos = { ...target.pos };

  const fleer = [...sim.entities.values()].find((e) => e.kind === 'mob') as Entity;
  fleer.templateId = FAMILY_TEMPLATE;
  fleer.hostile = true;
  fleer.dead = false;
  fleer.pos = { x: 3, y: 0, z: 0 };
  fleer.prevPos = { ...fleer.pos };

  const allies: Entity[] = [];
  for (let i = 0; i < count; i++) {
    const ang = (i / count) * Math.PI * 2;
    const r = (FLEE_HELP_RADIUS - 0.5) * ((i % 5) / 5 + 0.1);
    const id = sim.nextId++;
    const entity: Entity = JSON.parse(JSON.stringify(fleer));
    entity.id = id;
    entity.pos = { x: fleer.pos.x + Math.sin(ang) * r, y: 0, z: fleer.pos.z + Math.cos(ang) * r };
    entity.prevPos = { ...entity.pos };
    entity.spawnPos = { ...entity.pos };
    entity.templateId = FAMILY_TEMPLATE;
    entity.hostile = true;
    entity.dead = false;
    entity.aiState = 'idle';
    entity.aggroTargetId = null;
    entity.ownerId = null;
    entity.threat = new Map();
    sim.addEntity(entity);
    allies.push(entity);
  }
  sim.grid.refresh(sim.entities.values());
  return { sim, fleer, target, allies };
}

function resetIdle(allies: Entity[]): void {
  for (const a of allies) {
    a.aiState = 'idle';
    a.aggroTargetId = null;
    a.inCombat = false;
    a.threat.clear();
  }
}

function measureRallyMedian(count: number, samples: number): { median: number; pulled: number } {
  const { sim, fleer, target, allies } = buildDensePack(count);
  const ctx = ctxOf(sim);

  // Warm up.
  for (let i = 0; i < 5; i++) {
    resetIdle(allies);
    rallyFleeingAllies(ctx, fleer, target);
  }

  const times: number[] = [];
  let lastPulled = 0;
  for (let i = 0; i < samples; i++) {
    resetIdle(allies);
    const start = performance.now();
    lastPulled = rallyFleeingAllies(ctx, fleer, target);
    times.push(performance.now() - start);
  }
  times.sort((a, b) => a - b);
  return { median: times[Math.floor(times.length / 2)], pulled: lastPulled };
}

describe('mob social aggro (rallyFleeingAllies) high-load regression budget', () => {
  it('bounds the per-call cost of a rally against a dense local pack', () => {
    const COUNT = 200;
    const { median, pulled } = measureRallyMedian(COUNT, 60);

    console.log(
      `[social_aggro.rally perf] pack=${COUNT} pulled=${pulled} median=${median.toFixed(3)}ms`,
    );

    // Generous by design (see mob_update_perf.test.ts): a single flee-tick rally call
    // against a dense local pack is a sub-millisecond grid query in the healthy case;
    // 10ms leaves ample headroom for slow/contended CI hardware while still catching a
    // sustained order-of-magnitude regression.
    expect(median).toBeLessThan(10);
  }, 60_000);

  it('doubling the dense pack size does not more than roughly double the rally cost', () => {
    const SMALL = 100;
    const LARGE = SMALL * 2;

    const small = measureRallyMedian(SMALL, 40);
    const large = measureRallyMedian(LARGE, 40);

    console.log(
      `[social_aggro.rally perf] scaling small=${SMALL}(${small.median.toFixed(3)}ms) ` +
        `large=${LARGE}(${large.median.toFixed(3)}ms) ` +
        `ratio=${(large.median / Math.max(small.median, 0.0001)).toFixed(2)}x`,
    );

    // A doubled pack doing genuinely linear grid-query work should land near 2x; the
    // bound is set generously above that (3.5x) to absorb noise at small absolute ms
    // magnitudes while still failing hard on an O(n^2) regression (e.g. the radius
    // query degrading into a full-entity scan).
    expect(large.median).toBeLessThan(Math.max(small.median * 3.5, 2));
  }, 60_000);

  it('actually rallies the whole dense local pack in one call (shape sanity)', () => {
    const COUNT = 200;
    const { sim, fleer, target, allies } = buildDensePack(COUNT);
    const ctx = ctxOf(sim);
    expect(allies.length).toBe(COUNT);

    const pulled = rallyFleeingAllies(ctx, fleer, target);

    // Every idle same-family ally within FLEE_HELP_RADIUS should have been pulled onto
    // the target in one call: proves the worst-case dense-pack shape was really built,
    // not a scattered or empty one.
    expect(pulled).toBe(COUNT);
    for (const a of allies) {
      expect(a.aiState).toBe('chase');
      expect(a.aggroTargetId).toBe(target.id);
    }
  });
});
