import { describe, expect, it } from 'vitest';
import { FIRST_TALENT_LEVEL, TALENTS } from '../src/sim/content/talents';
import { Sim } from '../src/sim/sim';

const WORLD_SEED = 20066;
const ACTIVITY = 'hollow_crypt_normal'; // levels 7-10, FIVE_MAN (1 tank/1 healer/3 dps)
const QUEUE_LEVEL = 7;

function dpsSpecId(): string {
  const specs = TALENTS.mage?.specs ?? [];
  const spec = specs.find((s) => s.role === 'dps');
  if (!spec) throw new Error('no dps spec for mage');
  return spec.id;
}

// Queue `count` solo dps-only mages for the automatic role queue. Every unit
// wants exactly one role (dps) that hollow_crypt_normal only has THREE seats
// for; the queue can never fully drain (no tanks/healers ever join), so the
// deterministic matcher (runMatching -> tryAssemble) is forced to walk the
// full unmatchable queue on every pass. This is the worst-case automatic-queue
// shape: a large role-imbalanced backlog, the way a lopsided realm looks
// during off-peak hours when only dps queue.
function buildDpsBacklog(sim: Sim, count: number): number[] {
  const pids: number[] = [];
  const specId = dpsSpecId();
  for (let i = 0; i < count; i++) {
    const pid = sim.addPlayer('mage', `Dps${i}`);
    sim.setPlayerLevel(QUEUE_LEVEL, pid);
    if (QUEUE_LEVEL >= FIRST_TALENT_LEVEL) sim.setSpec(specId, pid);
    sim.dungeonFinderSetRoles(['dps'], pid);
    sim.dungeonFinderQueueJoin([ACTIVITY], pid);
    pids.push(pid);
  }
  return pids;
}

