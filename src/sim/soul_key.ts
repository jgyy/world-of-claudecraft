// Soul Keys: the per-copy escape from bind-on-pickup.
//
// A Soul Key is a gold-priced vendor item (content/items.ts `soul_key`, sold
// by the Highwatch quartermaster) that a player spends on ONE bagged
// soulbound gear copy to break its bond for good: the copy carries the
// `unbound` marker (types.ts ItemInstancePayload) from then on, and every
// soulbound gate reads it as an ordinary tradeable item through
// item_binding.ts isSoulboundCopy. The gold leaves the economy at the vendor
// (the sink); the key itself trades freely.
//
// The abuse gate is a per-character weekly allowance: SOUL_KEY_USES_PER_WEEK
// releases per weekly raid reset, tracked on PlayerMeta.soulKeyWeek and
// persisted with the character (character_state.ts). The window is keyed to
// the realm's weekly reset clock (SimContext.weeklyRaidResetMs, the same
// boundary the raid lockouts use) so every character on a realm rolls over
// together and the tooltip can promise a date.
//
// Server-authoritative like the Maker's Bond unbind (professions/
// commission.ts): the client only names a target slot, everything re-validates
// here, the outcome rides the text-free soulKeyResult event, and the payload
// change converges through the self inventory mirror.
//
// `src/sim`-pure (no DOM/Three, no wall-clock: the clock is ctx.lockoutNowMs).

import { isSoulboundCopy, isSoulKeyEligible, releasedPayload } from './item_binding';
import { selectedInventorySlot } from './item_copy_ref';
import { ITEMS } from './data';
import type { PlayerMeta } from './sim';
import type { SimContext } from './sim_context';
import type { InvSlot, SoulKeyDenyReason } from './types';

export const SOUL_KEY_ITEM_ID = 'soul_key';

/** Releases per character per weekly reset. Two, not one: enough to fix a
 *  wrong-spec drop and hand a spare to a guildmate in one week, too few to
 *  run gear through alts as a business. */
export const SOUL_KEY_USES_PER_WEEK = 2;

/** The persisted allowance window: `resetAt` is the weekly reset boundary the
 *  window closes on (epoch ms on the lockout clock), `used` the releases spent
 *  inside it. Absent until the first use. */
export interface SoulKeyWeek {
  resetAt: number;
  used: number;
}

/** The live window for `nowMs`: the stored one while it is still open, else a
 *  fresh empty window closing at the next weekly reset. Pure: never writes. */
export function currentSoulKeyWeek(
  week: SoulKeyWeek | undefined,
  nowMs: number,
  weeklyResetMs: (nowMs: number) => number,
): SoulKeyWeek {
  if (week && Number.isFinite(week.resetAt) && nowMs < week.resetAt) {
    return { resetAt: week.resetAt, used: Math.max(0, Math.floor(week.used)) };
  }
  return { resetAt: weeklyResetMs(nowMs), used: 0 };
}

export function soulKeyUsesLeft(week: SoulKeyWeek): number {
  return Math.max(0, SOUL_KEY_USES_PER_WEEK - week.used);
}

export interface SoulKeyResult {
  ok: boolean;
  itemId: string;
  reason?: SoulKeyDenyReason;
  /** Releases still available this week AFTER this attempt. */
  usesLeft: number;
}

/** The pure resolver: which copy would be released, or why not. Deny order
 *  is load-bearing and pinned (tests/soul_key.test.ts): an unknown or
 *  ineligible item first (nothing to say about a target that can never be
 *  released), then the copy itself (the named slot must hold that item and
 *  still be bound), then the key, then the weekly allowance, so the reason a
 *  player sees is always the one they can act on. A malformed slot index
 *  reads as "not bound": the named copy is not a bound one. */
export function resolveSoulKeyUse(
  meta: Pick<PlayerMeta, 'inventory' | 'soulKeyWeek'>,
  itemId: string,
  slotIndex: number | undefined,
  week: SoulKeyWeek,
  keysHeld: number,
): { ok: true; slot: InvSlot; slotIndex: number } | { ok: false; reason: SoulKeyDenyReason } {
  const def = ITEMS[itemId];
  if (!isSoulKeyEligible(def)) return { ok: false, reason: 'soul_key_not_eligible' };
  const inventory = meta.inventory ?? [];
  // Without a named slot, the first bound copy of the id is the target (the
  // id-only arity the RL host and scripts use).
  let index = slotIndex;
  if (index === undefined) {
    index = inventory.findIndex((s) => s.itemId === itemId && isSoulboundCopy(def, s.instance));
    if (index < 0) return { ok: false, reason: 'soul_key_not_bound' };
  }
  const slot = selectedInventorySlot(inventory, itemId, index);
  if (!slot || !isSoulboundCopy(def, slot.instance)) {
    return { ok: false, reason: 'soul_key_not_bound' };
  }
  if (keysHeld < 1) return { ok: false, reason: 'soul_key_none_held' };
  if (soulKeyUsesLeft(week) < 1) return { ok: false, reason: 'soul_key_weekly_cap' };
  return { ok: true, slot, slotIndex: index };
}

/** Spend one Soul Key on the named copy. Mutates on success only: the copy
 *  is stamped IN PLACE (a bound gear copy never stacks past one, so no peel),
 *  the key is debited, and the weekly window advances. The target is stamped
 *  BEFORE the key leaves the bags: removeItem may splice the key's slot out
 *  and shift every index above it, so the resolved slot object, not its
 *  index, is what gets written. */
export function useSoulKey(
  ctx: SimContext,
  itemId: string,
  slotIndex: number | undefined,
  pid?: number,
): SoulKeyResult | undefined {
  const r = ctx.resolve(pid);
  if (!r) return undefined;
  const { meta } = r;
  const nowMs = ctx.lockoutNowMs();
  const week = currentSoulKeyWeek(meta.soulKeyWeek, nowMs, ctx.weeklyRaidResetMs);
  const keysHeld = ctx.countItem(SOUL_KEY_ITEM_ID, meta.entityId);
  const resolved = resolveSoulKeyUse(meta, itemId, slotIndex, week, keysHeld);
  if (!resolved.ok) {
    return { ok: false, itemId, reason: resolved.reason, usesLeft: soulKeyUsesLeft(week) };
  }
  const { slot } = resolved;
  if (slot.count > 1) {
    // Defensive: a bound gear copy is never a multi-unit stack today (stackSize
    // 1 on every soulbound paperdoll def). Peel one unit so a future stackable
    // bound piece never releases the whole stack for one key.
    if (!ctx.canAddItem(itemId, 1, meta.entityId)) {
      return { ok: false, itemId, reason: 'soul_key_not_bound', usesLeft: soulKeyUsesLeft(week) };
    }
    const released = releasedPayload(slot.instance);
    slot.count -= 1;
    ctx.removeItem(SOUL_KEY_ITEM_ID, 1, meta.entityId);
    ctx.addItemInstance(itemId, released, meta.entityId, 1, {
      silent: true,
      callerLogs: true,
      movement: true,
    });
  } else {
    slot.instance = releasedPayload(slot.instance);
    ctx.removeItem(SOUL_KEY_ITEM_ID, 1, meta.entityId);
  }
  ctx.onInventoryChangedForQuests(meta);
  meta.soulKeyWeek = { resetAt: week.resetAt, used: week.used + 1 };
  return { ok: true, itemId, usesLeft: soulKeyUsesLeft(meta.soulKeyWeek) };
}
