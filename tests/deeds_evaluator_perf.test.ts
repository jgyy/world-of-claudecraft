import { describe, expect, it } from 'vitest';
import { markDeedsDirty, updateDeeds } from '../src/sim/deeds';
import { Sim } from '../src/sim/sim';

const WORLD_SEED = 20072;

// Regression coverage this file adds: updateDeeds is the Book of Deeds tick-tail
// evaluator, run over dirty players only (per the module's own doc comment). A
// raid-wide event (a world-boss kill, a zone-wide buff) can call markDeedsDirty on
// every online player in the same tick via the generic (full-pass) mark path, which is
// the worst case for the evaluator: every dirty player re-walks the whole non-manual
// deed catalog. Nothing today budgets that one-tick fan-out, nor its scaling with the
// number of players marked dirty at once. This mirrors the mob_update_perf/
// aura_tick_perf recipe: measure via cfg.perfLap's 'deeds' phase tag (the exact tag
// sim.tick() reports for updateDeeds at the tick tail), across MEASURE_TICKS ticks,
// each tick re-dirtying every player so the evaluator always has full-catalog work to
// do (never an idle Set-size check).

function buildDirtyRoster(sim: Sim, count: number): number[] {
  const pids: number[] = [];
  for (let i = 0; i < count; i++) {
    const pid = sim.addPlayer('warrior', `Raider${i}`);
    // Spread some real progress across players so the catalog walk finds live
    // predicates to check (not just level-1 defaults sitting on their earliest gates).
    sim.setPlayerLevel(5 + (i % 15), pid);
    pids.push(pid);
  }
  return pids;
}

function measureDeedsPhaseMedian(playerCount: number): {
  median: number;
  sim: Sim;
  pids: number[];
} {
  const sim = new Sim({ seed: WORLD_SEED, playerClass: 'warrior', noPlayer: true });
  const pids = buildDirtyRoster(sim, playerCount);

  let mark = 0;
  let deedsPhaseThisTick = 0;
  const lap = (phase: string): void => {
    const t = performance.now();
    const dt = t - mark;
    if (phase === 'deeds') deedsPhaseThisTick += dt;
    mark = t;
  };
  (sim as unknown as { cfg: { perfLap: typeof lap } }).cfg.perfLap = lap;

  // Warm up: let the first pass grant whatever it will grant so subsequent ticks
  // measure steady-state re-check cost, not one-off first-grant work.
  for (const pid of pids) markDeedsDirty(sim.ctx, pid);
  for (let i = 0; i < 5; i++) sim.tick();

  const MEASURE_TICKS = 60;
  const samples: number[] = [];
  for (let i = 0; i < MEASURE_TICKS; i++) {
    // Re-dirty the whole roster every tick: the raid-wide-event worst case, a full
    // pass over the non-manual catalog for every player, every tick.
    for (const pid of pids) markDeedsDirty(sim.ctx, pid);
    deedsPhaseThisTick = 0;
    mark = performance.now();
    sim.tick();
    samples.push(deedsPhaseThisTick);
  }
  samples.sort((a, b) => a - b);
  return { median: samples[Math.floor(samples.length / 2)], sim, pids };
}

describe('deeds evaluator (updateDeeds tick-tail) high-load regression budget', () => {
  it('bounds the per-tick cost of a raid-wide dirty-everyone event', () => {
    const COUNT = 200;
    const { median } = measureDeedsPhaseMedian(COUNT);

    console.log(`[deeds evaluator perf] dirtyPlayers=${COUNT} median=${median.toFixed(2)}ms`);

    // Generous by design (see mob_update_perf.test.ts): a full non-manual catalog walk
    // per dirty player is proportional to the deed count, not entity population, so a
    // healthy median at this population is a low single-digit ms figure; 40ms leaves
    // ample headroom under one 20 Hz tick (50ms) while still catching an
    // order-of-magnitude sustained regression.
    expect(median).toBeLessThan(40);
  }, 60_000);

  it('doubling the dirty-player count does not more than roughly double the phase cost', () => {
    const SMALL = 100;
    const LARGE = SMALL * 2;

    const smallResult = measureDeedsPhaseMedian(SMALL);
    const largeResult = measureDeedsPhaseMedian(LARGE);

    console.log(
      `[deeds evaluator perf] scaling small=${SMALL}players(${smallResult.median.toFixed(2)}ms) ` +
        `large=${LARGE}players(${largeResult.median.toFixed(2)}ms) ` +
        `ratio=${(largeResult.median / Math.max(smallResult.median, 0.001)).toFixed(2)}x`,
    );

    // A doubled dirty-player count doing genuinely linear (per-player) work should land
    // near 2x; the bound is set generously above that (3.5x) to absorb noise at these
    // small absolute ms magnitudes while still failing hard on a quadratic blowup (e.g.
    // a future cross-player scan sneaking into the evaluator).
    expect(largeResult.median).toBeLessThan(Math.max(smallResult.median * 3.5, 5));
  }, 60_000);

  it('actually built and evaluated the dirty-everyone worst case (shape sanity)', () => {
    const COUNT = 150;
    const sim = new Sim({ seed: WORLD_SEED + 1, playerClass: 'warrior', noPlayer: true });
    const pids = buildDirtyRoster(sim, COUNT);
    for (const pid of pids) markDeedsDirty(sim.ctx, pid);
    expect(sim.ctx.deedDirtyPids.size).toBe(COUNT);
    updateDeeds(sim.ctx);
    // Every player evacuates the dirty set once its pass resolves (updateDeeds
    // deletes each pid as it finishes, even without a grant).
    expect(sim.ctx.deedDirtyPids.size).toBe(0);
    let anyDeedsEarned = 0;
    for (const pid of pids) {
      const meta = sim.players.get(pid);
      if (meta && meta.deedsEarned.size > 0) anyDeedsEarned++;
    }
    // A spread of levels 5..19 should earn at least some level/progression deeds for
    // a good fraction of the roster, proving the evaluator actually granted, not just
    // walked the catalog and found nothing.
    expect(anyDeedsEarned).toBeGreaterThan(0);
  });
});
