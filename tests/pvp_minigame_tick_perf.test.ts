import { describe, expect, it } from 'vitest';
import { Sim } from '../src/sim/sim';
import { startFiestaPractice } from '../src/sim/social/fiesta_bots';
import type { Entity } from '../src/sim/types';

const WORLD_SEED = 20067;

// Seat FULL lobbies for all three PvP minigame drivers in one Sim: 2v2 Fiesta
// (1 real host + 3 offline bots, src/sim/social/fiesta_bots.ts), a 5v5 Vale Cup
// practice pitch (1 real host + 9 offline bots, src/sim/social/vale_cup_bots.ts),
// and a 5v5 Protect Yumi match (10 real players; Yumi has no offline-bot
// harness, so a full real lobby stands in). This is the worst-case per-tick
// shape: every minigame's active driver running in the same tick, each at its
// maximum concurrent-player count.
//
// Lap-tag note: sim.ts tags 'arena' around updateArena(), which internally
// drives BOTH fiesta (ctx.updateFiestaActive) and yumi (ctx.updateYumiActive)
// for their whole match lifetime; neither gets its own dedicated lap tag. Vale
// Cup gets its own 'valecup' tag. So this file attributes fiesta+yumi cost to
// 'arena' and vale cup cost to 'valecup', per the task brief's fallback: time
// around the relevant lap tag(s) directly rather than inventing new sim taps.
const YUMI_CLASSES = [
  'warrior',
  'mage',
  'rogue',
  'priest',
  'hunter',
  'druid',
  'warlock',
  'shaman',
  'paladin',
  'warrior',
] as const;

function buildFullLobbies(sim: Sim): { fiestaHost: number; vcHost: number; yumiHosts: number[] } {
  const fiestaHost = sim.addPlayer('warrior', 'FiestaHost');
  expect(startFiestaPractice(sim)).toBe(true);

  const vcHost = sim.addPlayer('paladin', 'VcHost');
  sim.vcupPracticeStart(5, vcHost);
  sim.vcupReady(vcHost); // bots auto-ready; skip the 30s human briefing wait

  const yumiHosts = YUMI_CLASSES.map((cls, i) => sim.addPlayer(cls, `Yumi${i}`));
  for (const pid of yumiHosts) sim.arenaQueueJoin(pid, 'yumi5');

  return { fiestaHost, vcHost, yumiHosts };
}

// A second lobby-building recipe for the SCALING test only: the offline
// fiesta-practice harness (startFiestaPractice) is a per-Sim SINGLETON (one
// dev practice set at a time, keyed off sim.primaryId), so it cannot be
// stacked to build multiple concurrent fiesta lobbies in one Sim. Real 2v2
// Fiesta queuing has no such limit (up to ARENA_SLOT_COUNT concurrent
// matches share the arena slot pool with 1v1/2v2), so this recipe seats four
// real players into their own fiesta match instead of one host + bots. Vale
// Cup practice and Yumi already support multiple concurrent lobbies as-is.
function buildFullLobbiesReal(
  sim: Sim,
  idx: number,
): { fiestaHosts: number[]; vcHost: number; yumiHosts: number[] } {
  const fiestaHosts = [0, 1, 2, 3].map((i) => sim.addPlayer('warrior', `Fiesta${idx}_${i}`));
  for (const pid of fiestaHosts) sim.arenaQueueJoin(pid, 'fiesta');

  const vcHost = sim.addPlayer('paladin', `VcHost${idx}`);
  sim.vcupPracticeStart(5, vcHost);
  sim.vcupReady(vcHost); // bots auto-ready; skip the 30s human briefing wait

  const yumiHosts = YUMI_CLASSES.map((cls, i) => sim.addPlayer(cls, `Yumi${idx}_${i}`));
  for (const pid of yumiHosts) sim.arenaQueueJoin(pid, 'yumi5');

  return { fiestaHosts, vcHost, yumiHosts };
}

// Run ticks until all three matches report an active/live state, or give up
// after a generous ceiling (the countdown/backfill windows are a handful of
// seconds of sim time at 20 Hz).
function runUntilAllLive(
  sim: Sim,
  ids: { fiestaHost: number; vcHost: number; yumiHosts: number[] },
): void {
  runUntilAllLiveGeneric(sim, [ids.fiestaHost], ids.vcHost, ids.yumiHosts[0]);
}

