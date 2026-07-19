// Perf regression coverage for the ground-hazard and in-flight-projectile per-tick hot
// paths: tickGroundAoEs (src/sim/entity_roster.ts, phase tag 'groundAoEs') and
// advancePendingProjectiles (src/sim/projectile_travel.ts, phase tag 'projectiles'). Both
// walk their respective array unconditionally every tick regardless of population, so a
// large simultaneous pile of long-lived ground zones plus many homing bolts in flight at
// once (a big raid pull spamming AoE zones and ranged casts) is the worst case. Mirrors the
// canonical recipe in tests/mob_update_perf.test.ts / tests/aura_tick_perf.test.ts: warm
// up, sample MEASURE_TICKS ticks, take the median, assert an absolute budget plus a
// scaling bound.

import { describe, expect, it } from 'vitest';
import { MOBS } from '../src/sim/data';
import { createMob } from '../src/sim/entity';
import type { GroundAoE } from '../src/sim/entity_roster';
import type { PendingProjectile } from '../src/sim/projectile_travel';
import { Sim } from '../src/sim/sim';
import type { SimContext } from '../src/sim/sim_context';

const WORLD_SEED = 20067;
const CLUSTER = { x: 0, z: 60 };

function ctxOf(sim: Sim): SimContext {
  return (sim as unknown as { ctx: SimContext }).ctx;
}

// Build `zones` long-lived ground AoE hazards (a raid-wide zone spam shape: interval far
// longer than the measurement window so most ticks are the plain per-tick decrement/scan,
// not a pulse) rooted on real, live entities so tickGroundAoEs' persistentSource lookups
// resolve every tick, plus `bolts` homing projectiles in flight between real entities
// placed far enough apart that none lands during the measurement window.
function buildAoeAndProjectilePileup(sim: Sim, zones: number, bolts: number): void {
  const ctx = ctxOf(sim);
  const template = MOBS.forest_wolf;
  const sources: number[] = [];
  for (let i = 0; i < Math.max(zones, 1); i++) {
    const ang = (i / (zones + 1)) * Math.PI * 2;
    const pos = sim.groundPos(
      CLUSTER.x + Math.sin(ang) * (5 + (i % 7)),
      CLUSTER.z + Math.cos(ang) * (5 + (i % 7)),
    );
    const mob = createMob(sim.nextId++, template, template.maxLevel, pos);
    mob.maxHp = 1_000_000;
    mob.hp = mob.maxHp;
    sim.addEntity(mob);
    sources.push(mob.id);
  }

  for (let i = 0; i < zones; i++) {
    const sourceId = sources[i % sources.length];
    const source = sim.entities.get(sourceId);
    if (!source) continue;
    const effect: GroundAoE = {
      sourceId,
      pos: { ...source.pos },
      radius: 8,
      min: 1,
      max: 1,
      remaining: 9999,
      interval: 9999,
      tickTimer: 9999,
      school: 'fire',
      ability: 'Perf Zone',
    };
    ctx.groundAoEs.push(effect);
  }

  // Two anchor mobs placed far apart (150 yd, well outside the ~700 yd/tick*70 tick
  // homing budget's landing distance for this measurement window) so every bolt keeps
  // homing (never within PROJECTILE_REACH) for the whole warm-up + measurement run,
  // instead of landing and dropping out of ctx.pendingProjectiles mid-sample.
  if (bolts > 0) {
    const anchorA = createMob(
      sim.nextId++,
      template,
      template.maxLevel,
      sim.groundPos(CLUSTER.x - 75, CLUSTER.z),
    );
    const anchorB = createMob(
      sim.nextId++,
      template,
      template.maxLevel,
      sim.groundPos(CLUSTER.x + 75, CLUSTER.z),
    );
    anchorA.maxHp = 1_000_000;
    anchorA.hp = anchorA.maxHp;
    anchorB.maxHp = 1_000_000;
    anchorB.hp = anchorB.maxHp;
    sim.addEntity(anchorA);
    sim.addEntity(anchorB);
    for (let i = 0; i < bolts; i++) {
      const fromA = i % 2 === 0;
      const source = fromA ? anchorA : anchorB;
      const targetId = fromA ? anchorB.id : anchorA.id;
      const proj: PendingProjectile = {
        x: source.pos.x,
        z: source.pos.z,
        sourceId: source.id,
        targetId,
        ttl: 9999,
        resolve: () => {},
      };
      ctx.pendingProjectiles.push(proj);
    }
  }
}

