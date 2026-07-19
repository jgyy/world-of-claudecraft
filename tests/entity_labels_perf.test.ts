import { describe, expect, it } from 'vitest';
import { mobDisplayName, npcDisplayName, objectDisplayName } from '../src/render/entity_labels';
import { MOBS, NPCS } from '../src/sim/data';
import type { Entity } from '../src/sim/types';

// Perf regression coverage for entity_labels.ts: the nameplate painter resolves a
// display name for every visible mob/npc/object EVERY time a nameplate is (re)built,
// which in a dense zone (a camp, a rare spawn's crowd, a market/graveyard cluster) is
// many entities every frame the label changes. mobDisplayName/npcDisplayName wrap
// tEntity(), and objectDisplayName additionally branches on ~15 templateId cases
// before falling back to tEntity()/raw name; none of these functions, nor tEntity()/
// t() underneath them (src/ui/entity_i18n.ts, src/ui/i18n.ts), memoize a resolved
// string: each call re-walks the key path and re-runs interpolation from scratch.
// So unlike aura_tick_perf's structural cache assumption, there is no cache to prove
// reuse of here; the third test instead pins the honest available property, that a
// repeat call is neither slower NOR does it produce a different value (deterministic,
// no accidental per-call state growth), which is what a memoizing cache would need to
// preserve if one were later added. Mirrors the canonical recipe in
// tests/mob_update_perf.test.ts / tests/aura_tick_perf.test.ts: warm up, sample many
// iterations, take the MEDIAN, assert an absolute budget and a scaling bound.

const MOB_IDS = Object.keys(MOBS);
const NPC_IDS = Object.keys(NPCS);
if (MOB_IDS.length === 0 || NPC_IDS.length === 0) {
  throw new Error('expected at least one mob and npc template to build a label population');
}

function objectEntity(templateId: string, name: string): Entity {
  return { templateId, name, objectItemId: null, dungeonId: null } as unknown as Entity;
}

// A realistic mixed label population: cycles through the real mob/npc catalogs (not
// one repeated id) so the key-path walk touches different keys, plus a few plain world
// objects that fall through every templateId branch to the raw-name path.
function buildLabelTargets(count: number): (() => string)[] {
  const targets: (() => string)[] = [];
  for (let i = 0; i < count; i++) {
    const mobId = MOB_IDS[i % MOB_IDS.length];
    const npcId = NPC_IDS[i % NPC_IDS.length];
    const obj = objectEntity('plain_object', `Object ${i}`);
    targets.push(() => mobDisplayName(mobId));
    targets.push(() => npcDisplayName(npcId));
    targets.push(() => objectDisplayName(obj));
  }
  return targets;
}

function runOnce(targets: (() => string)[]): void {
  for (const resolve of targets) resolve();
}

// Runs the fixed measurement recipe: warm up, sample SAMPLES iterations of resolving
// every target's label once, return the median (rejects one-off GC/scheduling spikes,
// same rationale as the canonical files).
function measureLabelMedian(count: number): number {
  const targets = buildLabelTargets(count);
  for (let i = 0; i < 10; i++) runOnce(targets); // warm up

  const SAMPLES = 60;
  const samples: number[] = [];
  for (let i = 0; i < SAMPLES; i++) {
    const start = performance.now();
    runOnce(targets);
    samples.push(performance.now() - start);
  }
  samples.sort((a, b) => a - b);
  return samples[Math.floor(samples.length / 2)];
}

describe('entity_labels resolution regression budget', () => {
  it('bounds the per-pass cost of resolving labels for a dense mixed entity population', () => {
    const COUNT = 150; // 450 label resolutions per pass (mob + npc + object each)
    const median = measureLabelMedian(COUNT);

    console.log(`[entity_labels perf] entities=${COUNT * 3} median=${median.toFixed(3)}ms`);

    // Generous by design (see mob_update_perf.test.ts): 450 key-path lookups plus
    // interpolation and the object branch chain is a small fraction of a millisecond
    // in healthy code. 10ms leaves ample headroom for slow/contended CI hardware while
    // still catching an order-of-magnitude sustained regression (e.g. a linear scan
    // over the whole catalog introduced per lookup instead of the current direct
    // property-path walk).
    expect(median).toBeLessThan(10);
  }, 30_000);

  it('doubling the label population does not more than roughly double the per-pass cost', () => {
    const SMALL = 80;
    const LARGE = SMALL * 2;

    const smallMedian = measureLabelMedian(SMALL);
    const largeMedian = measureLabelMedian(LARGE);

    console.log(
      `[entity_labels perf] scaling small=${SMALL * 3}labels(${smallMedian.toFixed(3)}ms) ` +
        `large=${LARGE * 3}labels(${largeMedian.toFixed(3)}ms) ratio=${(largeMedian / Math.max(smallMedian, 0.001)).toFixed(2)}x`,
    );

    // Each label resolution is independent of every other one, so doubling the
    // population should land near 2x. The bound is set generously above that to
    // absorb noise at these small absolute ms magnitudes while still failing hard on
    // a regression that makes resolution cost population-dependent (e.g. an
    // accidental full-catalog scan keyed off how many labels were already resolved).
    expect(largeMedian).toBeLessThan(Math.max(smallMedian * 3.5, 1));
  }, 30_000);

  it('repeat calls for the same entity stay cheap and deterministic (no cache to bust, none to grow)', () => {
    // entity_labels.ts/tEntity()/t() hold no per-key memoized value: this asserts the
    // honest substitute for a cache-reuse check given that fact. First: the resolved
    // value is byte-for-byte IDENTICAL across repeat calls (nothing stateful is
    // silently drifting the answer). Second: resolving the SAME id many times is not
    // measurably more expensive than resolving DIFFERENT ids the same number of times,
    // i.e. there is no hidden per-call growth (a leaking log/array keyed by call count)
    // that would only show up when one entity is queried repeatedly.
    const mobId = MOB_IDS[0];
    const first = mobDisplayName(mobId);
    for (let i = 0; i < 500; i++) {
      expect(mobDisplayName(mobId)).toBe(first);
    }

    const REPEATS = 2000;
    for (let i = 0; i < 20; i++) mobDisplayName(mobId); // warm up

    const sameIdStart = performance.now();
    for (let i = 0; i < REPEATS; i++) mobDisplayName(mobId);
    const sameIdMs = performance.now() - sameIdStart;

    const mixedIds = Array.from({ length: REPEATS }, (_, i) => MOB_IDS[i % MOB_IDS.length]);
    const mixedStart = performance.now();
    for (const id of mixedIds) mobDisplayName(id);
    const mixedMs = performance.now() - mixedStart;

    console.log(
      `[entity_labels perf] repeat-vs-mixed sameId=${sameIdMs.toFixed(3)}ms mixed=${mixedMs.toFixed(3)}ms`,
    );

    // Generous by design: repeatedly querying one id must not be markedly more (or
    // less) expensive per call than querying a rotating set of ids the same number of
    // times. A wide band (0.2x-5x) still catches a regression that adds real per-call
    // growth keyed off "same entity queried again" (which is exactly the shape a
    // half-implemented cache with a growing hit-tracking structure would produce).
    expect(sameIdMs).toBeLessThan(Math.max(mixedMs * 5, 5));
    expect(mixedMs).toBeLessThan(Math.max(sameIdMs * 5, 5));
  }, 30_000);
});