function runUntilAllLiveGeneric(
  sim: Sim,
  fiestaWatchPids: number[],
  vcHost: number,
  yumiWatchPid: number,
): void {
  const MAX_TICKS = 20 * 30;
  for (let i = 0; i < MAX_TICKS; i++) {
    sim.tick();
    const fiestaActive = fiestaWatchPids.every((pid) => sim.arenaMatchFor(pid)?.state === 'active');
    const yumiActive = sim.arenaMatchFor(yumiWatchPid)?.state === 'active';
    const vcActive = sim.vcup.practices.some(
      (m) => m.practice?.ownerPid === vcHost && m.phase === 'active',
    );
    if (fiestaActive && yumiActive && vcActive) return;
  }
}

function medianOf(samples: number[]): number {
  const sorted = [...samples].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

// Sample MEASURE_TICKS ticks, summing the named lap phase(s) per tick, and
// return the median (mirrors mob_update_perf.test.ts / aura_tick_perf.test.ts).
function measurePhaseMedians(
  sim: Sim,
  measureTicks: number,
): { arena: number; valecup: number; arenaTotal: number; valecupTotal: number } {
  let mark = 0;
  let arenaThisTick = 0;
  let valecupThisTick = 0;
  let arenaTotal = 0;
  let valecupTotal = 0;
  const lap = (phase: string, _entity?: Entity): void => {
    const t = performance.now();
    const dt = t - mark;
    if (phase === 'arena') {
      arenaThisTick += dt;
      arenaTotal += dt;
    }
    if (phase === 'valecup') {
      valecupThisTick += dt;
      valecupTotal += dt;
    }
    mark = t;
  };
  (sim as unknown as { cfg: { perfLap: typeof lap } }).cfg.perfLap = lap;

  const arenaSamples: number[] = [];
  const valecupSamples: number[] = [];
  for (let i = 0; i < measureTicks; i++) {
    arenaThisTick = 0;
    valecupThisTick = 0;
    mark = performance.now();
    sim.tick();
    arenaSamples.push(arenaThisTick);
    valecupSamples.push(valecupThisTick);
  }
  return {
    arena: medianOf(arenaSamples),
    valecup: medianOf(valecupSamples),
    arenaTotal,
    valecupTotal,
  };
}

function buildLiveWorld(): {
  sim: Sim;
  ids: { fiestaHost: number; vcHost: number; yumiHosts: number[] };
} {
  const sim = new Sim({ seed: WORLD_SEED, playerClass: 'warrior', noPlayer: true });
  const ids = buildFullLobbies(sim);
  runUntilAllLive(sim, ids);
  return { sim, ids };
}

describe('PvP minigame per-tick drivers high-load regression budget', () => {
  it('bounds one full tick of fiesta+yumi ("arena") and vale cup ("valecup") driver cost at full lobbies', () => {
    const { sim } = buildLiveWorld();
    const MEASURE_TICKS = 100;
    const { arena, valecup, arenaTotal, valecupTotal } = measurePhaseMedians(sim, MEASURE_TICKS);

    console.log(
      `[pvp minigame tick perf] arenaMedian(fiesta+yumi)=${arena.toFixed(3)}ms ` +
        `valecupMedian=${valecup.toFixed(3)}ms`,
    );

    // Instrumentation contract: the phase-matching lap hook is installed through an
    // `as unknown as` cast, so a phase-string rename in sim.ts (e.g. 'arena' or
    // 'valecup' renamed) keeps this file compiling while the accumulator silently
    // stays 0 and the budget assertions below would pass vacuously. Guard explicitly.
    expect(arenaTotal).toBeGreaterThan(0);
    expect(valecupTotal).toBeGreaterThan(0);

    // Generous by design (see mob_update_perf.test.ts): a single full 2v2
    // Fiesta + one 5v5 Yumi match is a fixed, small (<=14) fighter population,
    // so the healthy per-tick cost of updateArena() is a fraction of a ms; Vale
    // Cup's ball-physics + bot-steering pass over one 5v5 pitch is similarly
    // small. 15ms per phase leaves ample CI headroom (well under one 20 Hz
    // tick's 50ms budget) while still catching an order-of-magnitude sustained
    // regression.
    expect(arena).toBeLessThan(15);
    expect(valecup).toBeLessThan(15);
  }, 60_000);

  it('doubling the number of concurrent full lobbies does not more than roughly double per-tick driver cost', () => {
    // The check a flat ceiling alone cannot provide: these drivers iterate
    // their own match set each tick (ctx.arenaMatches for fiesta/yumi, vc.match
    // + vc.practices for Vale Cup), so healthy cost should scale close to
    // linearly with the number of CONCURRENT full lobbies, never superlinearly.
    function measureWithLobbySets(count: number): {
      arena: number;
      valecup: number;
      arenaTotal: number;
      valecupTotal: number;
    } {
      const sim = new Sim({ seed: WORLD_SEED + 1, playerClass: 'warrior', noPlayer: true });
      const idSets: { fiestaHosts: number[]; vcHost: number; yumiHosts: number[] }[] = [];
      for (let i = 0; i < count; i++) idSets.push(buildFullLobbiesReal(sim, i));
      for (const ids of idSets) {
        runUntilAllLiveGeneric(sim, ids.fiestaHosts, ids.vcHost, ids.yumiHosts[0]);
      }
      return measurePhaseMedians(sim, 60);
    }

    // ARENA_SLOT_COUNT and YUMI_MAZE_SLOT_COUNT are both 4 (src/sim/data.ts):
    // fiesta and yumi share a small fixed slot pool, so LARGE_SETS must stay
    // within it for every set to actually go live concurrently.
    const SMALL_SETS = 2;
    const LARGE_SETS = SMALL_SETS * 2;
    const small = measureWithLobbySets(SMALL_SETS);
    const large = measureWithLobbySets(LARGE_SETS);

    console.log(
      `[pvp minigame tick perf] scaling small=${SMALL_SETS}lobbies` +
        `(arena=${small.arena.toFixed(3)}ms valecup=${small.valecup.toFixed(3)}ms) ` +
        `large=${LARGE_SETS}lobbies(arena=${large.arena.toFixed(3)}ms valecup=${large.valecup.toFixed(3)}ms) ` +
        `arenaRatio=${(large.arena / Math.max(small.arena, 0.001)).toFixed(2)}x ` +
        `valecupRatio=${(large.valecup / Math.max(small.valecup, 0.001)).toFixed(2)}x`,
    );

    expect(small.arenaTotal).toBeGreaterThan(0);
    expect(small.valecupTotal).toBeGreaterThan(0);
    expect(large.arenaTotal).toBeGreaterThan(0);
    expect(large.valecupTotal).toBeGreaterThan(0);

    // A doubled concurrent-lobby count doing genuinely linear per-match work
    // should land near 2x; the bound is set generously above that (3.5x,
    // mirroring aura_tick_perf.test.ts) to absorb noise at these small absolute
    // ms magnitudes while still failing hard on superlinear blowup.
    expect(large.arena).toBeLessThan(Math.max(small.arena * 3.5, 5));
    expect(large.valecup).toBeLessThan(Math.max(small.valecup * 3.5, 5));
  }, 60_000);

  it('actually seated full lobbies (2v2 fiesta, 5v5 vale cup, 5v5 yumi) before measuring', () => {
    const { sim, ids } = buildLiveWorld();

    const fiestaMatch = sim.arenaMatchFor(ids.fiestaHost);
    expect(fiestaMatch).toBeTruthy();
    expect(fiestaMatch?.state).toBe('active');
    expect(fiestaMatch?.teamA.length).toBe(2);
    expect(fiestaMatch?.teamB.length).toBe(2);
    expect(sim.fiestaBotPids.length).toBe(3);

    const yumiMatch = sim.arenaMatchFor(ids.yumiHosts[0]);
    expect(yumiMatch).toBeTruthy();
    expect(yumiMatch?.state).toBe('active');
    expect(yumiMatch?.teamA.length).toBe(5);
    expect(yumiMatch?.teamB.length).toBe(5);

    const vcMatch = sim.vcup.practices.find((m) => m.practice?.ownerPid === ids.vcHost);
    expect(vcMatch).toBeTruthy();
    expect(vcMatch?.phase).toBe('active');
    expect(vcMatch?.teamA.length).toBe(5);
    expect(vcMatch?.teamB.length).toBe(5);
  }, 30_000);
});
