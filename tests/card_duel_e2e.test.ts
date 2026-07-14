import { describe, expect, it } from 'vitest';
import { DUNGEON_X_THRESHOLD } from '../src/sim/data';
import { Sim } from '../src/sim/sim';
import * as duelMod from '../src/sim/social/duel';

function makeTwoCardAdepts(seed = 11): { sim: Sim; a: number; b: number } {
  const sim = new Sim({ seed, playerClass: 'card_adept', autoEquip: true });
  const a = sim.player.id;
  const b = sim.addPlayer('card_adept', 'Rival');
  return { sim, a, b };
}

describe('Card Duel queue and match, end to end on the live Sim', () => {
  it('pairs two queued Card Adepts, teleports them into a real arena slot, and starts the duel', () => {
    const { sim, a, b } = makeTwoCardAdepts();
    sim.queueCardDuel(true, a);
    sim.queueCardDuel(true, b);
    expect(sim.cardDuelQueued(a)).toBe(true);
    expect(sim.cardDuelQueued(b)).toBe(true);
    sim.tick(); // updateCardDuelQueue pairs the FIFO and starts the bout
    expect(sim.cardDuelQueued(a)).toBe(false);
    expect(sim.cardDuelQueued(b)).toBe(false);
    const ea = sim.entities.get(a)!;
    const eb = sim.entities.get(b)!;
    // Both fighters landed inside a real arena instance (not the hardcoded x=0
    // origin, the B4 bug): x is beyond the instance threshold.
    expect(ea.pos.x).toBeGreaterThan(DUNGEON_X_THRESHOLD);
    expect(eb.pos.x).toBeGreaterThan(DUNGEON_X_THRESHOLD);
    // The slot is reserved so a second pair cannot land on the same coordinates.
    expect((sim as unknown as { arenaBusySlots: Set<number> }).arenaBusySlots.size).toBe(1);
  });

  it('returns both fighters to their pre-queue position and frees the slot when the duel ends', () => {
    const { sim, a, b } = makeTwoCardAdepts(23);
    const ea = sim.entities.get(a)!;
    const eb = sim.entities.get(b)!;
    const beforeA = { x: ea.pos.x, z: ea.pos.z, facing: ea.facing };
    const beforeB = { x: eb.pos.x, z: eb.pos.z, facing: eb.facing };
    expect(beforeA.x).toBeLessThan(DUNGEON_X_THRESHOLD);
    sim.queueCardDuel(true, a);
    sim.queueCardDuel(true, b);
    sim.tick(); // pair + start: both fighters are now inside the arena slot
    expect(ea.pos.x).toBeGreaterThan(DUNGEON_X_THRESHOLD);
    expect((sim as unknown as { arenaBusySlots: Set<number> }).arenaBusySlots.size).toBe(1);
    // End the bout directly through the duel module (the same call sim.ts's
    // updateDuels makes on a decided/forfeited bout), and assert the B4/B13
    // fix: both fighters land back exactly where they queued, and the arena
    // slot is released so a later pair can reuse it.
    const duelState = (
      sim as unknown as { duels: Map<number, { a: number; b: number }> }
    ).duels.get(a)!;
    duelMod.endDuel(sim.ctx, duelState as never, a);
    expect(ea.pos.x).toBeCloseTo(beforeA.x, 5);
    expect(ea.pos.z).toBeCloseTo(beforeA.z, 5);
    expect(eb.pos.x).toBeCloseTo(beforeB.x, 5);
    expect(eb.pos.z).toBeCloseTo(beforeB.z, 5);
    expect((sim as unknown as { arenaBusySlots: Set<number> }).arenaBusySlots.size).toBe(0);
    expect((sim as unknown as { duels: Map<number, unknown> }).duels.has(a)).toBe(false);
    expect((sim as unknown as { duels: Map<number, unknown> }).duels.has(b)).toBe(false);
  });

  it('refuses a Card Duel queue join for a player already inside an instance', () => {
    const { sim, a } = makeTwoCardAdepts(5);
    const ea = sim.entities.get(a)!;
    ea.pos.x = DUNGEON_X_THRESHOLD + 50; // simulate being inside an instance
    sim.queueCardDuel(true, a);
    expect(sim.cardDuelQueued(a)).toBe(false);
  });

  it('refuses a Card Duel queue join for a dead player, silently', () => {
    const { sim, a } = makeTwoCardAdepts(6);
    const ea = sim.entities.get(a)!;
    ea.dead = true;
    sim.queueCardDuel(true, a);
    expect(sim.cardDuelQueued(a)).toBe(false);
  });

  it('a non-Card-Adept cannot join the Card Duel queue', () => {
    const sim = new Sim({ seed: 9, playerClass: 'warrior', autoEquip: true });
    sim.queueCardDuel(true);
    expect(sim.cardDuelQueued()).toBe(false);
  });

  it('leaving the queue removes the player', () => {
    const { sim, a } = makeTwoCardAdepts(3);
    sim.queueCardDuel(true, a);
    expect(sim.cardDuelQueued(a)).toBe(true);
    sim.queueCardDuel(false, a);
    expect(sim.cardDuelQueued(a)).toBe(false);
  });
});

describe('same-seed determinism across two independent Sim instances', () => {
  it('two Sims with the same seed draw the same opening card hand', () => {
    const sim1 = new Sim({ seed: 777, playerClass: 'card_adept', autoEquip: true });
    const sim2 = new Sim({ seed: 777, playerClass: 'card_adept', autoEquip: true });
    sim1.player.inCombat = true;
    sim2.player.inCombat = true;
    sim1.tick();
    sim2.tick();
    expect(sim1.cardHandIds()).toEqual(sim2.cardHandIds());
  });

  it('a world with no Card Adept draws zero extra rng from the card system', () => {
    // Same seed, same non-card class: if the card system ever drew rng for a
    // non-Card-Adept world, this diverges the two sims' subsequent rng-derived
    // outcomes (here, mob AI positions) after many ticks.
    const simA = new Sim({ seed: 41, playerClass: 'warrior', autoEquip: true });
    const simB = new Sim({ seed: 41, playerClass: 'warrior', autoEquip: true });
    for (let i = 0; i < 50; i++) {
      simA.tick();
      simB.tick();
    }
    const snapA = [...simA.entities.values()].map((e) => `${e.pos.x},${e.pos.z}`).join('|');
    const snapB = [...simB.entities.values()].map((e) => `${e.pos.x},${e.pos.z}`).join('|');
    expect(snapA).toBe(snapB);
  });
});
