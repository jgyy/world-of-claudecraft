import { describe, expect, it } from 'vitest';
import { grantXp } from '../src/sim/combat/damage';
import { Sim } from '../src/sim/sim';

const WORLD_SEED = 20073;

// Regression coverage this file adds: grantXp (combat/damage.ts) is the sole XP-award
// entry point, reached once per party member per mob kill (progression/xp.ts's own
// header comment names it the C1 grantXp core). A farming party grinding a dense mob
// camp credits it at high volume: many kills in quick succession, each fanning out to
// every eligible party member. Nothing today budgets that per-call cost, nor its
// scaling with award volume (a level-up mid-stream re-bakes talent mods and recalcs
// stats, so cost is not perfectly flat; the scaling check catches that regression
// specifically). Mirrors the mob_update_perf/aura_tick_perf recipe: fixed-population
// absolute budget plus a doubling scaling check, median of many samples.

const PARTY_SIZE = 5;

function buildParty(sim: Sim, size: number) {
  const metas = [];
  for (let i = 0; i < size; i++) {
    const pid = sim.addPlayer('warrior', `Farmer${i}`);
    sim.setPlayerLevel(2, pid); // low enough that repeated kills actually level up
    const meta = sim.players.get(pid);
    if (!meta) throw new Error(`missing meta ${pid}`);
    metas.push(meta);
  }
  return metas;
}

// One farming volley: `killsPerVolley` mob kills, each crediting the whole party via
// grantXp with the same fixed per-kill amount (mirrors mobXpValue's typical low-level
// output order of magnitude without pulling in the whole kill-credit pipeline, so the
// measurement isolates grantXp's own cost, not loot rolls / deed credit / quest credit,
// which have their own dedicated perf/behavior suites elsewhere).
function measureGrantXpMedian(partySize: number, killsPerVolley: number): number {
  const sim = new Sim({ seed: WORLD_SEED, playerClass: 'warrior', noPlayer: true });
  const metas = buildParty(sim, partySize);
  const XP_PER_KILL = 40;

  // Warm up: absorb any one-time allocation cost before measuring.
  for (const meta of metas) grantXp(sim.ctx, XP_PER_KILL, meta, { fromKill: true });

  const VOLLEYS = 50;
  const samples: number[] = [];
  for (let v = 0; v < VOLLEYS; v++) {
    const t0 = performance.now();
    for (let k = 0; k < killsPerVolley; k++) {
      for (const meta of metas) grantXp(sim.ctx, XP_PER_KILL, meta, { fromKill: true });
    }
    const totalCalls = killsPerVolley * partySize;
    samples.push((performance.now() - t0) / totalCalls);
  }
  samples.sort((a, b) => a - b);
  return samples[Math.floor(samples.length / 2)];
}

describe('grantXp (progression/xp.ts + combat/damage.ts) perf budget', () => {
  it('bounds the per-call cost of rapid party-wide kill-credit volume', () => {
    const KILLS_PER_VOLLEY = 30;
    const median = measureGrantXpMedian(PARTY_SIZE, KILLS_PER_VOLLEY);

    console.log(
      `[grantXp perf] party=${PARTY_SIZE} killsPerVolley=${KILLS_PER_VOLLEY} medianPerCall=${median.toFixed(4)}ms`,
    );

    // Generous by design (see mob_update_perf.test.ts): grantXp is a handful of field
    // writes plus, on a level-up, one talent re-bake and one stat recalc for a single
    // player; a healthy median here is a small fraction of a ms, so 3ms per call leaves
    // ample headroom for slow/contended CI while still catching an order-of-magnitude
    // regression.
    expect(median).toBeLessThan(3);
  }, 60_000);

  it('doubling kill volume does not more than roughly double the per-call cost', () => {
    const SMALL = 20;
    const LARGE = SMALL * 2;

    const smallMedian = measureGrantXpMedian(PARTY_SIZE, SMALL);
    const largeMedian = measureGrantXpMedian(PARTY_SIZE, LARGE);

    console.log(
      `[grantXp perf] scaling party=${PARTY_SIZE} small=${SMALL}kills(${smallMedian.toFixed(4)}ms) ` +
        `large=${LARGE}kills(${largeMedian.toFixed(4)}ms) ratio=${(largeMedian / Math.max(smallMedian, 0.0001)).toFixed(2)}x`,
    );

    // A doubled kill volume doing genuinely per-call linear work (including its
    // occasional level-up re-bake) should land near 2x; the bound is set generously
    // above that (3.5x) to absorb noise at these tiny absolute ms magnitudes while
    // still failing hard on a quadratic blowup.
    expect(largeMedian).toBeLessThan(Math.max(smallMedian * 3.5, 2));
  }, 60_000);

  it('actually granted XP and leveled up the farming party (shape sanity)', () => {
    const sim = new Sim({ seed: WORLD_SEED + 1, playerClass: 'warrior', noPlayer: true });
    const metas = buildParty(sim, PARTY_SIZE);
    const startLevels = metas.map((m) => sim.entities.get(m.entityId)?.level ?? 0);
    const XP_PER_KILL = 40;
    const KILLS = 40;
    for (let k = 0; k < KILLS; k++) {
      for (const meta of metas) grantXp(sim.ctx, XP_PER_KILL, meta, { fromKill: true });
    }
    let leveledUp = 0;
    let totalLifetimeXp = 0;
    for (let i = 0; i < metas.length; i++) {
      const meta = metas[i];
      const e = sim.entities.get(meta.entityId);
      if (e && e.level > startLevels[i]) leveledUp++;
      totalLifetimeXp += meta.lifetimeXp;
    }
    expect(leveledUp).toBeGreaterThan(0);
    // At least the base award landed for every kill; a rested-XP bonus (drawn down
    // from meta.restedXp on a fromKill grant) can only add on top of that floor.
    expect(totalLifetimeXp).toBeGreaterThanOrEqual(PARTY_SIZE * KILLS * XP_PER_KILL);
  });
});
