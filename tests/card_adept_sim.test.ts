import { describe, expect, it } from 'vitest';
import { MOBS } from '../src/sim/data';
import { createMob } from '../src/sim/entity';
import { Sim } from '../src/sim/sim';
import { groundHeight } from '../src/sim/world';

function makeCardAdept(seed = 7): Sim {
  return new Sim({ seed, playerClass: 'card_adept', autoEquip: true });
}

function spawnTarget(sim: Sim): ReturnType<typeof createMob> {
  const p = sim.player;
  const x = p.pos.x + 3;
  const z = p.pos.z;
  const mob = createMob(99999, MOBS.forest_wolf, 5, { x, y: groundHeight(x, z, sim.cfg.seed), z });
  mob.hp = mob.maxHp;
  (sim as any).addEntity(mob);
  (sim as any).rebucket(mob);
  return mob;
}

describe('Card Adept in the live sim', () => {
  it('a card_adept player is created with a deck', () => {
    const sim = makeCardAdept();
    const meta = sim.players.get(sim.player.id)!;
    expect(meta.cardHand).toBeTruthy();
    expect(meta.cardHand!.deck.length).toBeGreaterThan(0);
    expect(sim.player.resourceType).toBe('energy');
  });

  it('draws an opening hand on the combat rising edge', () => {
    const sim = makeCardAdept();
    const meta = sim.players.get(sim.player.id)!;
    expect(meta.cardHand!.hand.length).toBe(0);
    sim.player.inCombat = true;
    sim.tick();
    expect(meta.cardHand!.hand.length).toBeGreaterThan(0);
    expect(meta.cardHand!.inCombat).toBe(true);
  });

  it('returns the hand to the deck when combat ends', () => {
    const sim = makeCardAdept();
    const meta = sim.players.get(sim.player.id)!;
    const total = meta.cardHand!.deck.length;
    sim.player.inCombat = true;
    sim.tick();
    sim.player.inCombat = false;
    sim.tick();
    expect(meta.cardHand!.inCombat).toBe(false);
    expect(meta.cardHand!.deck.length).toBe(total);
    expect(meta.cardHand!.hand.length).toBe(0);
  });

  it('playing a damage card spends Focus, discards it, and damages the target', () => {
    const sim = makeCardAdept();
    const meta = sim.players.get(sim.player.id)!;
    const mob = spawnTarget(sim);
    mob.level = 1; // even hit table vs the level-1 player, so a card rarely misses
    sim.player.inCombat = true;
    sim.tick();
    sim.player.targetId = mob.id;
    sim.player.facing = Math.atan2(mob.pos.x - sim.player.pos.x, mob.pos.z - sim.player.pos.z);
    const hpBefore = mob.hp;
    // Play an Arcane Bolt card. On the first play, Focus is spent and the card is
    // discarded (deterministic). Replay a few times to absorb a possible miss.
    meta.cardHand!.hand = ['card_arcane_bolt'];
    sim.player.resource = 100;
    const focusBefore = sim.player.resource;
    sim.playCard(0);
    expect(sim.player.resource).toBeLessThan(focusBefore);
    expect(meta.cardHand!.discard).toContain('card_arcane_bolt');
    for (let attempt = 0; attempt < 8 && mob.hp === hpBefore; attempt++) {
      for (let i = 0; i < 10 && mob.hp === hpBefore; i++) sim.tick();
      if (mob.hp === hpBefore) {
        meta.cardHand!.hand = ['card_arcane_bolt'];
        sim.player.resource = 100;
        sim.player.facing = Math.atan2(mob.pos.x - sim.player.pos.x, mob.pos.z - sim.player.pos.z);
        sim.playCard(0);
      }
    }
    expect(mob.hp).toBeLessThan(hpBefore);
  });

  it('does not play a card the player cannot afford', () => {
    const sim = makeCardAdept();
    const meta = sim.players.get(sim.player.id)!;
    sim.player.inCombat = true;
    sim.tick();
    meta.cardHand!.hand = ['card_royal_flush']; // cost 80
    sim.player.resource = 10;
    sim.playCard(0);
    // Unaffordable: the card stays in hand, nothing discarded.
    expect(meta.cardHand!.hand).toContain('card_royal_flush');
    expect(meta.cardHand!.discard).not.toContain('card_royal_flush');
  });
});
