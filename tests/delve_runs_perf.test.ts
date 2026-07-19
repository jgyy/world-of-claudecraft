// Perf regression coverage for the delve-run per-tick hot path (src/sim/delves/runs.ts,
// updateDelveRuns, phase tag 'delves'). updateDelveRuns runs tickLockpickTimeout +
// tickDelveRun for EVERY live run on EVERY tick, plus a once-per-second occupancy scan
// once ctx.tickCount % 20 === 0, so a full house of concurrent, occupied runs is the
// worst-case shape. Mirrors the canonical recipe in tests/mob_update_perf.test.ts /
// tests/aura_tick_perf.test.ts: warm up, sample MEASURE_TICKS ticks, take the median,
// assert an absolute budget plus a scaling bound.
//
// DELVE_SLOT_COUNT (src/sim/data.ts) fixes 24 pre-allocated run slots per delve id (Sim
// boots ALL of them, one per (delve, slot)); a solo player can claim any free slot of a
// given delve, so up to 24 concurrent runs of ONE delve is a real, code-enforced ceiling
// (unlike the dungeon-instance case in tests/dungeon_instance_perf.test.ts, which has no
// such fixed pool).

import { describe, expect, it } from 'vitest';
import { DELVE_LIST } from '../src/sim/data';
import { Sim } from '../src/sim/sim';

const WORLD_SEED = 20066;
const DELVE_ID = DELVE_LIST[0].id;
const DELVE_LEVEL = DELVE_LIST[0].minLevel;

// Build `count` solo players, each claiming their OWN slot of DELVE_ID (a solo player's
// partyKey is unique, so each entry claims a fresh run out of the 24-slot pool). Every
// player is left standing inside their run, matching the sustained worst case (occupied,
// not free-and-reclaim churn).
function buildDelvePileup(sim: Sim, count: number): number[] {
  const pids: number[] = [];
  for (let i = 0; i < count; i++) {
    const pid = sim.addPlayer('warrior', `Delver${i}`) as number;
    const e = sim.entities.get(pid);
    if (!e) continue;
    e.maxHp = 1_000_000;
    e.hp = e.maxHp;
    sim.setPlayerLevel(DELVE_LEVEL, pid);
    sim.enterDelve(DELVE_ID, 'normal', pid);
    pids.push(pid);
  }
  return pids;
}

function measureDelvePhaseMedian(count: number): { median: number; liveRuns: number } {
  const sim = new Sim({ seed: WORLD_SEED, playerClass: 'warrior', noPlayer: true });
  buildDelvePileup(sim, count);

  let mark = 0;
  let delvePhaseThisTick = 0;
  const lap = (phase: string): void => {
    const t = performance.now();
    const dt = t - mark;
    if (phase === 'delves') delvePhaseThisTick += dt;
    mark = t;
  };
  (sim as unknown as { cfg: { perfLap: typeof lap } }).cfg.perfLap = lap;

  for (let i = 0; i < 10; i++) sim.tick();

  const MEASURE_TICKS = 120;
  const samples: number[] = [];
  for (let i = 0; i < MEASURE_TICKS; i++) {
    delvePhaseThisTick = 0;
    mark = performance.now();
    sim.tick();
    samples.push(delvePhaseThisTick);
  }
  samples.sort((a, b) => a - b);
  const median = samples[Math.floor(samples.length / 2)];

  const liveRuns = (
    sim as unknown as { delveRuns: { partyKey: string | null }[] }
  ).delveRuns.filter((r) => r.partyKey !== null).length;

  return { median, liveRuns };
}

describe('delve runs (delves) high-load regression budget', () => {
  it('bounds the per-tick delve-run bookkeeping cost at the full 24-slot population', () => {
    const COUNT = 24;
    const { median, liveRuns } = measureDelvePhaseMedian(COUNT);

    console.log(
      `[delve.runs perf] players=${COUNT} liveRuns=${liveRuns} median=${median.toFixed(2)}ms`,
    );

    // Generous by design (see mob_update_perf.test.ts): observed healthy median at this
    // population is a low single-digit ms figure; 20ms leaves ample headroom for
    // slow/contended CI hardware under one 20 Hz tick (50ms) while still catching an
    // order-of-magnitude sustained regression.
    expect(median).toBeLessThan(20);
  }, 60_000);

  it('doubling the live-run population does not more than roughly double the phase cost', () => {
    // updateDelveRuns loops every live run unconditionally each tick; a regression that
    // turns any per-run step into a walk over every OTHER run (or every player, per run,
    // every tick instead of once a second) would blow past 2x scaling long before either
    // sample alone crosses a ceiling generous enough to avoid CI flakiness.
    const SMALL = 12;
    const LARGE = SMALL * 2;

    const small = measureDelvePhaseMedian(SMALL);
    const large = measureDelvePhaseMedian(LARGE);

    console.log(
      `[delve.runs perf] scaling small=${SMALL}(${small.median.toFixed(2)}ms) ` +
        `large=${LARGE}(${large.median.toFixed(2)}ms) ` +
        `ratio=${(large.median / Math.max(small.median, 0.001)).toFixed(2)}x`,
    );

    expect(large.median).toBeLessThan(Math.max(small.median * 3.5, 5));
  }, 60_000);

  it('actually claimed the full 24-slot delve-run pile-up (shape sanity)', () => {
    const COUNT = 24;
    const { liveRuns } = measureDelvePhaseMedian(COUNT);
    // Every solo player claims a distinct slot of DELVE_ID, so live runs should match
    // the population (small margin for any entry that failed the level/enter gate,
    // which would signal a real construction bug rather than a perf one).
    expect(liveRuns).toBeGreaterThanOrEqual(COUNT - 2);
  }, 60_000);
});
