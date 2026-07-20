import { describe, expect, it } from 'vitest';
import { Sim } from '../src/sim/sim';
import type { Aura, Entity } from '../src/sim/types';

const WORLD_SEED = 20062;

// Regression coverage gap this file closes: tests/mob_update_perf.test.ts budgets ONLY
// the `mob.update` phase (targeting/movement/melee). It says nothing about the
// `p.auras` / `mob.auras` phase (combat/auras.ts updateAuras), which walks EVERY
// entity's full aura array every tick and, for each ticking physical DoT, does a
// SECOND full inner scan of that same array (the bleed_vuln amplifier lookup). A deep
// aura stack (raid buffs/debuffs + several DoTs/HoTs) is exactly the shape that turns a
// per-entity linear cost into a per-entity QUADRATIC one, and a flat, generous ms
// ceiling alone (as in mob_update_perf) would not catch a regression that only shows up
// at depth. So this file asserts two things: an absolute per-tick budget at a fixed
// deep-aura population (mirrors mob_update_perf's recipe), AND a SCALING check: doubling
// the aura depth per entity must not more than roughly double the phase cost. The
// scaling check is the part a single flat ceiling structurally cannot provide.

const DUMMY_SOURCE = 1;

// Build `count` players, each carrying `aurasPerEntity` auras: a handful of ticking
// physical DoTs (school 'physical', so each tick walks the array again for
// bleed_vuln), a handful of bleed_vuln buffs (so that inner scan finds real work), and
// the rest inert long-duration buffs padding out the array depth. Huge maxHp keeps
// every player alive for the whole measurement window regardless of DoT tick damage.
function buildAuraSoup(sim: Sim, count: number, aurasPerEntity: number): Entity[] {
  const players: Entity[] = [];
  for (let i = 0; i < count; i++) {
    const pid = sim.addPlayer('warrior', `Soup${i}`);
    const e = sim.entities.get(pid);
    if (!e) continue;
    e.maxHp = 1_000_000;
    e.hp = e.maxHp;
    const auras: Aura[] = [];
    const dotCount = Math.min(6, Math.floor(aurasPerEntity / 4));
    const bleedVulnCount = Math.min(4, Math.floor(aurasPerEntity / 6));
    for (let d = 0; d < dotCount; d++) {
      auras.push({
        id: `soup_dot_${d}`,
        name: 'Soup Dot',
        kind: 'dot',
        remaining: 999,
        duration: 999,
        value: 1,
        tickInterval: 1 / 20,
        tickTimer: 1 / 20,
        sourceId: DUMMY_SOURCE,
        school: 'physical',
      });
    }
    for (let b = 0; b < bleedVulnCount; b++) {
      auras.push({
        id: `soup_bleed_vuln_${b}`,
        name: 'Soup Bleed Vuln',
        kind: 'bleed_vuln',
        remaining: 999,
        duration: 999,
        value: 0.01,
        sourceId: DUMMY_SOURCE,
        school: 'physical',
      });
    }
    for (let f = auras.length; f < aurasPerEntity; f++) {
      auras.push({
        id: `soup_buff_${f}`,
        name: 'Soup Buff',
        kind: 'buff_ap',
        remaining: 999,
        duration: 999,
        value: 1,
        sourceId: pid,
        school: 'physical',
      });
    }
    e.auras = auras;
    players.push(e);
  }
  return players;
}

