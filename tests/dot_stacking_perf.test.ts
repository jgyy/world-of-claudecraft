// Perf/regression budget for aura_stacking.ts (auraReplacementConflicts),
// exclusive_aura.ts (exclusiveAuraConflicts), and dot_mutation.ts (extendOwnedDot)
// under many simultaneous aura applications to the same target: repeated
// re-application / stacking / exclusivity resolution. All three are pure leaves (no
// SimContext, per src/sim/CLAUDE.md), so this file calls them directly with
// performance.now() timing in the test file (fine here; only banned inside src/sim/
// source itself). Mirrors the measurement recipe in tests/mob_update_perf.test.ts /
// tests/aura_tick_perf.test.ts: warm up, sample many iterations, take the MEDIAN,
// assert a generous absolute budget plus a scaling check.
import { describe, expect, it } from 'vitest';
import { auraReplacementConflicts } from '../src/sim/combat/aura_stacking';
import { extendOwnedDot } from '../src/sim/combat/dot_mutation';
import { exclusiveAuraConflicts } from '../src/sim/combat/exclusive_aura';
import type { Aura, Entity } from '../src/sim/types';

const SOURCE_A = 1;
const SOURCE_B = 2;

// A group-buff aura id that is source-independent (see
// SOURCE_INDEPENDENT_GROUP_BUFF_AURA_IDS): every re-application from ANY source must
// dedupe against every prior instance, the worst case for auraReplacementConflicts'
// full backward scan.
const GROUP_BUFF_ID = 'battle_shout';

// Deep target aura array: `dotCount` distinct owned DoTs from SOURCE_A (extendOwnedDot
// candidates) interleaved with `padCount` inert padding buffs, so a lookup has to walk
// real array depth instead of finding its match at index 0.
function buildDeepAuraArray(dotCount: number, padCount: number): Aura[] {
  const auras: Aura[] = [];
  for (let i = 0; i < padCount / 2; i++) {
    auras.push({
      id: `pad_pre_${i}`,
      name: 'Pad',
      kind: 'buff_ap',
      remaining: 999,
      duration: 999,
      value: 1,
      sourceId: SOURCE_A,
      school: 'physical',
    });
  }
  for (let i = 0; i < dotCount; i++) {
    auras.push({
      id: `soup_dot_${i}`,
      name: 'Soup Dot',
      kind: 'dot',
      remaining: 60,
      duration: 60,
      value: 5,
      tickInterval: 1,
      tickTimer: 1,
      sourceId: SOURCE_A,
      school: 'physical',
      extendedBy: 0,
    });
  }
  for (let i = 0; i < padCount / 2; i++) {
    auras.push({
      id: `pad_post_${i}`,
      name: 'Pad',
      kind: 'buff_ap',
      remaining: 999,
      duration: 999,
      value: 1,
      sourceId: SOURCE_A,
      school: 'physical',
    });
  }
  return auras;
}

const GROUP_OF: Record<string, string | undefined> = {
  aspect_of_the_hawk: 'aspect',
  aspect_of_the_monkey: 'aspect',
  aspect_of_the_cheetah: 'aspect',
};
const groupOf = (id: string) => GROUP_OF[id];

// One measurement pass: `applications` repeated re-applications of the SAME
// group-buff id (from alternating sources, so replaceAcrossSources dedupes across
// every prior instance) plus, per application, an exclusive-group conflict check and
// an extendOwnedDot call against a deep DoT-laden array. This mirrors the worst-case
// combat shape: a target under sustained heavy DoT/debuff pressure whose aura array
// keeps getting re-scanned by every fresh application.
function runStackingPass(applications: number, arrayDepth: number): number {
  const auras: Aura[] = buildDeepAuraArray(arrayDepth, arrayDepth);
  const target = { auras } as unknown as Entity;

  const start = performance.now();
  for (let i = 0; i < applications; i++) {
    const source = i % 2 === 0 ? SOURCE_A : SOURCE_B;
    const newAura: Aura = {
      id: GROUP_BUFF_ID,
      name: 'Battle Shout',
      kind: 'buff_ap',
      remaining: 30,
      duration: 30,
      value: 1,
      sourceId: source,
      school: 'physical',
    };
    const conflicts = auraReplacementConflicts(auras, newAura);
    for (const idx of conflicts) auras.splice(idx, 1);
    auras.push(newAura);

    exclusiveAuraConflicts('aspect', 'aspect_of_the_hawk', auras, groupOf);

    extendOwnedDot(target, SOURCE_A, 'soup_dot_0', 2, 10);
  }
  return performance.now() - start;
}

