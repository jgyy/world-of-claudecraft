// Heal-absorb shields (classic necrotic blight, e.g. the Gravecaller Summoner's
// "Grave Blight") must devour EVERY source of incoming healing, not just direct
// heals. Before the fix, consumeHealAbsorb ran only inside applyHeal, so a
// heal-over-time tick, or a food/drink regen tick, added hp directly and slipped
// past the shield, letting the debuff expire unused. These tests pin that every
// heal path is drained by the shield.
import { describe, expect, it } from 'vitest';
import { updateAuras, updateRegen } from '../src/sim/combat/auras';
import { Sim } from '../src/sim/sim';
import type { Aura, Entity } from '../src/sim/types';

const makeSim = () => new Sim({ seed: 7, playerClass: 'warrior', autoEquip: true });

function pushAbsorb(e: Entity, value: number): void {
  e.auras.push({
    id: 'heal_absorb_test',
    name: 'Grave Blight',
    kind: 'heal_absorb',
    remaining: 10,
    duration: 10,
    value,
    sourceId: 999,
    school: 'shadow',
  });
}

function absorbValue(e: Entity): number | undefined {
  return e.auras.find((a) => a.kind === 'heal_absorb')?.value;
}

describe('heal-absorb drains every healing path', () => {
  it('absorbs a heal-over-time tick instead of letting it land', () => {
    const sim = makeSim();
    const p = sim.player;
    p.maxHp = 1000;
    p.hp = 500;
    pushAbsorb(p, 100);
    // A HoT that ticks immediately for 60 per tick.
    const hot: Aura = {
      id: 'hot_test',
      name: 'Rejuvenation',
      kind: 'hot',
      remaining: 10,
      duration: 10,
      value: 60,
      sourceId: p.id,
      school: 'nature',
      tickInterval: 2,
      tickTimer: 0,
    };
    p.auras.push(hot);
    updateAuras((sim as any).ctx, p);
    // 60 healing fully eaten: hp unchanged, shield drained 100 -> 40.
    expect(p.hp).toBe(500);
    expect(absorbValue(p)).toBe(40);
  });

  it('absorbs a food/drink regen tick', () => {
    const sim = makeSim();
    const p = sim.player;
    p.maxHp = 1000;
    p.hp = 500;
    p.inCombat = true; // isolate the food tick from passive out-of-combat regen
    pushAbsorb(p, 1000);
    p.eating = { itemId: 'test_food', kind: 'food', hpPer2s: 80, manaPer2s: 0, remaining: 20 };
    (sim as any).tickCount = 40; // updateRegen runs every 40 ticks
    updateRegen((sim as any).ctx, p, (sim as any).players.get(p.id));
    // The food tick is devoured: hp unchanged, shield drained 1000 -> 920.
    expect(p.hp).toBe(500);
    expect(absorbValue(p)).toBe(920);
  });

  it('absorbs a healing-potion quaff', () => {
    const sim = makeSim();
    const p = sim.player;
    p.maxHp = 1000;
    p.hp = 500;
    (sim as any).addItem('minor_healing_potion', 1, p.id); // potionHp 90
    pushAbsorb(p, 1000);
    sim.useItem('minor_healing_potion', p.id);
    // The 90 potion heal is devoured: hp unchanged, shield drained 1000 -> 910.
    expect(p.hp).toBe(500);
    expect(absorbValue(p)).toBe(910);
  });

  it('does not double-process the HoT on the tick a shield it drains depletes', () => {
    // Regression for a mutate-during-loop bug: updateAuras walks e.auras with a
    // reverse-index loop, and consumeHealAbsorb used to splice the depleted shield
    // out of that same array from inside the loop. When the shield sits at a lower
    // index than the HoT (the common case: the shield was applied first), the splice
    // shifts the HoT from index i to i-1, so the reverse loop's next iteration
    // re-reads it and takes a second, spurious `remaining -= DT` / `tickTimer -= DT`.
    const sim = makeSim();
    const p = sim.player;
    p.maxHp = 1000;
    p.hp = 500;
    // Shield pushed BEFORE the HoT so it sits at the lower array index.
    pushAbsorb(p, 10); // smaller than the HoT tick, so it depletes this tick.
    const hot: Aura = {
      id: 'hot_test',
      name: 'Rejuvenation',
      kind: 'hot',
      remaining: 10,
      duration: 10,
      value: 60,
      sourceId: p.id,
      school: 'nature',
      tickInterval: 2,
      tickTimer: 0,
    };
    p.auras.push(hot);
    updateAuras((sim as any).ctx, p);
    // A single DT (1/20 = 0.05) of aging: remaining 10 -> 9.95, tickTimer wraps to
    // tickInterval - DT = 1.95. The doubled bug produced 9.90 / 1.90 instead.
    const survivingHot = p.auras.find((a) => a.id === 'hot_test');
    expect(survivingHot).toBeDefined();
    expect(survivingHot?.remaining).toBeCloseTo(9.95, 6);
    expect(survivingHot?.tickTimer).toBeCloseTo(1.95, 6);
    // 10 of the 60 healing was absorbed by the depleting shield; 50 landed.
    expect(p.hp).toBe(550);
    // The depleted shield is zeroed, not spliced out of the array mid-loop.
    expect(absorbValue(p)).toBe(0);
  });

  it('lets the HoT heal normally once the shield is gone', () => {
    const sim = makeSim();
    const p = sim.player;
    p.maxHp = 1000;
    p.hp = 500;
    const hot: Aura = {
      id: 'hot_test',
      name: 'Rejuvenation',
      kind: 'hot',
      remaining: 10,
      duration: 10,
      value: 60,
      sourceId: p.id,
      school: 'nature',
      tickInterval: 2,
      tickTimer: 0,
    };
    p.auras.push(hot);
    updateAuras((sim as any).ctx, p);
    expect(p.hp).toBe(560);
  });
});