function medianOf(samples: number[]): number {
  const sorted = [...samples].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

// Force one matching pass per sampled tick regardless of what the previous
// tick did to `matchDirty`, by flipping the machine's private dirty flag
// directly (the same test-only reflection mob_update_perf.test.ts uses for
// `cfg.perfLap`). Ticks are chosen off the tickCount % 20 sweep boundary is
// not controllable directly, so the first ~20 samples may also include one
// sweep() pass; that only adds a comparable O(queue) cost, so it does not
// invalidate the budget or the scaling comparison.
function measureMatchingPassMedian(count: number, samples: number): number {
  const sim = new Sim({ seed: WORLD_SEED, playerClass: 'warrior', noPlayer: true });
  buildDpsBacklog(sim, count);
  const finder = (sim as unknown as { dungeonFinder: { matchDirty: boolean } }).dungeonFinder;

  // Warm up once so the queue/eligibility caches (if any) settle.
  sim.tick();

  const times: number[] = [];
  for (let i = 0; i < samples; i++) {
    finder.matchDirty = true;
    const start = performance.now();
    sim.tick();
    times.push(performance.now() - start);
  }
  return medianOf(times);
}

describe('dungeon finder automatic role-queue matching high-load regression budget', () => {
  it('bounds one forced matching pass cost against a large role-imbalanced queue', () => {
    // This scenario originally exposed a real per-tick regression: budgetBox
    // in runMatching() used to be a fresh local `budget` re-initialized inside
    // EVERY tryAssemble() call, so a fully role-imbalanced backlog (no
    // tanks/healers ever queued, so no anchor can ever complete a composition)
    // let EVERY anchor independently exhaust the full FINDER_MATCH_NODE_BUDGET
    // hunting for a match that can never exist: total per-pass cost scaled as
    // anchors * budget instead of being capped. A 300-player backlog measured
    // ~415ms, well over the 50ms/20Hz tick budget. Fixed by threading one
    // shared budgetBox across the whole runMatching() pass (src/sim/social/
    // dungeon_finder.ts), so the SAME worst-case backlog now stays cheap.
    const BACKLOG = 300;
    const SAMPLES = 40;
    const median = measureMatchingPassMedian(BACKLOG, SAMPLES);

    console.log(`[dungeon finder perf] backlog=${BACKLOG} median=${median.toFixed(3)}ms`);

    // Generous by design (see mob_update_perf.test.ts): observed healthy
    // median at this population is a low single-digit ms figure now that the
    // shared budget bounds the WHOLE pass; 50ms (one 20 Hz tick) leaves
    // headroom for slow/contended CI hardware while still catching a
    // regression that reintroduces the anchors * budget blowup above.
    expect(median).toBeLessThan(50);
  }, 60_000);

  it('doubling the queued backlog does not more than roughly double one pass cost', () => {
    // The check a flat ceiling alone cannot provide: the shared budgetBox
    // bounds TOTAL work per pass, but a regression that re-forked it back to a
    // per-anchor budget (the original bug) would show up as superlinear
    // growth here long before either sample alone crosses an absolute ceiling
    // generous enough to avoid CI flakiness.
    const SMALL = 150;
    const LARGE = SMALL * 2;
    const SAMPLES = 30;

    const smallMedian = measureMatchingPassMedian(SMALL, SAMPLES);
    const largeMedian = measureMatchingPassMedian(LARGE, SAMPLES);

    console.log(
      `[dungeon finder perf] scaling small=${SMALL}(${smallMedian.toFixed(3)}ms) ` +
        `large=${LARGE}(${largeMedian.toFixed(3)}ms) ` +
        `ratio=${(largeMedian / Math.max(smallMedian, 0.001)).toFixed(2)}x`,
    );

    // A doubled backlog doing genuinely near-linear per-pass work should land
    // near 2x; the bound is set generously above that (3.5x, mirroring
    // aura_tick_perf.test.ts) to absorb noise at these small absolute ms
    // magnitudes while still failing hard on quadratic (or worse) blowup.
    expect(largeMedian).toBeLessThan(Math.max(smallMedian * 3.5, 5));
  }, 60_000);

  it('actually built the large role-imbalanced queue it claims to measure', () => {
    const sim = new Sim({ seed: WORLD_SEED + 2, playerClass: 'warrior', noPlayer: true });
    const BACKLOG = 60;
    const pids = buildDpsBacklog(sim, BACKLOG);
    sim.tick();

    const finder = (sim as unknown as { dungeonFinder: { queue: { members: number[] }[] } })
      .dungeonFinder;

    expect(pids.length).toBe(BACKLOG);
    // The dps-only backlog can never fully seat hollow_crypt_normal's FIVE_MAN
    // composition (no tanks/healers ever join), so the whole backlog is still
    // queued as solo units after a matching pass ran.
    expect(finder.queue.length).toBe(BACKLOG);
    for (const unit of finder.queue) expect(unit.members.length).toBe(1);
  });

  it('goes idle instead of re-running a full matching pass on every tick forever', () => {
    // The two tests above intentionally force-arm matchDirty every sampled
    // tick to measure worst-case single-pass cost; that setup cannot observe
    // whether the machine ever stops re-arming on its own. This test ticks
    // normally (no reflection poke) against the same unmatchable backlog
    // shape and counts how many ticks actually ran a matching pass: once the
    // anchor cursor has walked the whole backlog once with no proposal
    // formed and no queue mutation, matching must go idle (see
    // matchProvenIdleSeq in src/sim/social/dungeon_finder.ts) rather than
    // re-arming matchDirty every single tick forever (measured ~6.9ms/tick
    // sustained pre-fix, about 14% of the 50ms tick budget).
    const BACKLOG = 40;
    const sim = new Sim({ seed: WORLD_SEED + 3, playerClass: 'warrior', noPlayer: true });
    buildDpsBacklog(sim, BACKLOG);
    const finder = (sim as unknown as { dungeonFinder: { matchDirty: boolean } }).dungeonFinder;

    // One anchor gets a full turn per truncated pass at this shared-budget
    // node count (see the shared-budget livelock coverage in
    // tests/dungeon_finder.test.ts), so BACKLOG ticks walks the whole
    // backlog at least once; give it headroom on top of that.
    const SETTLE_TICKS = BACKLOG + 10;
    for (let i = 0; i < SETTLE_TICKS; i++) sim.tick();

    const SAMPLE_TICKS = 80;
    let dirtyTicks = 0;
    for (let i = 0; i < SAMPLE_TICKS; i++) {
      sim.tick();
      if (finder.matchDirty) dirtyTicks++;
    }

    console.log(
      `[dungeon finder perf] idle check: ${dirtyTicks}/${SAMPLE_TICKS} matching ticks ` +
        `after settling on an unmatchable ${BACKLOG}-unit backlog`,
    );

    // Forever-rearm would show up as dirtyTicks === SAMPLE_TICKS (every
    // tick). A generous ceiling well under "every tick" still catches that
    // regression without depending on exact tick-boundary timing.
    expect(dirtyTicks).toBeLessThan(SAMPLE_TICKS / 2);
  }, 30_000);
});
