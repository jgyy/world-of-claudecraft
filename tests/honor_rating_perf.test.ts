import { describe, expect, it } from 'vitest';
import { awardRankedArenaWinHonor } from '../src/sim/pvp/honor';
import { pvpFractionsFromRatings } from '../src/sim/pvp/power';
import { Sim } from '../src/sim/sim';

const WORLD_SEED = 20075;

// Regression coverage this file adds: pvp/honor.ts's awardRankedArenaWinHonor is the
// per-match rating/reward update every ranked arena win runs through (daily-window
// lookup, repeat-opponent diminishing returns, the taper curve, then grantHonor), and
// pvp/power.ts's pvpFractionsFromRatings is the WARFARE rating-to-fraction conversion
// read on every damage exchange. A large arena ladder running many matches in
// sequence (a ladder-wide reset or a batch of concurrent matches resolving in the same
// window) calls both at volume. Nothing today budgets either's per-call cost, nor
// their scaling with ladder size. Mirrors the mob_update_perf/aura_tick_perf recipe:
// fixed-population absolute budget plus a doubling scaling check, median of many
// samples.

function buildLadder(sim: Sim, size: number) {
  const metas = [];
  for (let i = 0; i < size; i++) {
    const pid = sim.addPlayer('warrior', `Ladder${i}`);
    const meta = sim.players.get(pid);
    if (!meta) throw new Error(`missing meta ${pid}`);
    metas.push(meta);
  }
  return metas;
}

// One rating-update volley: every ladder member wins a ranked 1v1 against a distinct
// opponent key (so the repeat-opponent DR path never zeroes the reward out), then has
// its offense/defense fraction recomputed from its now-updated rating-adjacent stats.
function measureRatingUpdateMedian(ladderSize: number): number {
  const sim = new Sim({ seed: WORLD_SEED, playerClass: 'warrior', noPlayer: true });
  const metas = buildLadder(sim, ladderSize);

  const doVolley = (volleyIndex: number): void => {
    for (let i = 0; i < metas.length; i++) {
      const meta = metas[i];
      const opponentKey = `opp:${volleyIndex}:${i}`;
      awardRankedArenaWinHonor(sim.ctx, meta, '1v1', opponentKey);
      pvpFractionsFromRatings(meta.arenaRating, meta.arena2v2Rating);
    }
  };

  // Warm up.
  doVolley(-1);

  const VOLLEYS = 50;
  const samples: number[] = [];
  for (let v = 0; v < VOLLEYS; v++) {
    const t0 = performance.now();
    doVolley(v);
    samples.push((performance.now() - t0) / ladderSize);
  }
  samples.sort((a, b) => a - b);
  return samples[Math.floor(samples.length / 2)];
}

describe('honor/rating (pvp/honor.ts + pvp/power.ts) perf budget', () => {
  it('bounds the per-player cost of a full-ladder ranked-win rating update', () => {
    const LADDER = 200;
    const median = measureRatingUpdateMedian(LADDER);

    console.log(`[honor rating perf] ladder=${LADDER} medianPerPlayer=${median.toFixed(4)}ms`);

    // Generous by design (see mob_update_perf.test.ts): awardRankedArenaWinHonor is a
    // daily-window map lookup plus a couple of field writes, and pvpFractionsFromRatings
    // is two clamped divisions; a healthy median here is a tiny fraction of a ms, so 2ms
    // per player leaves ample headroom for slow/contended CI while still catching an
    // order-of-magnitude regression.
    expect(median).toBeLessThan(2);
  }, 60_000);

  it('doubling the ladder size does not more than roughly double the per-player cost', () => {
    const SMALL = 100;
    const LARGE = SMALL * 2;

    const smallMedian = measureRatingUpdateMedian(SMALL);
    const largeMedian = measureRatingUpdateMedian(LARGE);

    console.log(
      `[honor rating perf] scaling small=${SMALL}players(${smallMedian.toFixed(4)}ms) ` +
        `large=${LARGE}players(${largeMedian.toFixed(4)}ms) ratio=${(largeMedian / Math.max(smallMedian, 0.0001)).toFixed(2)}x`,
    );

    // A doubled ladder size doing genuinely per-player linear work should leave the
    // PER-PLAYER median roughly flat (near 1x, not 2x, since the measurement already
    // divides by ladder size); the bound is set generously (3.5x) to absorb noise at
    // these tiny absolute ms magnitudes while still failing hard on a quadratic blowup
    // (e.g. a future cross-player daily-window scan).
    expect(largeMedian).toBeLessThan(Math.max(smallMedian * 3.5, 1));
  }, 60_000);

  it('actually applied a rating/honor update to every ladder member (shape sanity)', () => {
    const LADDER = 120;
    const sim = new Sim({ seed: WORLD_SEED + 1, playerClass: 'warrior', noPlayer: true });
    const metas = buildLadder(sim, LADDER);

    let honorGranted = 0;
    let winsRecorded = 0;
    for (let i = 0; i < metas.length; i++) {
      const meta = metas[i];
      const before = meta.honor;
      const credited = awardRankedArenaWinHonor(sim.ctx, meta, '1v1', `solo_opp_${i}`);
      if (credited > 0 && meta.honor > before) honorGranted++;
      if (meta.honorArenaDaily?.totalWins === 1) winsRecorded++;
      const fractions = pvpFractionsFromRatings(meta.arenaRating, meta.arena2v2Rating);
      expect(fractions.offense).toBeGreaterThanOrEqual(0);
      expect(fractions.defense).toBeGreaterThanOrEqual(0);
    }

    expect(honorGranted).toBe(LADDER);
    expect(winsRecorded).toBe(LADDER);
  });
});