function measurePhaseMedian(
  phase: 'groundAoEs' | 'projectiles',
  zones: number,
  bolts: number,
): { median: number; count: number } {
  const sim = new Sim({ seed: WORLD_SEED, playerClass: 'warrior', noPlayer: true });
  buildAoeAndProjectilePileup(sim, zones, bolts);

  let mark = 0;
  let phaseThisTick = 0;
  const lap = (p: string): void => {
    const t = performance.now();
    const dt = t - mark;
    if (p === phase) phaseThisTick += dt;
    mark = t;
  };
  (sim as unknown as { cfg: { perfLap: typeof lap } }).cfg.perfLap = lap;

  for (let i = 0; i < 10; i++) sim.tick();

  const MEASURE_TICKS = 60;
  const samples: number[] = [];
  for (let i = 0; i < MEASURE_TICKS; i++) {
    phaseThisTick = 0;
    mark = performance.now();
    sim.tick();
    samples.push(phaseThisTick);
  }
  samples.sort((a, b) => a - b);
  const median = samples[Math.floor(samples.length / 2)];

  const ctx = ctxOf(sim);
  const count = phase === 'groundAoEs' ? ctx.groundAoEs.length : ctx.pendingProjectiles.length;
  return { median, count };
}

describe('ground AoE (groundAoEs) high-load regression budget', () => {
  it('bounds the per-tick ground-hazard scan cost at a fixed large zone count', () => {
    const ZONES = 300;
    const { median, count } = measurePhaseMedian('groundAoEs', ZONES, 0);

    console.log(`[groundAoEs perf] zones=${count} median=${median.toFixed(2)}ms`);

    // Generous by design (see mob_update_perf.test.ts): observed healthy median at this
    // population is a low single-digit ms figure; 20ms leaves ample headroom for
    // slow/contended CI hardware under one 20 Hz tick (50ms) while still catching an
    // order-of-magnitude sustained regression.
    expect(median).toBeLessThan(20);
  }, 60_000);

  it('doubling the zone count does not more than roughly double the scan cost', () => {
    // tickGroundAoEs walks every hazard unconditionally each tick; a regression that
    // turns any per-zone step into a scan over every OTHER zone would blow past 2x
    // scaling long before either sample alone crosses a ceiling generous enough to
    // avoid CI flakiness.
    const SMALL = 150;
    const LARGE = SMALL * 2;

    const small = measurePhaseMedian('groundAoEs', SMALL, 0);
    const large = measurePhaseMedian('groundAoEs', LARGE, 0);

    console.log(
      `[groundAoEs perf] scaling small=${SMALL}(${small.median.toFixed(2)}ms) ` +
        `large=${LARGE}(${large.median.toFixed(2)}ms) ` +
        `ratio=${(large.median / Math.max(small.median, 0.001)).toFixed(2)}x`,
    );

    expect(large.median).toBeLessThan(Math.max(small.median * 3.5, 5));
  }, 60_000);

  it('actually built the large ground-hazard pile-up (shape sanity)', () => {
    const ZONES = 300;
    const { count } = measurePhaseMedian('groundAoEs', ZONES, 0);
    expect(count).toBe(ZONES);
  }, 60_000);
});

describe('in-flight projectiles (projectiles) high-load regression budget', () => {
  it('bounds the per-tick homing-advance cost at a fixed large in-flight count', () => {
    const BOLTS = 300;
    const { median, count } = measurePhaseMedian('projectiles', 0, BOLTS);

    console.log(`[projectiles perf] bolts=${count} median=${median.toFixed(2)}ms`);

    expect(median).toBeLessThan(20);
  }, 60_000);

  it('doubling the in-flight bolt count does not more than roughly double the advance cost', () => {
    // advancePendingProjectiles walks every in-flight bolt unconditionally each tick; a
    // regression that turns the per-bolt homing step into a scan over every OTHER bolt
    // would blow past 2x scaling long before either sample alone crosses a ceiling
    // generous enough to avoid CI flakiness.
    const SMALL = 150;
    const LARGE = SMALL * 2;

    const small = measurePhaseMedian('projectiles', 0, SMALL);
    const large = measurePhaseMedian('projectiles', 0, LARGE);

    console.log(
      `[projectiles perf] scaling small=${SMALL}(${small.median.toFixed(2)}ms) ` +
        `large=${LARGE}(${large.median.toFixed(2)}ms) ` +
        `ratio=${(large.median / Math.max(small.median, 0.001)).toFixed(2)}x`,
    );

    expect(large.median).toBeLessThan(Math.max(small.median * 3.5, 5));
  }, 60_000);

  it('actually built the large in-flight-bolt pile-up (shape sanity)', () => {
    const BOLTS = 300;
    const { count } = measurePhaseMedian('projectiles', 0, BOLTS);
    // Bolts never land (targets are stationary mobs far enough apart, ttl huge), so the
    // in-flight count should still equal the population built.
    expect(count).toBe(BOLTS);
  }, 60_000);
});
