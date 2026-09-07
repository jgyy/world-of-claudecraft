// Pure, host-agnostic view model for the Heroic Quartermaster window.
//
// The pure-core half of the pure-core + thin-consumer split (reference
// vendor_view.ts): it decides which stock rows render and whether the viewer
// can afford each at their current Heroic Marks balance. The DOM/i18n side
// lives in heroic_vendor_window.ts. DOM-free and i18n-free so
// tests/heroic_vendor.test.ts can drive it directly.

import type { HeroicVendorOffer } from '../../../sim/content/heroic_vendor';
import { HEROIC_UPGRADE_MARKS, heroicUpgradeTargetId } from '../../../sim/instances/heroic_upgrade';
import type { InvSlot, ItemDef } from '../../../sim/types';

export interface HeroicShopRow {
  itemId: string;
  item: ItemDef;
  /** Price in Heroic Marks (the heroic_mark inventory item). */
  marks: number;
  affordable: boolean;
}

/** One bagged Crucible tier piece the Heroic Mark upgrade can forge
 *  (src/sim/instances/heroic_upgrade.ts): the exact copy by bag index, its
 *  heroic target, and the flat marks price against the balance. */
export interface HeroicUpgradeRow {
  itemId: string;
  item: ItemDef;
  heroicItemId: string;
  slotIndex: number;
  marks: number;
  affordable: boolean;
}

export interface HeroicShopView {
  rows: HeroicShopRow[];
  /** The upgradeable tier pieces in the viewer's bags, in bag order. */
  upgrades: HeroicUpgradeRow[];
  /** The viewer's current Heroic Marks balance (bag count). */
  balance: number;
}

/** Build the structured shop view: stock rows resolved against the item table
 * and the viewer's marks balance. Unknown item ids are dropped (never render a
 * row the sim would refuse to sell). */
export function buildHeroicVendorView(
  stock: readonly HeroicVendorOffer[],
  items: Record<string, ItemDef>,
  balance: number,
  inventory: readonly Pick<InvSlot, 'itemId' | 'count'>[] = [],
): HeroicShopView {
  const upgrades: HeroicUpgradeRow[] = [];
  inventory.forEach((slot, slotIndex) => {
    if (slot.count < 1) return;
    const heroicItemId = heroicUpgradeTargetId(slot.itemId);
    const item = items[slot.itemId];
    if (heroicItemId === null || !item) return;
    upgrades.push({
      itemId: slot.itemId,
      item,
      heroicItemId,
      slotIndex,
      marks: HEROIC_UPGRADE_MARKS,
      affordable: balance >= HEROIC_UPGRADE_MARKS,
    });
  });
  const rows: HeroicShopRow[] = [];
  for (const offer of stock) {
    const item = items[offer.itemId];
    if (!item) continue;
    rows.push({
      itemId: offer.itemId,
      item,
      marks: offer.marks,
      affordable: balance >= offer.marks,
    });
  }
  return { rows, upgrades, balance };
}
