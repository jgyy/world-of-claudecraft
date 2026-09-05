// Item binding rules: which gear binds on equip, and which held copies are
// already soulbound.
//
// Classic-era MMOs bind gear two ways. Bind on Pickup (BoP) is the def-level
// `soulbound` flag: the piece is bound from the moment it is acquired (raid
// tier and Warfare gear here), with the party trade window in
// loot/bop_trade_window.ts as its only escape. Bind on Equip (BoE) is the
// rule this module owns: the piece trades, mails, and lists freely while it
// has never been worn, and binds to the character the first time it is
// equipped. From then on the copy can never be traded, mailed, listed on
// either market, or stored in the guild bank again; vendor sale stays open
// (a bound copy is still the owner's to sell for gold).
//
// The BoE rule is DERIVED, never hand-authored per item: every equippable
// piece of uncommon (green) quality or better binds on equip unless it is
// already BoP or a quest item. `ItemDef.bindOnEquip` is the explicit
// override for the odd exception (`false` keeps a green freely tradeable
// forever; `true` opts a common piece in).
//
// The per-copy fact lives on the instance payload as `soulbound: true`,
// stamped by the equip path (items.ts) the moment a worn BoE piece returns
// to the bags, so a worn piece needs no payload of its own (its binding is
// implied by the slot it sits in). This is deliberately NOT the Maker's Bond
// `boundTo` lock: that one a station master can unbind for a fee, while a
// soulbound copy is bound for good.
//
// Pure leaf: no DOM/Three/render-ui-game-net imports, no rng/clock. Imported
// by the sim equip and transfer paths AND the HUD tooltip/bag gates, so it
// stays host-agnostic and is unit-tested directly.

import { QUALITY_RANK } from './loot_master';
import type { ItemDef, ItemInstancePayload } from './types';

/** The kinds that occupy a paperdoll slot; nothing else can bind on equip. */
const EQUIPPABLE_KINDS: ReadonlySet<ItemDef['kind']> = new Set(['weapon', 'armor', 'held_offhand']);

/** The lowest quality that binds on equip (green and above). */
const BIND_ON_EQUIP_MIN_QUALITY = QUALITY_RANK.uncommon;

/** Whether wearing `item` binds it to the wearer. An explicit
 *  `bindOnEquip` always wins; otherwise every equippable piece of uncommon
 *  quality or better binds, unless it is already bind-on-pickup
 *  (`soulbound`) or a quest item. */
export function bindsOnEquip(item: ItemDef | undefined): boolean {
  if (!item) return false;
  if (item.bindOnEquip !== undefined) return item.bindOnEquip;
  if (item.soulbound || item.questId !== undefined) return false;
  if (!EQUIPPABLE_KINDS.has(item.kind)) return false;
  return QUALITY_RANK[item.quality ?? 'common'] >= BIND_ON_EQUIP_MIN_QUALITY;
}

/** Whether this specific copy has been bound by wearing it (the per-copy
 *  marker, never the def-level flag). Presence-checked against `true` so a
 *  hand-edited or malformed value never reads as bound. */
export function isSoulboundInstance(instance: ItemInstancePayload | undefined): boolean {
  return instance?.soulbound === true;
}

/** The payload a worn copy of `item` carries back to the bags: the input
 *  with the soulbound marker stamped when the item binds on equip, else the
 *  input untouched. Returns a NEW top-level object when it stamps (a shallow
 *  spread: the input object itself is never mutated, its sub-objects are
 *  shared, which every bench site tolerates because it drops the worn slot
 *  in the same step) and the same reference otherwise, so a caller can keep
 *  treating "no payload" as the plain-stack signal. */
export function boundOnUnequipPayload(
  item: ItemDef | undefined,
  payload: ItemInstancePayload | undefined,
): ItemInstancePayload | undefined {
  if (!bindsOnEquip(item) || isSoulboundInstance(payload)) return payload;
  return { ...(payload ?? {}), soulbound: true };
}

export type ItemBindingKind = 'soulbound' | 'bindOnEquip' | null;

/** Which binding line an item tooltip shows: `soulbound` for a bind-on-pickup
 *  def or a copy bound by wearing it; `bindOnEquip` for a never-worn BoE
 *  copy; null for everything else. A WORN BoE piece reads `soulbound` because
 *  the paperdoll projection stamps the marker from the def
 *  (src/ui/item_instance_tooltip.ts wornTooltipInstance). */
export function itemBindingKind(
  item: ItemDef | undefined,
  instance: ItemInstancePayload | undefined,
): ItemBindingKind {
  if (!item) return null;
  if (item.soulbound || isSoulboundInstance(instance)) return 'soulbound';
  return bindsOnEquip(item) ? 'bindOnEquip' : null;
}
