// Perf/regression budget for pet/pet_ai.ts (updatePet) for many simultaneous pets: a
// full raid of hunters, each with an active pet in combat with a nearby target. Mirrors
// the measurement recipe in tests/mob_update_perf.test.ts / tests/aura_tick_perf.test.ts:
// warm up, sample many iterations, take the MEDIAN, assert a generous absolute budget
// plus a scaling check.
//
// updatePet is a SimContext-seam function, not wired to a named sim.tick() perfLap
// phase (it runs inside the shared mob AI pass), so this file calls it directly in a
// loop against a real Sim's ctx for every pet, exactly like tests/pet_ai.test.ts does.
import { describe, expect, it } from 'vitest';
import { updatePet } from '../src/sim/pet/pet_ai';
import { Sim } from '../src/sim/sim';
import type { Entity } from '../src/sim/types';

const WORLD_SEED = 20065;

// biome-ignore lint/suspicious/noExplicitAny: mirrors the AnySim idiom used throughout tests/pet_ai.test.ts to reach the SimContext seam.
const ctxOf = (sim: Sim): any => (sim as any).ctx;

// Build a raid of `count` hunters, each with a persistent pet adopted from the wild
// spawn set, actively engaged (in combat, target set) with a dedicated nearby hostile
// mob target: the worst-case updatePet shape (the combat arm: target-in-range melee
// swing / taunt-check path, not the cheap heel arm).
function buildPetRaid(count: number): { sim: Sim; pets: Entity[] } {
  const sim = new Sim({ seed: WORLD_SEED, playerClass: 'hunter', noPlayer: true });
  const wildMobs = [...sim.entities.values()].filter(
    (e) => e.kind === 'mob' && !e.dead && e.ownerId === null,
  );
  if (wildMobs.length < count * 2) {
    throw new Error(`fixture world does not have enough wild mobs for a ${count}-pet raid`);
  }

  const pets: Entity[] = [];
  for (let i = 0; i < count; i++) {
    const pid = sim.addPlayer('hunter', `Hunter${i}`);
    const owner = sim.entities.get(pid) as Entity;
    const x = (i % 20) * 6;
    const z = Math.floor(i / 20) * 6;
    owner.pos = { x, y: 0, z };
    owner.prevPos = { ...owner.pos };
    owner.dead = false;

    const pet = wildMobs[i * 2];
    pet.ownerId = pid;
    pet.hostile = false;
    pet.dead = false;
    pet.hp = pet.maxHp;
    pet.pos = { x: x + 1, y: 0, z };
    pet.prevPos = { ...pet.pos };
    pet.petMode = 'aggressive';
    pet.petAutoTaunt = false;

    const target = wildMobs[i * 2 + 1];
    target.hostile = true;
    target.dead = false;
    target.hp = 1_000_000;
    target.maxHp = 1_000_000;
    target.pos = { x: x + 2, y: 0, z }; // within melee reach of the pet
    target.prevPos = { ...target.pos };
    target.ownerId = null;

    pet.aggroTargetId = target.id;
    pet.inCombat = true;

    pets.push(pet);
  }
  sim.grid.refresh(sim.entities.values());
  return { sim, pets };
}

function measureRaidTickMedian(count: number, samples: number): number {
  const { sim, pets } = buildPetRaid(count);
  const ctx = ctxOf(sim);

  // Warm up.
  for (let i = 0; i < 5; i++) for (const pet of pets) updatePet(ctx, pet);

  const times: number[] = [];
  for (let i = 0; i < samples; i++) {
    const start = performance.now();
    for (const pet of pets) updatePet(ctx, pet);
    times.push(performance.now() - start);
  }
  times.sort((a, b) => a - b);
  return times[Math.floor(times.length / 2)];
}

describe('pet AI (updatePet) high-load regression budget', () => {
  it('bounds the per-tick cost of a full raid of active pets', () => {
    const COUNT = 40; // a full raid's worth of hunter/warlock pets

    const median = measureRaidTickMedian(COUNT, 60);

    console.log(`[pet_ai.update perf] pets=${COUNT} median=${median.toFixed(3)}ms`);

    // Generous by design (see mob_update_perf.test.ts): observed healthy median for a
    // 40-pet full-raid combat tick is a low single-digit ms figure; 25ms leaves ample
    // headroom for slow/contended CI hardware under one 20 Hz tick (50ms) while still
    // catching a sustained order-of-magnitude regression.
    expect(median).toBeLessThan(25);
  }, 60_000);

  it('doubling the pet count does not more than roughly double the per-tick cost', () => {
    const SMALL = 20;
    const LARGE = SMALL * 2;

    const smallMedian = measureRaidTickMedian(SMALL, 40);
    const largeMedian = measureRaidTickMedian(LARGE, 40);

    console.log(
      `[pet_ai.update perf] scaling small=${SMALL}(${smallMedian.toFixed(3)}ms) ` +
        `large=${LARGE}(${largeMedian.toFixed(3)}ms) ` +
        `ratio=${(largeMedian / Math.max(smallMedian, 0.0001)).toFixed(2)}x`,
    );

    // A doubled pet count doing genuinely linear per-pet work should land near 2x; the
    // bound is set generously above that (3.5x) to absorb noise at small absolute ms
    // magnitudes while still failing hard on an O(n^2) regression (e.g. petPickTarget or
    // pullNearbyMobs losing their radius-scoped grid query and scanning every entity).
    expect(largeMedian).toBeLessThan(Math.max(smallMedian * 3.5, 5));
  }, 60_000);

  it('actually built a full raid of engaged pets in melee combat (shape sanity)', () => {
    const COUNT = 40;
    const { sim, pets } = buildPetRaid(COUNT);
    const ctx = ctxOf(sim);
    expect(pets.length).toBe(COUNT);

    let engaged = 0;
    for (const pet of pets) {
      updatePet(ctx, pet);
      if (pet.inCombat && pet.aggroTargetId !== null) engaged++;
    }
    // Every pet in the raid should still be actively engaged with its target after an
    // update tick: proves the worst-case shape (a full raid, all in combat) was really
    // built, not an idle or empty one.
    expect(engaged).toBe(COUNT);
  });
});
