import { describe, expect, it } from 'vitest';
import { Sim } from '../src/sim/sim';
import type { SimContext } from '../src/sim/sim_context';
import { matchmakeArena1v1 } from '../src/sim/social/arena';

const WORLD_SEED = 20065;

// Build `count` solo players queued for ranked 1v1, each an alive standalone
// entity outside any instance (the only two live-checks matchmakeArena1v1's
// queue filter needs). This is the worst-case ranked-ladder shape: a deep,
// unmatchable-until-close-rating queue the matchmaker has to rating-scan.
function buildRankedLadder(sim: Sim, count: number): number[] {
  const pids: number[] = [];
  for (let i = 0; i < count; i++) {
    const pid = sim.addPlayer('warrior', `Ladder${i}`);
    sim.arenaQueueJoin(pid, '1v1');
    pids.push(pid);
  }
  return pids;
}

function medianOf(samples: number[]): number {
  const sorted = [...samples].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

// Run one matchmaking PASS directly against the exported system function
// (mirrors mob_update_perf.test.ts's use of the real code path, not sim.tick(),
// so the arena slot cap can't starve later samples of free slots): matchmakeArena1v1
// filters the whole queue, then rating-scans it for the closest pair, both O(queue
// length). ctx.arenaQueue1v1 is reset to a fresh `count`-length queue before every
// timed call so every sample measures the SAME population, regardless of how many
// pairs the previous call matched off and however many arena slots are free.
function measurePassMedian(count: number, samples: number): number {
  const sim = new Sim({ seed: WORLD_SEED, playerClass: 'warrior', noPlayer: true });
  const pids = buildRankedLadder(sim, count);
  const ctx = sim.ctx;

  const times: number[] = [];
  for (let i = 0; i < samples; i++) {
    ctx.arenaQueue1v1 = [...pids];
    const start = performance.now();
    matchmakeArena1v1(ctx);
    times.push(performance.now() - start);
  }
  return medianOf(times);
}

describe('arena ranked-ladder matchmaking-pass high-load regression budget', () => {
  it('bounds one matchmaking pass cost against a large queued ranked ladder', () => {
    const LADDER = 400;
    const SAMPLES = 50;
    const median = measurePassMedian(LADDER, SAMPLES);

    console.log(`[arena matchmaking perf] ladder=${LADDER} median=${median.toFixed(3)}ms`);

    // Generous by design (see mob_update_perf.test.ts): matchmakeArena1v1 does a
    // full O(queue) liveness filter plus an O(queue) closest-rating scan per
    // match it forms (bounded by ARENA_SLOT_COUNT), so the healthy cost at 400
    // queued players is a fraction of a ms; 15ms leaves ample CI headroom while
    // still catching an order-of-magnitude sustained regression.
    expect(median).toBeLessThan(15);
  }, 60_000);

  it('doubling the queued ladder does not more than roughly double one pass cost', () => {
    // The check a flat ceiling alone cannot provide: a regression that turns
    // the per-pass O(queue) rating scan into an O(queue^2) walk (e.g. losing
    // the single-nearest-gap tracking and rescanning per candidate) shows up
    // here as superlinear growth long before either sample alone crosses an
    // absolute ceiling generous enough to avoid CI flakiness.
    const SMALL = 200;
    const LARGE = SMALL * 2;
    const SAMPLES = 40;

    const smallMedian = measurePassMedian(SMALL, SAMPLES);
    const largeMedian = measurePassMedian(LARGE, SAMPLES);

    console.log(
      `[arena matchmaking perf] scaling small=${SMALL}(${smallMedian.toFixed(3)}ms) ` +
        `large=${LARGE}(${largeMedian.toFixed(3)}ms) ` +
        `ratio=${(largeMedian / Math.max(smallMedian, 0.001)).toFixed(2)}x`,
    );

    // A doubled queue doing genuinely linear per-pass work should land near 2x;
    // the bound is set generously above that (3.5x, mirroring
    // aura_tick_perf.test.ts) to absorb noise at these small absolute ms
    // magnitudes while still failing hard on quadratic blowup.
    expect(largeMedian).toBeLessThan(Math.max(smallMedian * 3.5, 5));
  }, 60_000);

  it('actually built the large queued ranked ladder it claims to measure', () => {
    const sim = new Sim({ seed: WORLD_SEED + 2, playerClass: 'warrior', noPlayer: true });
    const LADDER = 400;
    const pids = buildRankedLadder(sim, LADDER);
    const ctx: SimContext = sim.ctx;

    expect(pids.length).toBe(LADDER);
    expect(ctx.arenaQueue1v1.length).toBe(LADDER);
    for (const pid of pids) expect(ctx.arenaQueue1v1.includes(pid)).toBe(true);
  });
});
