// Pins the item binding rules (src/sim/item_binding.ts): which defs bind on
// equip, how the per-copy soulbound marker reads, and the tooltip kind the
// HUD renders from both. The live equip/transfer paths that consume these
// are pinned end to end in tests/bind_on_equip.test.ts.
import { describe, expect, it } from 'vitest';
import { ITEMS } from '../src/sim/data';
import {
  bindsOnEquip,
  boundOnUnequipPayload,
  isSoulboundInstance,
  itemBindingKind,
} from '../src/sim/item_binding';
import { QUALITY_RANK } from '../src/sim/loot_master';
import type { ItemDef } from '../src/sim/types';

const def = (over: Partial<ItemDef>): ItemDef =>
  ({ id: 'x', name: 'X', kind: 'armor', slot: 'chest', sellValue: 1, ...over }) as ItemDef;

describe('bindsOnEquip', () => {
  it('every equippable green-or-better def binds unless BoP or a quest item', () => {
    expect(bindsOnEquip(def({ quality: 'uncommon' }))).toBe(true);
    expect(bindsOnEquip(def({ quality: 'rare' }))).toBe(true);
    expect(bindsOnEquip(def({ quality: 'epic', kind: 'weapon', slot: 'mainhand' }))).toBe(true);
    expect(bindsOnEquip(def({ quality: 'legendary', kind: 'held_offhand' }))).toBe(true);
    // Below green: the leveling whites and grays stay free forever.
    expect(bindsOnEquip(def({ quality: 'common' }))).toBe(false);
    expect(bindsOnEquip(def({ quality: 'poor' }))).toBe(false);
    expect(bindsOnEquip(def({}))).toBe(false); // absent quality reads as common
    // Already bound from pickup, or a quest deliverable: never BoE on top.
    expect(bindsOnEquip(def({ quality: 'epic', soulbound: true }))).toBe(false);
    expect(bindsOnEquip(def({ quality: 'rare', questId: 'q_x' }))).toBe(false);
    expect(bindsOnEquip(undefined)).toBe(false);
  });

  it('only paperdoll kinds bind: a green potion, bag, or mount never does', () => {
    for (const kind of ['potion', 'food', 'drink', 'tool', 'bag', 'mount', 'junk', 'quest'] as const) {
      expect(bindsOnEquip(def({ kind, quality: 'epic', slot: undefined })), kind).toBe(false);
    }
  });

  it('the explicit override wins in both directions', () => {
    expect(bindsOnEquip(def({ quality: 'epic', bindOnEquip: false }))).toBe(false);
    expect(bindsOnEquip(def({ quality: 'common', bindOnEquip: true }))).toBe(true);
    expect(bindsOnEquip(def({ kind: 'junk', bindOnEquip: true }))).toBe(true);
  });

  it('holds over the shipped catalog: BoE is exactly green-plus gear that is not BoP or quest', () => {
    let boe = 0;
    for (const item of Object.values(ITEMS)) {
      const equippable = item.kind === 'weapon' || item.kind === 'armor' || item.kind === 'held_offhand';
      const green = QUALITY_RANK[item.quality ?? 'common'] >= QUALITY_RANK.uncommon;
      const expected =
        item.bindOnEquip ?? (equippable && green && !item.soulbound && item.questId === undefined);
      expect(bindsOnEquip(item), item.id).toBe(expected);
      if (expected) boe++;
      // A BoP def never also declares BoE: the two rules are exclusive.
      if (item.soulbound) expect(item.bindOnEquip, item.id).toBeUndefined();
    }
    // The rule is live over real content, not vacuously true of an empty set.
    expect(boe).toBeGreaterThan(100);
  });
});

describe('the per-copy soulbound marker', () => {
  it('reads only an exact true', () => {
    expect(isSoulboundInstance({ soulbound: true })).toBe(true);
    expect(isSoulboundInstance({})).toBe(false);
    expect(isSoulboundInstance(undefined)).toBe(false);
    expect(isSoulboundInstance({ soulbound: 1 as unknown as true })).toBe(false);
    expect(isSoulboundInstance({ boundTo: 3 })).toBe(false); // the Maker's Bond is a different axis
  });

  it('boundOnUnequipPayload stamps a BoE piece on a NEW object and leaves everything else alone', () => {
    const boe = def({ quality: 'rare' });
    const worn = { enchant: 'ench_stat_str' };
    const benched = boundOnUnequipPayload(boe, worn);
    expect(benched).toEqual({ enchant: 'ench_stat_str', soulbound: true });
    expect(benched).not.toBe(worn);
    expect(worn).toEqual({ enchant: 'ench_stat_str' }); // never mutated
    // A plain worn copy (no payload) gains exactly the marker.
    expect(boundOnUnequipPayload(boe, undefined)).toEqual({ soulbound: true });
    // Already bound: the same reference back, no second stamp.
    const bound = { soulbound: true as const };
    expect(boundOnUnequipPayload(boe, bound)).toBe(bound);
    // Not BoE: the input reference, undefined included, so "no payload" still
    // means "plain stack" to the bench.
    const plain = def({ quality: 'common' });
    expect(boundOnUnequipPayload(plain, undefined)).toBeUndefined();
    expect(boundOnUnequipPayload(plain, worn)).toBe(worn);
    expect(boundOnUnequipPayload(def({ quality: 'epic', soulbound: true }), undefined)).toBeUndefined();
  });
});

describe('itemBindingKind (the tooltip line)', () => {
  it('BoP def and bound copies read Soulbound, a never-worn BoE piece reads Binds when equipped', () => {
    expect(itemBindingKind(def({ quality: 'epic', soulbound: true }), undefined)).toBe('soulbound');
    expect(itemBindingKind(def({ quality: 'rare' }), { soulbound: true })).toBe('soulbound');
    expect(itemBindingKind(def({ quality: 'rare' }), undefined)).toBe('bindOnEquip');
    expect(itemBindingKind(def({ quality: 'rare' }), { enchant: 'x' })).toBe('bindOnEquip');
    // Worn: a BoE piece is bound by the slot it sits in.
    expect(itemBindingKind(def({ quality: 'rare' }), undefined, true)).toBe('soulbound');
    // Nothing binds a white, a potion, or a quest item.
    expect(itemBindingKind(def({ quality: 'common' }), undefined)).toBeNull();
    expect(itemBindingKind(def({ quality: 'common' }), undefined, true)).toBeNull();
    expect(itemBindingKind(def({ kind: 'potion', quality: 'rare' }), undefined)).toBeNull();
    expect(itemBindingKind(undefined, { soulbound: true })).toBeNull();
  });
});
