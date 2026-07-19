import { describe, expect, it } from 'vitest';
import { rowForLevel } from '../src/sim/content/talent_rows';
import { ROW_LEVELS, type TalentRowLevel } from '../src/sim/content/talents';
import { Sim } from '../src/sim/sim';

const WORLD_SEED = 20071;
const CLS = 'warrior';

// Regression coverage this file adds: talents.ts's recomputeTalents is the SOLE place
// a talent tree is walked (per the module's own HOT-PATH INVARIANT comment), reached
// through every applyTalents/selectTalentRow/respec/loadout-switch call. Nothing today
// budgets that command's cost, nor its scaling as a build fills out from a shallow to a
// full-depth allocation. This mirrors the mob_update_perf/aura_tick_perf recipe: an
// absolute per-call budget at a fixed population of players each repeatedly re-speccing,
// plus a scaling check across the number of rows filled (this class's tree caps at
// ROW_LEVELS.length = 6 rows, so "depth" here means rows populated in the allocation,
// not tree size, which is fixed content).

function buildPlayers(sim: Sim, count: number): number[] {
  const pids: number[] = [];
  for (let i = 0; i < count; i++) {
    const pid = sim.addPlayer(CLS, `Speccer${i}`);
    sim.setPlayerLevel(20, pid);
    pids.push(pid);
  }
  return pids;
}

// One applyTalents call per player, filling `rows` worth of rows with the row's
// first option, alternating between two builds each call so the allocation actually
// changes (a same-allocation apply short-circuits before recomputeTalents runs).
function measureApplyMedian(playerCount: number, rows: number): number {
  const sim = new Sim({ seed: WORLD_SEED, playerClass: CLS, noPlayer: true });
  const pids = buildPlayers(sim, playerCount);
  const levels = ROW_LEVELS.slice(0, rows);

  function allocationFor(pick: 0 | 1): {
    spec: string | null;
    rows: Partial<Record<TalentRowLevel, string>>;
  } {
    const built: Partial<Record<TalentRowLevel, string>> = {};
    for (const level of levels) {
      const row = rowForLevel(CLS, level);
      if (row) built[level] = row.options[pick].id;
    }
    return { spec: null, rows: built };
  }

  const allocA = allocationFor(0);
  const allocB = allocationFor(1);

  // Warm up: settle the first apply's one-time costs before measuring.
  for (const pid of pids) sim.applyTalents(allocA, pid);

  const ITERATIONS = 50;
  const samples: number[] = [];
  for (let i = 0; i < ITERATIONS; i++) {
    const alloc = i % 2 === 0 ? allocB : allocA;
    const t0 = performance.now();
    for (const pid of pids) sim.applyTalents(alloc, pid);
    samples.push((performance.now() - t0) / pids.length);
  }
  samples.sort((a, b) => a - b);
  return samples[Math.floor(samples.length / 2)];
}

describe('talent recompute (applyTalents/recomputeTalents) perf budget', () => {
  it('bounds the per-call cost of a full-depth respec across many players', () => {
    const PLAYERS = 60;
    const ROWS = ROW_LEVELS.length;
    const median = measureApplyMedian(PLAYERS, ROWS);

    console.log(
      `[talent recompute perf] players=${PLAYERS} rows=${ROWS} medianPerCall=${median.toFixed(4)}ms`,
    );

    // Generous by design (see mob_update_perf.test.ts): recomputeTalents re-bakes one
    // flat modifier struct and re-runs the stat pass for one player, an operation that
    // is not a per-tick hot path; a healthy median here is a small fraction of a ms, so
    // 5ms per call leaves ample headroom for slow/contended CI while catching an
    // order-of-magnitude regression (e.g. a tree walk creeping back onto a hot path).
    expect(median).toBeLessThan(5);
  }, 60_000);

  it('doubling rows filled does not more than roughly double the per-call cost', () => {
    const PLAYERS = 40;
    const SMALL_ROWS = 3;
    const LARGE_ROWS = ROW_LEVELS.length; // 6, the tree's full depth

    const smallMedian = measureApplyMedian(PLAYERS, SMALL_ROWS);
    const largeMedian = measureApplyMedian(PLAYERS, LARGE_ROWS);

    console.log(
      `[talent recompute perf] scaling players=${PLAYERS} small=${SMALL_ROWS}rows(${smallMedian.toFixed(4)}ms) ` +
        `large=${LARGE_ROWS}rows(${largeMedian.toFixed(4)}ms) ratio=${(largeMedian / Math.max(smallMedian, 0.0001)).toFixed(2)}x`,
    );

    // A doubled row count doing genuinely linear work should land near the LARGE/SMALL
    // rows ratio; the bound is set generously above that to absorb noise at these tiny
    // absolute ms magnitudes while still failing hard on a quadratic blowup.
    const rowRatio = LARGE_ROWS / SMALL_ROWS;
    expect(largeMedian).toBeLessThan(Math.max(smallMedian * rowRatio * 1.75, 1));
  }, 60_000);

  it('actually applied the full-depth allocation to every player (shape sanity)', () => {
    const PLAYERS = 20;
    const sim = new Sim({ seed: WORLD_SEED + 1, playerClass: CLS, noPlayer: true });
    const pids = buildPlayers(sim, PLAYERS);
    const rowsFilled: Partial<Record<TalentRowLevel, string>> = {};
    for (const level of ROW_LEVELS) {
      const row = rowForLevel(CLS, level);
      if (row) rowsFilled[level] = row.options[0].id;
    }
    let applied = 0;
    let totalPointsSpent = 0;
    for (const pid of pids) {
      const ok = sim.applyTalents({ spec: null, rows: rowsFilled }, pid);
      if (ok) applied++;
      const meta = sim.players.get(pid);
      if (meta) totalPointsSpent += Object.keys(meta.talents.rows).length;
    }
    expect(applied).toBe(PLAYERS);
    expect(totalPointsSpent).toBe(PLAYERS * ROW_LEVELS.length);
  });
});
