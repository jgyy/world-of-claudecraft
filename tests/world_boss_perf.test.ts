// Perf regression coverage for the world boss per-tick scheduler (src/sim/world_boss.ts,
// driven by Sim.updateWorldBosses, phase tag 'worldBosses'). scaleWorldBossHp derives the
// participant count from the boss's hate table every tick the boss is alive, so a large
// zerg all tagging the boss (a realistic full-server pull) is the worst-case shape. Mirrors
// the canonical recipe in tests/mob_update_perf.test.ts / tests/aura_tick_perf.test.ts:
// warm up, sample MEASURE_TICKS ticks, take the median, assert an absolute budget plus a
// scaling bound.

import { describe, expect, it } from 'vitest';
import { Sim } from '../src/sim/sim';
import type { Entity } from '../src/sim/types';
import { WORLD_BOSSES } from '../src/sim/world_boss';

const WORLD_SEED = 20064;
const BOSS_ID = WORLD_BOSSES[0].templateId;

function findBoss(sim: Sim): Entity {
  const boss = [...(sim as unknown as { entities: Map<number, Entity> }).entities.values()].find(
    (e) => e.templateId === BOSS_ID && !e.dead,
  );
  if (!boss) throw new Error('world boss did not spawn at boot');
  return boss;
}

// Build a zerg of `count` players, all tagged onto the world boss's hate table (the
// full-server-pull shape scaleWorldBossHp's participant scan has to walk every tick).
// Huge maxHp keeps the zerg alive for the whole measurement window regardless of boss
// swings; the boss never actually dies so the corpse-timer branch stays untouched.
function buildZerg(sim: Sim, count: number): { boss: Entity; players: number } {
  const boss = findBoss(sim);
  let placed = 0;
  for (let i = 0; i < count; i++) {
    const pid = sim.addPlayer('warrior', `Zerg${i}`) as number;
    const e = sim.entities.get(pid);
    if (!e) continue;
    e.maxHp = 1_000_000;
    e.hp = e.maxHp;
    boss.threat.set(pid, count - i);
    placed++;
  }
  boss.inCombat = true;
  return { boss, players: placed };
}

function measureWorldBossPhaseMedian(count: number): { median: number; participants: number } {
  const sim = new Sim({
    seed: WORLD_SEED,
    playerClass: 'warrior',
    noPlayer: true,
    worldBossAtBoot: true,
  });
  // worldBossAtBoot only arms the scheduler to fire on the first tick, so tick once
  // before the boss is queryable (mirrors tests/world_boss.test.ts's spawnBossNow).
  sim.tick();
  const { boss } = buildZerg(sim, count);

  let mark = 0;
  let phaseThisTick = 0;
  const lap = (phase: string): void => {
    const t = performance.now();
    const dt = t - mark;
    if (phase === 'worldBosses') phaseThisTick += dt;
    mark = t;
  };
  (sim as unknown as { cfg: { perfLap: typeof lap } }).cfg.perfLap = lap;

  for (let i = 0; i < 10; i++) sim.tick();

  const MEASURE_TICKS = 120;
  const samples: number[] = [];
  for (let i = 0; i < MEASURE_TICKS; i++) {
    phaseThisTick = 0;
    mark = performance.now();
    sim.tick();
    samples.push(phaseThisTick);
  }
  samples.sort((a, b) => a - b);
  const median = samples[Math.floor(samples.length / 2)];

  return { median, participants: boss.threat.size };
}

describe('world boss (worldBosses) high-load regression budget', () => {
  it('bounds the per-tick scheduler cost at a fixed full-server-zerg population', () => {
    const COUNT = 200;
    const { median, participants } = measureWorldBossPhaseMedian(COUNT);

    console.log(
      `[worldBoss perf] zerg=${COUNT} threatParticipants=${participants} median=${median.toFixed(2)}ms`,
    );

    // Generous by design (see mob_update_perf.test.ts): observed healthy median at this
    // population is a low single-digit ms figure; 20ms leaves ample headroom for
    // slow/contended CI hardware under one 20 Hz tick (50ms) while still catching an
    // order-of-magnitude sustained regression.
    expect(median).toBeLessThan(20);
  }, 60_000);

  it('doubling the zerg size does not more than roughly double the phase cost', () => {
    // scaleWorldBossHp derives its participant count from a Set built off the boss's
    // hate table each tick; a regression that turns that dedupe/sort into something
    // quadratic in participant count would blow past 2x scaling long before either
    // sample alone crosses a ceiling generous enough to avoid CI flakiness.
    const SMALL = 100;
    const LARGE = SMALL * 2;

    const small = measureWorldBossPhaseMedian(SMALL);
    const large = measureWorldBossPhaseMedian(LARGE);

    console.log(
      `[worldBoss perf] scaling small=${SMALL}(${small.median.toFixed(2)}ms) ` +
        `large=${LARGE}(${large.median.toFixed(2)}ms) ` +
        `ratio=${(large.median / Math.max(small.median, 0.001)).toFixed(2)}x`,
    );

    expect(large.median).toBeLessThan(Math.max(small.median * 3.5, 5));
  }, 60_000);

  it('actually built the full-zerg contributor pile-up (shape sanity)', () => {
    const COUNT = 200;
    const { participants } = measureWorldBossPhaseMedian(COUNT);
    expect(participants).toBe(COUNT);
  }, 60_000);
});
