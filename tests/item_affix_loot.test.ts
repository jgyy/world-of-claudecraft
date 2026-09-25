// src/sim/loot/item_affix_loot.ts: applies the affix roll once, after a
// source has finished selecting its ordinary drops, exactly like the
// permanent-quality roller it mirrors (loot/enemy_quality.ts).
import { describe, expect, it } from 'vitest';
import { ITEMS, MOBS } from '../src/sim/data';
import { createMob } from '../src/sim/entity';
import { rollItemAffixes } from '../src/sim/loot/item_affix_loot';
import { Rng } from '../src/sim/rng';
import type { Entity, ItemDef, LootSlot } from '../src/sim/types';

const AFFIXABLE_ITEM_ID = 'test_affixable_sword';
const PLAIN_ITEM_ID = 'test_plain_sword';

const AFFIXABLE_ITEM: ItemDef = {
  id: AFFIXABLE_ITEM_ID,
  name: 'Test Affixable Sword',
  kind: 'weapon',
  slot: 'mainhand',
  hand: 'twohand',
  quality: 'uncommon',
  weapon: { min: 39, max: 58, speed: 3.3 },
  sellValue: 500,
  affixable: true,
};

const PLAIN_ITEM: ItemDef = {
  ...AFFIXABLE_ITEM,
  id: PLAIN_ITEM_ID,
  affixable: undefined,
};

(ITEMS as Record<string, ItemDef>)[AFFIXABLE_ITEM_ID] = AFFIXABLE_ITEM;
(ITEMS as Record<string, ItemDef>)[PLAIN_ITEM_ID] = PLAIN_ITEM;

function wildMob(id = 1): Entity {
  return createMob(id, MOBS.forest_wolf, 20, { x: 0, y: 0, z: 0 });
}

describe('rollItemAffixes', () => {
  it('leaves a non-affixable item slot completely untouched', () => {
    const mob = wildMob();
    const slots: LootSlot[] = [{ itemId: PLAIN_ITEM_ID, count: 1 }];
    const rolled = rollItemAffixes(new Rng(1), mob, slots);
    expect(rolled).toEqual(slots);
    expect(rolled[0].instance).toBeUndefined();
  });

  it('rolls an affix onto an affixable item slot, stamping instance.affixId and rolled.stats', () => {
    const mob = wildMob();
    const slots: LootSlot[] = [{ itemId: AFFIXABLE_ITEM_ID, count: 1 }];
    const rolled = rollItemAffixes(new Rng(1), mob, slots);
    expect(rolled).toHaveLength(1);
    expect(rolled[0].instance?.affixId).toBeTruthy();
    expect(rolled[0].instance?.rolled?.stats).toBeTruthy();
    expect(Object.keys(rolled[0].instance?.rolled?.stats ?? {}).length).toBeGreaterThan(0);
  });

  it('draws nothing (and mints nothing) for an owned or dummy kill', () => {
    const owned = { ...wildMob(), ownerId: 5 };
    const slots: LootSlot[] = [{ itemId: AFFIXABLE_ITEM_ID, count: 1 }];
    const rolled = rollItemAffixes(new Rng(1), owned, slots);
    expect(rolled).toEqual(slots);
    expect(rolled[0].instance).toBeUndefined();
  });

  it('skips a caller-excluded slot (the quest-slot contract loot_roll.ts relies on)', () => {
    const mob = wildMob();
    const slot: LootSlot = { itemId: AFFIXABLE_ITEM_ID, count: 1 };
    const rolled = rollItemAffixes(new Rng(1), mob, [slot], new Set([slot]));
    expect(rolled[0]).toBe(slot);
    expect(rolled[0].instance).toBeUndefined();
  });

  it('splits a multi-count stack into one independently-rolled copy per unit', () => {
    const mob = wildMob();
    const slots: LootSlot[] = [{ itemId: AFFIXABLE_ITEM_ID, count: 3 }];
    const rolled = rollItemAffixes(new Rng(1), mob, slots);
    expect(rolled).toHaveLength(3);
    for (const slot of rolled) {
      expect(slot.count).toBe(1);
      expect(slot.itemId).toBe(AFFIXABLE_ITEM_ID);
      expect(slot.instance?.affixId).toBeTruthy();
    }
  });

  it('never rolls a second affix onto a copy that already carries one', () => {
    const mob = wildMob();
    const slots: LootSlot[] = [
      {
        itemId: AFFIXABLE_ITEM_ID,
        count: 1,
        instance: { affixId: 'green_bear', rolled: { stats: { str: 6 } } },
      },
    ];
    const before = JSON.stringify(slots);
    const rolled = rollItemAffixes(new Rng(1), mob, slots);
    expect(JSON.stringify(rolled)).toBe(before);
  });

  it('is deterministic: same seed, same mob, same rolled result', () => {
    const slots: LootSlot[] = [{ itemId: AFFIXABLE_ITEM_ID, count: 1 }];
    const a = rollItemAffixes(new Rng(9), wildMob(1), [...slots]);
    const b = rollItemAffixes(new Rng(9), wildMob(2), [...slots]);
    expect(a[0].instance?.affixId).toBe(b[0].instance?.affixId);
    expect(a[0].instance?.rolled?.stats).toEqual(b[0].instance?.rolled?.stats);
  });
});
