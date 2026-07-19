import { describe, expect, it } from 'vitest';
import {
  characterRecklessnessActive,
  characterSanguineAuraActive,
  characterSoulRendActive,
} from '../src/render/character_effects';
import type { Aura, Entity } from '../src/sim/types';

// Perf regression coverage for character_effects.ts: renderer.ts calls all three
// predicates for EVERY visible character on EVERY animation frame (they gate the
// Soul Rend model tint, the Sanguine Aura glow, and the Recklessness overlay), so
// their cost is squarely inside the per-frame render budget, not an occasional
// one-shot. Each predicate is `Entity.auras.some(...)`, so the worst case is a
// deep aura array where nothing matches: `.some()` must walk every entry before
// returning false. Mirrors the canonical recipe in tests/mob_update_perf.test.ts
// and tests/aura_tick_perf.test.ts: warm up, sample many iterations, take the
// MEDIAN (rejects one-off GC/scheduling spikes from co-running Vitest workers),
// assert an absolute per-call budget AND a scaling bound (population, then aura
// depth) so a regression that turns the linear scan quadratic is caught even
// though a single flat ceiling could not structurally distinguish the two.

function entity(auras: Aura[]): Entity {
  return {
    id: 1,
    kind: 'player',
    templateId: '',
    name: 'Marked',
    level: 20,
    pos: { x: 0, y: 0, z: 0 },
    prevPos: { x: 0, y: 0, z: 0 },
    vel: { x: 0, y: 0, z: 0 },
    facing: 0,
    prevFacing: 0,
    hp: 100,
    maxHp: 100,
    resource: 0,
    maxResource: 0,
    resourceType: null,
    stats: { str: 0, agi: 0, sta: 0, int: 0, spi: 0, armor: 0 },
    weapon: { min: 1, max: 2, speed: 2 },
    auras,
    targetId: null,
    castRemaining: 0,
    castTotal: 0,
    castingAbility: null,
    channeling: false,
    dead: false,
    inCombat: false,
    swingTimer: 0,
    moveSpeed: 7,
    radius: 0.35,
    height: 1.8,
    scale: 1,
    color: 0xffffff,
    ownerId: null,
    petMode: 'defensive',
    petTargetId: null,
    petAttackTargetId: null,
    petReturnTarget: null,
    petNextActionAt: 0,
    hostile: false,
    aggroRadius: 0,
    aiState: 'idle',
    aggroTargetId: null,
    spawnPos: { x: 0, y: 0, z: 0 },
    leashOrigin: { x: 0, y: 0, z: 0 },
    threat: new Map(),
    tappedById: null,
    lootable: false,
    loot: null,
    questIds: [],
    patrol: null,
    patrolIndex: 0,
    fleeing: false,
    fleeTimer: 0,
    fleeReturnTimer: 0,
    fledOnce: false,
    summonedIds: [],
    summonedById: null,
    interactable: false,
    objectItemId: null,
    dungeonId: null,
    dungeonSlot: null,
    overheadEmoteId: null,
    overheadEmoteSeq: 0,
    overheadEmoteUntil: 0,
  } as unknown as Entity;
}

// Deep, all-miss aura soup: every entry fails the id/kind test the three
// predicates look for, forcing `.some()` to walk the full array every call.
// A handful of DoTs/HoTs + raid buffs is a realistic "raid boss fight" depth;
// this pads well past that so a regression has room to show before the array
// itself becomes an unrealistic outlier.
function auraSoup(depth: number): Aura[] {
  const auras: Aura[] = [];
  for (let i = 0; i < depth; i++) {
    auras.push({
      id: `soup_buff_${i}`,
      name: 'Soup Buff',
      kind: 'buff_ap',
      remaining: 999,
      duration: 999,
      value: 1,
      sourceId: 1,
      school: 'physical',
    });
  }
  return auras;
}

function buildCharacters(count: number, auraDepth: number): Entity[] {
  const chars: Entity[] = [];
  for (let i = 0; i < count; i++) chars.push(entity(auraSoup(auraDepth)));
  return chars;
}

