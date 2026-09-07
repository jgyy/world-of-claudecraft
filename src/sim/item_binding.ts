// The one predicate for "is this copy soulbound": the def-level bind-on-pickup
// flag (`ItemDef.soulbound`: raid tier, Warfare gear, reward tokens) minus the
// per-copy Soul Key release (`ItemInstancePayload.unbound`, src/sim/soul_key.ts).
//
// Every gate that used to read `def.soulbound` alone (trade, mail, World
// Market, guild bank, vendor sale, the $WOC exchange, and the HUD mirrors of
// each) reads THIS instead, so a released copy is an ordinary tradeable item
// everywhere at once and no pipe can drift back to the def flag. Nothing to do
// with the Maker's Bond (`boundTo`, professions/commission.ts), which is a
// commission lock a station master peels for a fee.
//
// Pure leaf: no DOM/Three/render-ui-game-net imports, no rng/clock. Imported by
// the sim pipes AND the HUD bag/tooltip gates, so it stays host-agnostic and is
// unit-tested directly (tests/soul_key.test.ts).

import type { ItemDef, ItemInstancePayload } from './types';

/** The kinds a Soul Key can release: paperdoll gear only. Reward tokens
 *  (Heroic Marks, sigils: kind 'tool'), mounts, and quest items keep their
 *  bond, so the key can never launder a currency. */
const SOUL_KEY_KINDS: ReadonlySet<ItemDef['kind']> = new Set(['weapon', 'armor', 'held_offhand']);

/** Whether this specific copy has been released with a Soul Key. Presence-
 *  checked against `true` so a hand-edited or malformed value never reads as
 *  released. */
export function isUnboundCopy(instance: ItemInstancePayload | undefined): boolean {
  return instance?.unbound === true;
}

/** Whether this copy is soulbound right now: a bind-on-pickup def whose copy
 *  has NOT been released. The single source of truth for every soulbound
 *  gate; a missing def reads as not bound (an unknown id has no bond). */
export function isSoulboundCopy(
  def: Pick<ItemDef, 'soulbound'> | undefined,
  instance: ItemInstancePayload | undefined,
): boolean {
  return def?.soulbound === true && !isUnboundCopy(instance);
}

/** Whether a Soul Key may target this item at all: bind-on-pickup gear of a
 *  paperdoll kind. Independent of the copy (a released copy is refused by
 *  the not-bound arm, not here). */
export function isSoulKeyEligible(def: ItemDef | undefined): boolean {
  return def !== undefined && def.soulbound === true && SOUL_KEY_KINDS.has(def.kind);
}

/** The payload a released copy carries: the input with the marker stamped.
 *  Returns a NEW top-level object (shallow spread; sub-objects shared, which
 *  every caller tolerates because it replaces the slot's payload in the same
 *  step). Idempotent: an already-released copy comes back equal. */
export function releasedPayload(payload: ItemInstancePayload | undefined): ItemInstancePayload {
  return { ...(payload ?? {}), unbound: true };
}