function measureStackingMedian(applications: number, arrayDepth: number, samples: number): number {
  runStackingPass(applications, arrayDepth); // warm up
  const times: number[] = [];
  for (let i = 0; i < samples; i++) times.push(runStackingPass(applications, arrayDepth));
  times.sort((a, b) => a - b);
  return times[Math.floor(times.length / 2)];
}

describe('aura stacking/exclusivity/DoT mutation high-load regression budget', () => {
  it('bounds the cost of many repeated stacking applications against a deep aura array', () => {
    const APPLICATIONS = 500;
    const ARRAY_DEPTH = 60;

    const median = measureStackingMedian(APPLICATIONS, ARRAY_DEPTH, 20);

    console.log(
      `[dot.stacking perf] applications=${APPLICATIONS} arrayDepth~${ARRAY_DEPTH * 2 + ARRAY_DEPTH} ` +
        `median=${median.toFixed(2)}ms`,
    );

    // Generous by design (see mob_update_perf.test.ts): observed healthy median for 500
    // repeated stacking/exclusivity/DoT-extend applications against a ~180-entry deep
    // array is a low single-digit ms figure; 40ms leaves ample headroom for
    // slow/contended CI hardware while still catching a sustained order-of-magnitude
    // regression.
    expect(median).toBeLessThan(40);
  }, 60_000);

  it('doubling the application count does not more than roughly double the resolution cost', () => {
    const ARRAY_DEPTH = 40;
    const SMALL = 250;
    const LARGE = SMALL * 2;

    const smallMedian = measureStackingMedian(SMALL, ARRAY_DEPTH, 15);
    const largeMedian = measureStackingMedian(LARGE, ARRAY_DEPTH, 15);

    console.log(
      `[dot.stacking perf] scaling small=${SMALL}(${smallMedian.toFixed(2)}ms) ` +
        `large=${LARGE}(${largeMedian.toFixed(2)}ms) ` +
        `ratio=${(largeMedian / Math.max(smallMedian, 0.001)).toFixed(2)}x`,
    );

    // A doubled application count doing genuinely linear-per-application work (each
    // application's array scan stays bounded by the fixed array depth) should land
    // near 2x; the bound is set generously above that (3.5x) to absorb noise at small
    // absolute ms magnitudes while still failing hard on a regression that turns a
    // bounded per-application scan into one that grows with cumulative applications
    // (e.g. a stacking bug that stops pruning replaced auras, letting the array grow
    // unbounded across the run).
    expect(largeMedian).toBeLessThan(Math.max(smallMedian * 3.5, 5));
  }, 60_000);

  it('actually resolves stacking/exclusivity/extension against the deep array (shape sanity)', () => {
    const auras: Aura[] = buildDeepAuraArray(20, 40);
    const target = { auras } as unknown as Entity;
    const startLen = auras.length;
    expect(startLen).toBeGreaterThan(50);

    // Stack the group buff from two alternating sources repeatedly: the array must
    // never accumulate more than ONE instance of the source-independent group buff,
    // proving auraReplacementConflicts genuinely deduped across sources at depth.
    for (let i = 0; i < 20; i++) {
      const source = i % 2 === 0 ? SOURCE_A : SOURCE_B;
      const newAura: Aura = {
        id: GROUP_BUFF_ID,
        name: 'Battle Shout',
        kind: 'buff_ap',
        remaining: 30,
        duration: 30,
        value: 1,
        sourceId: source,
        school: 'physical',
      };
      const conflicts = auraReplacementConflicts(auras, newAura);
      for (const idx of conflicts) auras.splice(idx, 1);
      auras.push(newAura);
    }
    const groupBuffCount = auras.filter((a) => a.id === GROUP_BUFF_ID).length;
    expect(groupBuffCount).toBe(1);

    // extendOwnedDot against the deep array should find and extend the real DoT.
    const before = auras.find((a) => a.id === 'soup_dot_0');
    expect(before).toBeDefined();
    const remainingBefore = before?.remaining ?? 0;
    const extended = extendOwnedDot(target, SOURCE_A, 'soup_dot_0', 2, 10);
    expect(extended).toBeGreaterThan(0);
    expect(before?.remaining).toBeGreaterThan(remainingBefore);
  });
});
