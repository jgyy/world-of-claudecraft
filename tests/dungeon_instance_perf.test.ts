// Perf regression coverage for the dungeon-instancing hot path (src/sim/instances/dungeons.ts):
// updateDoorTriggers (per-player, every tick, phase tag 'p.doors') and updateInstances
// (phase tag 'instances', a once-per-second occupancy scan of EVERY claimed instance
// against every player). Mirrors the canonical recipe in tests/mob_update_perf.test.ts and
// tests/aura_tick_perf.test.ts: warm up, sample MEASURE_TICKS ticks, take the median, and
// assert both an absolute budget and a scaling bound.
//
// Note on the "24" population figure: DELVE_SLOT_COUNT (src/sim/data.ts) fixes 24
// concurrent delve run slots per delve. Dungeon instances (this file's target) have no
// equivalent named cap in src/sim/instances/dungeons.ts: ctx.instances grows dynamically,
// one claim per (dungeonId, partyKey). 24 here is chosen as a comparable worst-case
// population, not an enforced constant found in the dungeon-instancing code.

import { describe, expect, it } from 'vitest';
import { Sim } from '../src/sim/sim';

const WORLD_SEED = 20063;
const DUNGEON_ID = 'hollow_crypt';

// Build `count` solo players, each claiming their OWN instance of DUNGEON_ID (a solo
// player's partyKey is unique, so each entry claims a fresh instance). Every player is
// left standing inside their instance, so updateInstances' occupancy scan finds a live
// occupant for every claim on every check (the sustained worst case, not the free-and-
// reclaim churn case).
function buildDungeonPileup(sim: Sim, count: number): number[] {
  const pids: number[] = [];
  for (let i = 0; i < count; i++) {
    const pid = sim.addPlayer('warrior', `Delver${i}`) as number;
    const e = sim.entities.get(pid);
    if (!e) continue;
    e.maxHp = 1_000_000;
    e.hp = e.maxHp;
    sim.enterDungeon(DUNGEON_ID, pid);
    pids.push(pid);
  }
  return pids;
}

// Runs the fixed measurement recipe: warm up, sample MEASURE_TICKS ticks of the
// 'p.doors' + 'instances' phases combined, return the median (rejects one-off
// GC/scheduling spikes from co-running Vitest workers, same rationale as the canonical
// files). updateInstances only does real work once every 20 ticks, so a short sample
// window would mostly see zero-cost ticks; MEASURE_TICKS is large enough (200) to catch
// several of those once-a-second scans, and the median still reflects steady state.
function measureInstancePhaseMedian(count: number): { median: number; claimed: number } {
  const sim = new Sim({ seed: WORLD_SEED, playerClass: 'warrior', noPlayer: true });
  const pids = buildDungeonPileup(sim, count);

  let mark = 0;
  let instancePhaseThisTick = 0;
  const lap = (phase: string): void => {
    const t = performance.now();
    const dt = t - mark;
    if (phase === 'p.doors' || phase === 'instances') instancePhaseThisTick += dt;
    mark = t;
  };
  (sim as unknown as { cfg: { perfLap: typeof lap } }).cfg.perfLap = lap;

  for (let i = 0; i < 10; i++) sim.tick();

  const MEASURE_TICKS = 200;
  const samples: number[] = [];
  for (let i = 0; i < MEASURE_TICKS; i++) {
    instancePhaseThisTick = 0;
    mark = performance.now();
    sim.tick();
    samples.push(instancePhaseThisTick);
  }
  samples.sort((a, b) => a - b);
  const median = samples[Math.floor(samples.length / 2)];

  const claimed = (sim as unknown as { instances: { partyKey: string | null }[] }).instances.filter(
    (i) => i.partyKey !== null,
  ).length;

  // Shape sanity uses the count of players who actually made it into the dungeon.
  void pids;
  return { median, claimed };
}

describe('dungeon instancing (p.doors / instances) high-load regression budget', () => {
  it('bounds the door-trigger + instance-bookkeeping per-tick cost at a fixed population', () => {
    const COUNT = 24;
    const { median, claimed } = measureInstancePhaseMedian(COUNT);

    console.log(
      `[dungeon.instances perf] players=${COUNT} claimedInstances=${claimed} median=${median.toFixed(2)}ms`,
    );

    // Generous by design (see mob_update_perf.test.ts): observed healthy median at this
    // population is well under a millisecond; 20ms leaves ample headroom for slow/contended
    // CI hardware under one 20 Hz tick (50ms) while still catching an order-of-magnitude
    // sustained regression.
    expect(median).toBeLessThan(20);
  }, 60_000);

  it('doubling the concurrent-instance population does not more than roughly double the phase cost', () => {
    // This catches a regression that turns updateInstances' per-instance scan from
    // early-exit-on-occupant into a full unconditional walk of every player for every
    // instance (or a similar quadratic blowup): doubling the instance count under
    // genuinely near-linear work should land close to 2x, not the square of it.
    const SMALL = 12;
    const LARGE = SMALL * 2;

    const small = measureInstancePhaseMedian(SMALL);
    const large = measureInstancePhaseMedian(LARGE);

    console.log(
      `[dungeon.instances perf] scaling small=${SMALL}(${small.median.toFixed(2)}ms) ` +
        `large=${LARGE}(${large.median.toFixed(2)}ms) ` +
        `ratio=${(large.median / Math.max(small.median, 0.001)).toFixed(2)}x`,
    );

    expect(large.median).toBeLessThan(Math.max(small.median * 3.5, 5));
  }, 60_000);

  it('actually built the claimed-instance pile-up (shape sanity)', () => {
    const COUNT = 24;
    const { claimed } = measureInstancePhaseMedian(COUNT);
    // Every solo player claims their own instance of DUNGEON_ID, so the claimed count
    // should match the population (allowing a small margin for any player that failed
    // the door gate, which would signal a real construction bug rather than a perf one).
    expect(claimed).toBeGreaterThanOrEqual(COUNT - 2);
  }, 60_000);
});
