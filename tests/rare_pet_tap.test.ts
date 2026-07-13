import { describe, expect, it } from 'vitest';
import { MOBS } from '../src/sim/data';
import { createMob } from '../src/sim/entity';
import { Sim } from '../src/sim/sim';
import type { Entity } from '../src/sim/types';

// Old Greyjaw (a rare with a single camp spawn) requires the fix: a pet acting
// ALONE (its owner never lands a hit) must not tap a rare, or one warlock's
// aggressive demon can re-tap Old Greyjaw the instant it respawns and lock
// every other player out of ever getting the quest fang. Ordinary (non-rare)
// mobs keep the classic pet-tap rule unchanged.

function spawnMob(
  sim: Sim,
  id: number,
  templateId: string,
  level: number,
  x: number,
  z: number,
): Entity {
  const mob = createMob(id, MOBS[templateId], level, { x, y: 0, z });
  sim.entities.set(id, mob);
  return mob;
}

describe('rare mob tap requires the owner, not just their pet', () => {
  it('a pet acting alone does not tap a rare mob', () => {
    const sim = new Sim({ seed: 42, playerClass: 'warlock', noPlayer: true });
    const pid = sim.addPlayer('warlock', 'Ashwyn');
    const greyjaw = spawnMob(sim, 90001, 'old_greyjaw', 4, 10, 10);
    const pet = spawnMob(sim, 90002, 'emberkin', 10, 10, 10);
    pet.ownerId = pid;

    sim.dealDamage(pet, greyjaw, 5, false, 'physical', null, 'hit');

    expect(greyjaw.tappedById).toBeNull();
  });

  it('the owner landing their own hit still taps a rare mob', () => {
    const sim = new Sim({ seed: 42, playerClass: 'warlock', noPlayer: true });
    const pid = sim.addPlayer('warlock', 'Ashwyn');
    const owner = sim.entities.get(pid)!;
    const greyjaw = spawnMob(sim, 90003, 'old_greyjaw', 4, 10, 10);

    sim.dealDamage(owner, greyjaw, 5, false, 'physical', null, 'hit');

    expect(greyjaw.tappedById).toBe(pid);
  });

  it('a pet acting alone still taps an ordinary (non-rare) mob', () => {
    const sim = new Sim({ seed: 42, playerClass: 'warlock', noPlayer: true });
    const pid = sim.addPlayer('warlock', 'Ashwyn');
    const boar = spawnMob(sim, 90004, 'wild_boar', 3, 10, 10);
    const pet = spawnMob(sim, 90005, 'emberkin', 10, 10, 10);
    pet.ownerId = pid;

    sim.dealDamage(pet, boar, 5, false, 'physical', null, 'hit');

    expect(boar.tappedById).toBe(pid);
  });

  it('a warlock who lands their own hit on a rare gets the quest fang from a pet-finished kill', () => {
    const sim = new Sim({ seed: 42, playerClass: 'warlock', noPlayer: true });
    const pid = sim.addPlayer('warlock', 'Ashwyn');
    const owner = sim.entities.get(pid)!;
    const meta = sim.meta(pid)!;
    meta.questLog.set('q_greyjaw', { questId: 'q_greyjaw', state: 'active', counts: [0] });
    const greyjaw = spawnMob(sim, 90006, 'old_greyjaw', 4, 10, 10);
    const pet = spawnMob(sim, 90007, 'emberkin', 10, 10, 10);
    pet.ownerId = pid;

    // the owner personally lands the first hit (establishes tap)...
    sim.dealDamage(owner, greyjaw, 5, false, 'physical', null, 'hit');
    expect(greyjaw.tappedById).toBe(pid);
    // ...then the pet lands the killing blow.
    sim.dealDamage(pet, greyjaw, 100000, false, 'physical', null, 'hit');

    expect(greyjaw.dead).toBe(true);
    expect(greyjaw.loot?.items.some((s) => s.itemId === 'greyjaw_fang')).toBe(true);
  });
});
