// The Heroic Mark tier upgrade: Quartermaster Vex's second service beside the
// marks-currency jewelry (heroic_vendor.ts). For HEROIC_UPGRADE_MARKS Heroic
// Marks, one bagged Crucible tier set piece (content/ignivar_loot.ts
// IGNIVAR_SET_ITEMS) becomes its heroic variant (content/heroic_variants.ts
// buildHeroicTierVariants: item level 37, the two-level primary-stat step,
// same set tag and class lock, and NOT soulbound, so the heroic piece can
// change hands). The copy's own payload (an enchant, a Maker's Bond, the
// player lock) rides across unchanged; the bind-on-pickup party window and a
// Soul Key release are dropped because the variant has no bond to qualify.
//
// Server-authoritative like buyHeroicVendorItem: the client names a target
// slot, everything re-validates here, the outcome rides the text-free
// heroicUpgradeResult event, and the swapped copy converges through the self
// inventory mirror.
//
// `src/sim`-pure (no DOM/Three, no wall-clock, draws no rng).

import { HEROIC_MARK_ITEM_ID } from '../content/dungeon_difficulty';
import { heroicVariantId, isHeroicTierVariantId } from '../content/heroic_variants';
import { ITEMS } from '../data';
import { consumeSelectedInventorySlot, selectedInventorySlot } from '../item_copy_ref';
import type { PlayerMeta } from '../sim';
import type { SimContext } from '../sim_context';
import type { HeroicUpgradeDenyReason, ItemDef, ItemInstancePayload } from '../types';
import { heroicVendorInRange } from './heroic_vendor';

/** Marks per upgrade: five heroic finales' worth at the standard four-mark
 *  award, so one upgrade a week is the cadence of a full daily circuit. */
export const HEROIC_UPGRADE_MARKS = 20;

/** The heroic variant a tier piece upgrades to, or null when the item is not
 *  an upgradeable tier piece (already heroic, not a set piece, unknown id, or
 *  no variant was generated for it). */
export function heroicUpgradeTargetId(itemId: string): string | null {
  const def = ITEMS[itemId];
  if (!def || def.heroicOf !== undefined || def.set === undefined) return null;
  const targetId = heroicVariantId(itemId);
  return isHeroicTierVariantId(targetId) && ITEMS[targetId] ? targetId : null;
}

export function isHeroicUpgradeEligible(def: Pick<ItemDef, 'id'> | undefined): boolean {
  return def !== undefined && heroicUpgradeTargetId(def.id) !== null;
}

export interface HeroicUpgradeResult {
  ok: boolean;
  itemId: string;
  heroicItemId?: string;
  reason?: HeroicUpgradeDenyReason;
  /** The marks the upgrade costs (charged on ok). */
  marks: number;
}

/** The pure resolver. Deny order (pinned by tests/heroic_upgrade.test.ts):
 *  eligibility (nothing to say about a piece that can never upgrade), then
 *  the named copy (a slot that does not hold the item reads as ineligible),
 *  then range, then the marks balance. */
export function resolveHeroicUpgrade(
  meta: Pick<PlayerMeta, 'inventory'>,
  itemId: string,
  slotIndex: number | undefined,
  inRange: boolean,
  marksHeld: number,
): { ok: true; heroicItemId: string; slotIndex: number } | { ok: false; reason: HeroicUpgradeDenyReason } {
  const heroicItemId = heroicUpgradeTargetId(itemId);
  if (heroicItemId === null) return { ok: false, reason: 'heroic_upgrade_not_eligible' };
  const inventory = meta.inventory ?? [];
  let index = slotIndex;
  if (index === undefined) {
    index = inventory.findIndex((s) => s.itemId === itemId);
    if (index < 0) return { ok: false, reason: 'heroic_upgrade_not_eligible' };
  }
  if (selectedInventorySlot(inventory, itemId, index) === null) {
    return { ok: false, reason: 'heroic_upgrade_not_eligible' };
  }
  if (!inRange) return { ok: false, reason: 'heroic_upgrade_out_of_range' };
  if (marksHeld < HEROIC_UPGRADE_MARKS) {
    return { ok: false, reason: 'heroic_upgrade_not_enough_marks' };
  }
  return { ok: true, heroicItemId, slotIndex: index };
}

/** The payload the heroic copy inherits: everything but the bond qualifiers
 *  (the variant is not soulbound, so a party window or a Soul Key release
 *  would describe a bond it does not have). */
export function heroicUpgradePayload(
  instance: ItemInstancePayload | undefined,
): ItemInstancePayload | undefined {
  if (!instance) return undefined;
  const { partyTrade: _partyTrade, unbound: _unbound, ...rest } = instance;
  return Object.keys(rest).length > 0 ? rest : undefined;
}

/** Upgrade the named copy. Mutates on success only: the tier copy leaves the
 *  bags (freeing its slot, which is why the heroic copy always fits), the
 *  marks are debited, and the heroic copy is granted with the inherited
 *  payload. The tier copy is consumed BEFORE the marks so a marks stack that
 *  sits below the target can shift no index the consume still needs. */
export function heroicUpgradeItem(
  ctx: SimContext,
  itemId: string,
  slotIndex: number | undefined,
  pid?: number,
): HeroicUpgradeResult | undefined {
  const r = ctx.resolve(pid);
  if (!r) return undefined;
  const { meta, e: p } = r;
  const resolved = resolveHeroicUpgrade(
    meta,
    itemId,
    slotIndex,
    heroicVendorInRange(ctx, p),
    ctx.countItem(HEROIC_MARK_ITEM_ID, meta.entityId),
  );
  if (!resolved.ok) return { ok: false, itemId, reason: resolved.reason, marks: HEROIC_UPGRADE_MARKS };
  const taken = consumeSelectedInventorySlot(meta.inventory, itemId, resolved.slotIndex);
  if (!taken) return { ok: false, itemId, reason: 'heroic_upgrade_not_eligible', marks: HEROIC_UPGRADE_MARKS };
  ctx.removeItem(HEROIC_MARK_ITEM_ID, HEROIC_UPGRADE_MARKS, meta.entityId);
  const payload = heroicUpgradePayload(taken.instance);
  const opts = { silent: true, callerLogs: true, movement: true } as const;
  if (payload) ctx.addItemInstance(resolved.heroicItemId, payload, meta.entityId, 1, opts);
  else ctx.addItem(resolved.heroicItemId, 1, meta.entityId, opts);
  ctx.onInventoryChangedForQuests(meta);
  return { ok: true, itemId, heroicItemId: resolved.heroicItemId, marks: HEROIC_UPGRADE_MARKS };
}