// Runs the fixed measurement recipe (mirrors mob_update_perf.test.ts): warm up, sample
// MEASURE_TICKS ticks of the named phase(s), return the median across samples (the
// median rejects one-off GC/scheduling spikes from co-running Vitest workers).
function measureAuraPhaseMedian(
  count: number,
  aurasPerEntity: number,
): { median: number; total: number } {
  const sim = new Sim({ seed: WORLD_SEED, playerClass: 'warrior', noPlayer: true });
  buildAuraSoup(sim, count, aurasPerEntity);

  let mark = 0;
  let auraPhaseThisTick = 0;
  let lapTotal = 0;
  const lap = (phase: string): void => {
    const t = performance.now();
    const dt = t - mark;
    if (phase === 'p.auras' || phase === 'mob.auras') {
      auraPhaseThisTick += dt;
      lapTotal += dt;
    }
    mark = t;
  };
  (sim as unknown as { cfg: { perfLap: typeof lap } }).cfg.perfLap = lap;

  for (let i = 0; i < 10; i++) sim.tick();

  const MEASURE_TICKS = 60;
  const samples: number[] = [];
  for (let i = 0; i < MEASURE_TICKS; i++) {
    auraPhaseThisTick = 0;
    mark = performance.now();
    sim.tick();
    samples.push(auraPhaseThisTick);
  }
  samples.sort((a, b) => a - b);
  return { median: samples[Math.floor(samples.length / 2)], total: lapTotal };
}

describe('aura-tick (p.auras / mob.auras) high-load regression budget', () => {
  it('bounds the deep-aura-stack per-tick cost at a fixed population', () => {
    const COUNT = 80;
    const AURAS_PER_ENTITY = 60;
    const { median, total } = measureAuraPhaseMedian(COUNT, AURAS_PER_ENTITY);

    console.log(
      `[aura.tick perf] players=${COUNT} aurasPerEntity=${AURAS_PER_ENTITY} median=${median.toFixed(2)}ms`,
    );

    // Instrumentation contract: the phase-matching lap hook is installed through an
    // `as unknown as` cast, so a phase-string rename in sim.ts (e.g. 'p.auras' ->
    // something else) keeps this file compiling while the accumulator silently stays 0
    // and the budget assertion below would pass vacuously. Guard it explicitly.
    expect(total).toBeGreaterThan(0);

    // Generous by design (see mob_update_perf.test.ts): observed healthy median at this
    // population is a low single-digit ms figure; 25ms leaves headroom for slow/contended
    // CI hardware under one 20 Hz tick (50ms) while still catching an order-of-magnitude
    // sustained regression.
    expect(median).toBeLessThan(25);
  }, 60_000);

  it('doubling aura depth per entity does not more than roughly double the phase cost', () => {
    // This is the check a flat ceiling alone cannot provide: a linear-scan regression
    // (e.g. the bleed_vuln inner scan losing its early structure, or a new per-aura pass
    // added to updateAuras) turns per-entity O(auras) into O(auras^2), which shows up
    // here as superlinear growth long before either sample alone crosses an absolute
    // ceiling generous enough to avoid CI flakiness.
    const COUNT = 40;
    const SMALL = 40;
    const LARGE = SMALL * 2;

    const { median: smallMedian, total: smallTotal } = measureAuraPhaseMedian(COUNT, SMALL);
    const { median: largeMedian, total: largeTotal } = measureAuraPhaseMedian(COUNT, LARGE);

    console.log(
      `[aura.tick perf] scaling players=${COUNT} small=${SMALL}auras(${smallMedian.toFixed(2)}ms) ` +
        `large=${LARGE}auras(${largeMedian.toFixed(2)}ms) ratio=${(largeMedian / Math.max(smallMedian, 0.001)).toFixed(2)}x`,
    );

    // Instrumentation contract (see above): guard against a silently-zeroed accumulator.
    expect(smallTotal).toBeGreaterThan(0);
    expect(largeTotal).toBeGreaterThan(0);

    // A doubled aura depth doing genuinely linear work should land near 2x; the bound is
    // set generously above that (3.5x) to absorb noise at these small absolute ms
    // magnitudes while still failing hard on quadratic blowup (which lands far higher,
    // scaling with the SQUARE of the aura count rather than the count itself).
    expect(largeMedian).toBeLessThan(Math.max(smallMedian * 3.5, 5));
  }, 60_000);
});
