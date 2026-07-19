import { describe, expect, it } from 'vitest';
import { MOBS } from '../src/sim/data';
import { createMob } from '../src/sim/entity';
import { Sim } from '../src/sim/sim';
import type { Entity } from '../src/sim/types';

// Regression coverage for the post-mitigation damage pipeline (combat/damage.ts):
// dealDamage's amp/absorb/duel/arena routing + threat fan-out, and the death
// teardown handleDeath. mob_update_perf/aura_tick_perf budget the tick's AI and
// aura phases; neither exercises the actual damage-application hot path a big
// simultaneous melee/spell trade drives every tick in a real raid pull. This file
// times dealDamage/handleDeath DIRECTLY (they are not tick-phase-lapped
// individually), mirroring the "call the function in a tight loop" recipe the task
// sanctions when a function is not naturally tick-driven.

const WORLD_SEED = 20063;
const CLUSTER = { x: 0, z: 60 };

type AnySim = Sim & Record<string, any>;

// Build `count` player/mob melee pairs clustered together (a worst-case raid pull
// shape: every pair trades damage in the same tick). Huge maxHp on both sides so a
// non-lethal damage wave never kills anyone mid-measurement.
function buildPairs(count: number): { sim: AnySim; players: Entity[]; mobs: Entity[] } {
  const sim = new Sim({ seed: WORLD_SEED, playerClass: 'warrior', noPlayer: true }) as AnySim;
  const players: Entity[] = [];
  const mobs: Entity[] = [];
  const template = MOBS.forest_wolf;
  for (let i = 0; i < count; i++) {
    const pid = sim.addPlayer('warrior', `Trader${i}`);
    const p = sim.entities.get(pid);
    if (!p) continue;
    p.pos.x = CLUSTER.x + (i % 20) * 0.5;
    p.pos.z = CLUSTER.z + Math.floor(i / 20) * 0.5;
    p.prevPos = { ...p.pos };
    p.maxHp = 1_000_000;
    p.hp = p.maxHp;
    players.push(p);

    const mob = createMob(sim.nextId++, template, template.maxLevel, { ...p.pos });
    mob.maxHp = 1_000_000;
    mob.hp = mob.maxHp;
    mob.inCombat = true;
    mob.aiState = 'attack';
    mob.aggroTargetId = pid;
    mob.leashAnchor = { ...p.pos };
    mob.spawnPos = { ...p.pos };
    sim.addEntity(mob);
    mobs.push(mob);
  }
  return { sim, players, mobs };
}

// One "wave" = every pair trades one melee hit each direction (player -> mob and
// mob -> player), the shape of a full simultaneous-swing tick in a dense pull.
function dealWave(sim: AnySim, players: Entity[], mobs: Entity[]): void {
  for (let i = 0; i < players.length; i++) {
    sim.dealDamage(players[i], mobs[i], 40, false, 'physical', 'Test Swing', 'hit', true);
    sim.dealDamage(mobs[i], players[i], 25, false, 'physical', 'Test Bite', 'hit', true);
  }
}

function measureWaveMedian(pairCount: number): { median: number; sim: AnySim } {
  const { sim, players, mobs } = buildPairs(pairCount);
  for (let i = 0; i < 10; i++) dealWave(sim, players, mobs);

  const MEASURE = 60;
  const samples: number[] = [];
  for (let i = 0; i < MEASURE; i++) {
    const t0 = performance.now();
    dealWave(sim, players, mobs);
    samples.push(performance.now() - t0);
  }
  samples.sort((a, b) => a - b);
  return { median: samples[Math.floor(samples.length / 2)], sim };
}

describe('dealDamage/handleDeath high-load regression budget', () => {
  it('bounds a simultaneous melee-trade wave at a fixed population', () => {
    const PAIRS = 200;
    const { median } = measureWaveMedian(PAIRS);

    console.log(`[dealDamage perf] pairs=${PAIRS} median=${median.toFixed(2)}ms`);

    // Generous by design (see mob_update_perf.test.ts / aura_tick_perf.test.ts): a
    // healthy median at this population is a low single-digit ms figure; 25ms
    // leaves ample headroom for slow/contended CI hardware under one 20 Hz tick
    // (50ms) while still catching a sustained order-of-magnitude regression.
    expect(median).toBeLessThan(25);
  }, 60_000);

  it('doubling the pair count does not more than roughly double the wave cost', () => {
    const SMALL = 100;
    const LARGE = SMALL * 2;

    const { median: smallMedian } = measureWaveMedian(SMALL);
    const { median: largeMedian } = measureWaveMedian(LARGE);

    console.log(
      `[dealDamage perf] scaling small=${SMALL}(${smallMedian.toFixed(2)}ms) ` +
        `large=${LARGE}(${largeMedian.toFixed(2)}ms) ratio=${(largeMedian / Math.max(smallMedian, 0.001)).toFixed(2)}x`,
    );

    // A doubled pair count doing genuinely linear per-pair work should land near
    // 2x; the bound is set generously above that (3.5x) to absorb noise at these
    // small absolute ms magnitudes while still failing hard on quadratic blowup.
    expect(largeMedian).toBeLessThan(Math.max(smallMedian * 3.5, 5));
  }, 60_000);

  it('bounds a simultaneous lethal wave (handleDeath fan-out) and proves real deaths happened', () => {
    const PAIRS = 150;
    const { sim, players, mobs } = buildPairs(PAIRS);
    // Warm up the non-lethal path first so the death wave measures only the death
    // teardown cost, not JIT warmup noise.
    for (let i = 0; i < 10; i++) dealWave(sim, players, mobs);

    const t0 = performance.now();
    for (let i = 0; i < mobs.length; i++) {
      sim.dealDamage(players[i], mobs[i], 10_000_000, false, 'physical', 'Killshot', 'hit', true);
    }
    const elapsed = performance.now() - t0;

    let dead = 0;
    for (const m of mobs) if (m.dead) dead++;

    console.log(
      `[handleDeath perf] pairs=${PAIRS} dead=${dead}/${mobs.length} elapsed=${elapsed.toFixed(2)}ms`,
    );

    // Shape sanity: every mob in the cluster actually died this wave, so the
    // budget below is not passing vacuously against an empty scenario. Pinned
    // to the literal PAIRS (not mobs.length) so a build that collapses the
    // roster to zero cannot pass 0 === 0.
    expect(mobs.length).toBe(PAIRS);
    expect(dead).toBe(PAIRS);

    // Generous absolute budget for one simultaneous kill-everything wave.
    expect(elapsed).toBeLessThan(150);
  }, 60_000);
});
