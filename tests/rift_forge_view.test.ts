// The Rift Forge window's pure core (src/ui/hud/rift_forge/rift_forge_view.ts).
//
// Pins: one row per Riftbound band from bags AND worn slots (worn rows carry
// no affordance), the next-upgrade cost quoted from the sim's own ladder and
// gated on the essence in the bags, the top of the ladder answering null, the
// enchant gate, the socketable list (owned gems only, only while a socket is
// open), and the wallet counts summed across stacks. Same snapshot shape as
// both hosts (IWorld.inventory / equipment / equipmentInstances).

import { describe, expect, it } from 'vitest';
import { RIFT_ESSENCE_ITEM_ID, RIFT_GEM_IDS } from '../src/sim/content/rift/items';
import {
  createRiftGearInstance,
  RIFT_ENCHANT_COST,
  RIFT_ENCHANT_STATS,
  riftUpgradeCost,
} from '../src/sim/rift/progression';
import type { InvSlot } from '../src/sim/types';
import { buildRiftForgeView } from '../src/ui/hud/rift_forge';

function band(tier: 'C' | 'S' = 'S', upgradeLevel = 0) {
  const gear = createRiftGearInstance(`view-${tier}`, tier, 'warrior', 1);
  if (gear.instance.rift) gear.instance.rift.upgradeLevel = upgradeLevel;
  return gear;
}

describe('buildRiftForgeView', () => {
  it('lists a bagged band with the sim cost ladder and the essence gate', () => {
    const gear = band('S', 1);
    const inventory: InvSlot[] = [
      { itemId: 'linen_cloth', count: 3 },
      { itemId: gear.itemId, count: 1, instance: gear.instance },
      { itemId: RIFT_ESSENCE_ITEM_ID, count: 3 },
      { itemId: RIFT_ESSENCE_ITEM_ID, count: 2 },
    ];
    const view = buildRiftForgeView({ inventory, equipment: {}, equipmentInstances: {} });
    expect(view.essence).toBe(5);
    expect(view.enchantStats).toBe(RIFT_ENCHANT_STATS);
    expect(view.rings).toHaveLength(1);
    const r = view.rings[0];
    expect(r.source).toEqual({ kind: 'bag', slotIndex: 1 });
    expect(r.tier).toBe('S');
    expect(r.upgradeLevel).toBe(1);
    expect(r.nextUpgradeCost).toBe(riftUpgradeCost(1));
    expect(r.canUpgrade).toBe(true); // 5 >= 4
    expect(r.enchantCost).toBe(RIFT_ENCHANT_COST);
    expect(r.canEnchant).toBe(true); // 5 >= 4
    expect(r.gemSlots).toBe(2);
    expect(r.socketable).toEqual([]); // no gems owned
    expect(r.worn).toBe(false);
  });

  it('answers null at the top of the ladder and gates both spends on essence', () => {
    const gear = band('C', 0);
    if (gear.instance.rift) gear.instance.rift.upgradeLevel = gear.instance.rift.maxUpgradeLevel;
    const inventory: InvSlot[] = [
      { itemId: gear.itemId, count: 1, instance: gear.instance },
      { itemId: RIFT_ESSENCE_ITEM_ID, count: RIFT_ENCHANT_COST - 1 },
    ];
    const r = buildRiftForgeView({ inventory, equipment: {}, equipmentInstances: {} }).rings[0];
    expect(r.nextUpgradeCost).toBeNull();
    expect(r.canUpgrade).toBe(false);
    expect(r.canEnchant).toBe(false);
  });

  it('offers only OWNED gems, and none once every socket is filled', () => {
    const gear = band('C'); // one socket
    const inventory: InvSlot[] = [
      { itemId: gear.itemId, count: 1, instance: gear.instance },
      { itemId: RIFT_GEM_IDS[1], count: 1 },
      { itemId: RIFT_GEM_IDS[2], count: 2 },
    ];
    const open = buildRiftForgeView({ inventory, equipment: {}, equipmentInstances: {} });
    expect(open.rings[0].socketable).toEqual([RIFT_GEM_IDS[1], RIFT_GEM_IDS[2]]);
    expect(open.gems).toEqual([
      { id: RIFT_GEM_IDS[0], count: 0 },
      { id: RIFT_GEM_IDS[1], count: 1 },
      { id: RIFT_GEM_IDS[2], count: 2 },
    ]);
    gear.instance.rift?.gems.push(RIFT_GEM_IDS[1]);
    const full = buildRiftForgeView({ inventory, equipment: {}, equipmentInstances: {} });
    expect(full.rings[0].gems).toEqual([RIFT_GEM_IDS[1]]);
    expect(full.rings[0].socketable).toEqual([]);
  });

  it('lists a worn band as worn with every affordance off, and skips non-rift slots', () => {
    const gear = band('S');
    const view = buildRiftForgeView({
      inventory: [
        { itemId: RIFT_ESSENCE_ITEM_ID, count: 20 },
        { itemId: RIFT_GEM_IDS[0], count: 1 },
      ],
      equipment: { ring1: gear.itemId, ring2: 'copper_band' },
      equipmentInstances: { ring1: gear.instance, ring2: { signer: 'Someone' } },
    });
    expect(view.rings).toHaveLength(1);
    const r = view.rings[0];
    expect(r.worn).toBe(true);
    expect(r.source).toEqual({ kind: 'worn', slot: 'ring1' });
    expect(r.canUpgrade).toBe(false);
    expect(r.canEnchant).toBe(false);
    expect(r.socketable).toEqual([]);
  });

  it('renders the empty state shape when the player owns no band', () => {
    const view = buildRiftForgeView({ inventory: [], equipment: {}, equipmentInstances: {} });
    expect(view.rings).toEqual([]);
    expect(view.essence).toBe(0);
  });
});