// Runs the fixed measurement recipe: warm up, sample SAMPLES iterations of calling
// all three predicates for every character in the population, return the median
// (rejects one-off GC/scheduling spikes, same rationale as the canonical files).
function measurePerFrameMedian(count: number, auraDepth: number): number {
  const chars = buildCharacters(count, auraDepth);

  const runFrame = (): void => {
    for (const c of chars) {
      characterSoulRendActive(c);
      characterSanguineAuraActive(c);
      characterRecklessnessActive(c);
    }
  };

  for (let i = 0; i < 10; i++) runFrame(); // warm up

  const SAMPLES = 60;
  const samples: number[] = [];
  for (let i = 0; i < SAMPLES; i++) {
    const start = performance.now();
    runFrame();
    samples.push(performance.now() - start);
  }
  samples.sort((a, b) => a - b);
  return samples[Math.floor(samples.length / 2)];
}

describe('character_effects per-frame regression budget', () => {
  it('bounds the per-frame cost of the three effect predicates at a worst-case population', () => {
    const COUNT = 200;
    const AURA_DEPTH = 60;
    const median = measurePerFrameMedian(COUNT, AURA_DEPTH);

    console.log(
      `[character_effects perf] characters=${COUNT} auraDepth=${AURA_DEPTH} median=${median.toFixed(3)}ms`,
    );

    // Generous by design (see mob_update_perf.test.ts): three `.some()` scans over
    // 60-entry arrays across 200 characters is on the order of tens of thousands of
    // comparisons, well under a millisecond in healthy code. 8ms leaves ample headroom
    // for slow/contended CI hardware while still catching an order-of-magnitude
    // sustained regression (e.g. a predicate that stopped short-circuiting, or started
    // rebuilding a structure per call instead of scanning the array in place).
    expect(median).toBeLessThan(8);
  }, 30_000);

  it('doubling the character population does not more than roughly double the per-frame cost', () => {
    const AURA_DEPTH = 40;
    const SMALL = 100;
    const LARGE = SMALL * 2;

    const smallMedian = measurePerFrameMedian(SMALL, AURA_DEPTH);
    const largeMedian = measurePerFrameMedian(LARGE, AURA_DEPTH);

    console.log(
      `[character_effects perf] scaling auraDepth=${AURA_DEPTH} small=${SMALL}chars(${smallMedian.toFixed(3)}ms) ` +
        `large=${LARGE}chars(${largeMedian.toFixed(3)}ms) ratio=${(largeMedian / Math.max(smallMedian, 0.001)).toFixed(2)}x`,
    );

    // A doubled population doing genuinely linear (per-character) work should land
    // near 2x; the bound is set generously above that to absorb noise at these small
    // absolute ms magnitudes while still failing hard on a regression that turns the
    // per-character cost population-dependent (e.g. an accidental O(n^2) cross-scan).
    expect(largeMedian).toBeLessThan(Math.max(smallMedian * 3.5, 1));
  }, 30_000);

  it('doubling the per-character aura depth does not more than roughly double the per-frame cost', () => {
    const COUNT = 100;
    const SMALL_DEPTH = 30;
    const LARGE_DEPTH = SMALL_DEPTH * 2;

    const smallMedian = measurePerFrameMedian(COUNT, SMALL_DEPTH);
    const largeMedian = measurePerFrameMedian(COUNT, LARGE_DEPTH);

    console.log(
      `[character_effects perf] scaling characters=${COUNT} small=${SMALL_DEPTH}auras(${smallMedian.toFixed(3)}ms) ` +
        `large=${LARGE_DEPTH}auras(${largeMedian.toFixed(3)}ms) ratio=${(largeMedian / Math.max(smallMedian, 0.001)).toFixed(2)}x`,
    );

    // Each predicate's cost is linear in a single entity's aura array length; doubling
    // that depth should land near 2x. The bound stays generous for the same reason as
    // the population-scaling check above, while still catching a regression that makes
    // one predicate rescan the array per OTHER predicate call (quadratic in depth).
    expect(largeMedian).toBeLessThan(Math.max(smallMedian * 3.5, 1));
  }, 30_000);
});
