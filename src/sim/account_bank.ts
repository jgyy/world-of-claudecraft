// The Account Bank: an account-wide pooled item store shared across every
// character on the account, the account-scale sibling of the personal bank
// (bank.ts). See src/world_api/account_bank.ts for the full design rationale
// (why it reuses the guild bank's anonymous-pipe item policy, and why it
// needs no escrow-merge machinery unlike the guild bank).
//
// Books are keyed by account id (ctx.accountBanks), loaded at join
// (loadAccountBank, the ONE load path) and evicted at leave (evictAccountBank):
// exactly the lifecycle the account only ever has ONE live session for
// (MAX_ACTIVE_SESSIONS_PER_ACCOUNT, server/game.ts), unlike the guild bank's
// forever-loaded book shared by many simultaneous members. Offline play has
// no account, so the map stays empty and every IWorld member is inert.
//
// Every op follows the bank/vendor validation order (state.md): resolve, dead
// check, banker proximity, shape, the anonymous-pipe item policy
// (accountBankPipeRefusal below, whose WHETHER is the shared
// anonymousPipeRefused the guild bank also uses, never its GUILD-worded
// strings), price from the table, affordability, capacity (inside
// moveBetweenContainers' all-or-nothing fit check), then the atomic mutation,
// then emits. NO refusal path mutates anything.
//
// `src/sim`-pure: no DOM/Three/render-ui-game-net imports, no Math.random/
// Date.now (enforced by tests/architecture.test.ts). This module draws NO rng.

import type { AccountBankInfo } from '../world_api';
import { generalOnlyPools } from './bag_pools';
import { bagPools, bagsFullError, instancedCountCap } from './bags';
import { moveBetweenContainers, nearBanker } from './bank';
import { ITEMS } from './data';
import { anonymousPipeRefused } from './guild_bank';
import {
  boundCraftedRecipeIdOnLoad,
  sanitizeItemInstancePayloadOnLoad,
  warnDroppedInstanceKeys,
} from './item_instance_load';
import {
  normalizeLoadedMaterialSlot,
  preservesMaterialCountOnLoad,
  validateMaterialSlotSourcesOnLoad,
} from './material_slot_load';
import {
  type MaterialSourceTransferSelection,
  resolveMaterialSourceTransferSelection,
} from './material_source_transfer_selection';
import type { MaterialComposition } from './material_sources';
import type { SimContext } from './sim_context';
import { cloneInvSlot, type InvSlot } from './types';

/** Slots the account bank starts with once it exists (mirrors BANK_BASE_SLOTS). */
export const ACCOUNT_BANK_BASE_SLOTS = 24;
/** Slots one copper expansion adds; also the granularity purchasedSlots stays on. */
export const ACCOUNT_BANK_EXPANSION_SLOTS = 6;
/** Copper cost of each successive expansion, cheapest first, paid from the
 *  acting character's own purse (there is no treasury: the account bank has
 *  exactly one owner). Data-as-code: the price is always this table lookup,
 *  never a client-supplied value. */
export const ACCOUNT_BANK_EXPANSION_PRICES: readonly number[] = [
  20000, 50000, 100000, 200000, 400000, 800000,
];
/** Maximum purchasable capacity beyond the base, not including the base
 *  itself: the semantic geometry constant wire/UI code validates the counter
 *  against without importing the price table. */
export const ACCOUNT_BANK_PURCHASED_SLOTS_MAX =
  ACCOUNT_BANK_EXPANSION_PRICES.length * ACCOUNT_BANK_EXPANSION_SLOTS;

/** An account's shared bank: a pooled item list plus its purchased-slot
 *  ladder position. `purchasedSlots` is always a multiple of
 *  ACCOUNT_BANK_EXPANSION_SLOTS in [0, ACCOUNT_BANK_PURCHASED_SLOTS_MAX]. */
export interface AccountBankState {
  inventory: InvSlot[];
  purchasedSlots: number;
}

/** The bank's current slot budget: base plus every bought expansion. Over-
 *  capacity inventories are tolerated (a tampered/legacy save may overflow);
 *  capacity only blocks new deposits. */
export function accountBankCapacity(bank: AccountBankState): number {
  return ACCOUNT_BANK_BASE_SLOTS + bank.purchasedSlots;
}

/** Copper price of the NEXT expansion (a table lookup indexed by bought-rung
 *  count, never client-supplied), or null once every expansion is bought. */
export function accountBankNextExpansionPrice(bank: AccountBankState): number | null {
  const purchases = Math.floor(bank.purchasedSlots / ACCOUNT_BANK_EXPANSION_SLOTS);
  return ACCOUNT_BANK_EXPANSION_PRICES[purchases] ?? null;
}

export function createEmptyAccountBankState(): AccountBankState {
  return { inventory: [], purchasedSlots: 0 };
}

/** The ONE load path for persisted account bank state (the sanitizeBankState /
 *  sanitizeGuildBankState contract): tampered/legacy shapes sanitize; items
 *  are NEVER destroyed; over-capacity inventories are tolerated (never
 *  truncated). purchasedSlots clamps into range and floors to a whole
 *  expansion so price indexing stays coherent.
 *
 *  Every row takes the SHARED load-side bounds (src/sim/item_instance_load.ts),
 *  exactly like the personal bank and guild bank arms: the crafted-recipe
 *  marker through `boundCraftedRecipeIdOnLoad`, the instance payload through
 *  `sanitizeItemInstancePayloadOnLoad`, and material provenance through
 *  `material_slot_load.ts` (pre-validated before any legacy coercion,
 *  normalized after). The rift REBUILD the personal bank arm does is
 *  deliberately skipped here, exactly as the guild bank arm skips it: it keys
 *  on an owning character and a book shared across an account's characters
 *  has no single owner.
 *
 *  `droppedSink` aggregates the drop diagnostics for a caller loading many
 *  books; a sink-less call logs one aggregate line per CALL. */
export function sanitizeAccountBankState(raw: unknown, droppedSink?: string[]): AccountBankState {
  if (!raw || typeof raw !== 'object') return createEmptyAccountBankState();
  const r = raw as { inventory?: unknown; purchasedSlots?: unknown };
  const inventory: InvSlot[] = [];
  const localDrops: string[] = droppedSink ?? [];
  if (Array.isArray(r.inventory)) {
    for (const entry of r.inventory) {
      if (!entry || typeof entry !== 'object') continue;
      const e = entry as {
        itemId?: unknown;
        count?: unknown;
        instance?: unknown;
        craftedRecipeId?: unknown;
        materialSources?: InvSlot['materialSources'];
        materialSeparated?: true;
      };
      if (typeof e.itemId !== 'string' || e.itemId === '') continue;
      validateMaterialSlotSourcesOnLoad(e);
      const hasInstance = !!e.instance && typeof e.instance === 'object';
      const rawMarker: { itemId: string; craftedRecipeId?: unknown } = {
        itemId: e.itemId,
        craftedRecipeId: e.craftedRecipeId,
      };
      boundCraftedRecipeIdOnLoad(rawMarker, localDrops, 'accountbank');
      const craftedRecipeId = rawMarker.craftedRecipeId as string | undefined;
      const instanceCap = preservesMaterialCountOnLoad({
        itemId: e.itemId,
        materialSources: e.materialSources,
        instance: hasInstance ? (e.instance as InvSlot['instance']) : undefined,
      })
        ? Number.MAX_SAFE_INTEGER
        : instancedCountCap(
            ITEMS[e.itemId],
            hasInstance ? (e.instance as InvSlot['instance']) : undefined,
          );
      const count = Math.min(instanceCap, Math.max(1, Math.floor(Number(e.count)) || 1));
      const slot: InvSlot = hasInstance
        ? { itemId: e.itemId, count, instance: e.instance as InvSlot['instance'] }
        : { itemId: e.itemId, count };
      if (craftedRecipeId !== undefined) slot.craftedRecipeId = craftedRecipeId;
      if (e.materialSources !== undefined) slot.materialSources = e.materialSources;
      if (e.materialSeparated === true) slot.materialSeparated = true;
      const cleaned = cloneInvSlot(slot);
      if (cleaned.instance) {
        const { payload, dropped } = sanitizeItemInstancePayloadOnLoad(cleaned.instance);
        for (const d of dropped) localDrops.push(`accountbank.${cleaned.itemId}.${d}`);
        if (payload) cleaned.instance = payload;
        else delete cleaned.instance;
      }
      inventory.push(normalizeLoadedMaterialSlot(cleaned));
    }
  }
  if (!droppedSink) warnDroppedInstanceKeys('accountbank', localDrops);
  let purchasedSlots = Math.max(
    0,
    Math.min(ACCOUNT_BANK_PURCHASED_SLOTS_MAX, Math.floor(Number(r.purchasedSlots)) || 0),
  );
  purchasedSlots -= purchasedSlots % ACCOUNT_BANK_EXPANSION_SLOTS;
  return { inventory, purchasedSlots };
}

/** Install an account's book through the ONE load path. Pure shape-in: the
 *  server hands raw JSONB; no SQL here. A non-positive or non-integer account
 *  id is ignored so a tampered row can never mint a garbage key. LOAD-ONCE: an
 *  account whose book is already live is skipped (items are NEVER destroyed
 *  by a silent overwrite). Callers must evict before reloading. */
export function loadAccountBank(ctx: SimContext, accountId: number, raw: unknown): void {
  if (!Number.isInteger(accountId) || accountId <= 0) return;
  if (ctx.accountBanks.has(accountId)) return;
  ctx.accountBanks.set(accountId, sanitizeAccountBankState(raw));
}

/** Snapshot an account's book for persistence, deep-cloned so the save never
 *  aliases the live inventory's mutable instance payloads. Null means the
 *  account has NO loaded book: the persistence caller must SKIP the write. */
export function serializeAccountBank(ctx: SimContext, accountId: number): AccountBankState | null {
  const book = ctx.accountBanks.get(accountId);
  if (!book) return null;
  return { inventory: book.inventory.map(cloneInvSlot), purchasedSlots: book.purchasedSlots };
}

/** Drop an account's book from the live map: called by the server once the
 *  account's one live session leaves and its book has been persisted
 *  (MAX_ACTIVE_SESSIONS_PER_ACCOUNT means there is never another reader).
 *  Callers must never hold a book reference across an evict. */
export function evictAccountBank(ctx: SimContext, accountId: number): void {
  ctx.accountBanks.delete(accountId);
}

/** Resolve the REQUIRED acting pid, refusing a non-integer at runtime (the
 *  guild bank's resolveActor twin): an economy op must never fail open into
 *  acting for the wrong player. */
function resolveActor(ctx: SimContext, pid: number): ReturnType<SimContext['resolve']> {
  return Number.isInteger(pid) ? ctx.resolve(pid) : null;
}

/** The anonymous-pipe policy's WORDING for the account bank: the WHETHER
 *  (anonymousPipeRefused, src/sim/guild_bank.ts) is shared with the guild
 *  bank, but the wording is its own, never the guild bank's GUILD-worded
 *  strings (an account-bank refusal must never say "guild bank"). Direction-
 *  independent WHETHER, direction-aware WORDING, exactly like
 *  guildBankPipeRefusal's own contract. */
function accountBankPipeRefusal(
  slot: InvSlot,
  dir: 'deposit' | 'withdraw' = 'deposit',
): string | null {
  if (!anonymousPipeRefused(slot)) return null;
  const def = ITEMS[slot.itemId];
  if (dir === 'withdraw') return 'That item cannot be withdrawn from the account bank.';
  if (def?.kind === 'quest') return 'You cannot store quest items in the account bank.';
  if (def?.soulbound) return 'You cannot store soulbound items in the account bank.';
  return 'That item cannot be stored in the account bank.';
}

/** Deposit a carried-inventory slot into the account's shared bank. The full
 *  anonymous-pipe policy applies (the shared WHETHER, account-worded here),
 *  exactly like mail and the guild bank: a bind-on-pickup or quest-bound copy
 *  must never leave the character that earned it, even through a container
 *  this same player owns end to end. */
export function accountBankDeposit(
  ctx: SimContext,
  accountId: number,
  slotIndex: number,
  count: number | undefined,
  pid: number,
  selection?: MaterialSourceTransferSelection,
): void {
  const r = resolveActor(ctx, pid);
  if (!r) return;
  const { meta, e: p } = r;
  if (p.dead) return; // the market/mail town-service idiom: dead players bank nothing
  if (!nearBanker(ctx, p)) {
    ctx.error(meta.entityId, 'You are too far from the banker.');
    return;
  }
  if (!Number.isInteger(slotIndex) || slotIndex < 0 || slotIndex >= meta.inventory.length) return;
  const book = ctx.accountBanks.get(accountId);
  if (!book) return;
  const slot = meta.inventory[slotIndex];
  const refusal = accountBankPipeRefusal(slot);
  if (refusal !== null) {
    ctx.error(meta.entityId, refusal);
    return;
  }
  let selectedSources: MaterialComposition | undefined;
  if (selection !== undefined) {
    if (selection.itemId !== slot.itemId || selection.target.slotIndex !== slotIndex) return;
    const resolved = resolveMaterialSourceTransferSelection(meta.inventory, selection);
    if (!resolved.ok || (count ?? resolved.value.count) !== resolved.value.count) return;
    selectedSources = resolved.value.sources;
    count = resolved.value.count;
  }
  const itemName = ITEMS[slot.itemId]?.name ?? slot.itemId;
  const result = moveBetweenContainers(
    meta.inventory,
    slotIndex,
    count,
    book.inventory,
    generalOnlyPools(accountBankCapacity(book)),
    selectedSources,
  );
  if (result.refusal === 'no_fit') {
    if (result.noFitCause === 'instanced_units') {
      ctx.error(
        meta.entityId,
        'That stack cannot be split to fit the space left in your account bank.',
      );
      return;
    }
    ctx.error(meta.entityId, 'Your account bank is full.');
    return;
  }
  if (result.refusal) return; // 'invalid': malformed input (cheat/desync), no player line
  ctx.onInventoryChangedForQuests(meta);
  ctx.notice(meta.entityId, `You deposit ${itemName} into the account bank.`);
}

/** Withdraw an account bank slot back into the acting character's bags: the
 *  mirror of accountBankDeposit, gated by bag capacity AND the same
 *  anonymous-pipe policy (a tampered/legacy row's locked copy must never
 *  complete a cross-character transfer; it stays dormant in the book). */
export function accountBankWithdraw(
  ctx: SimContext,
  accountId: number,
  slotIndex: number,
  count: number | undefined,
  pid: number,
  selection?: MaterialSourceTransferSelection,
): void {
  const r = resolveActor(ctx, pid);
  if (!r) return;
  const { meta, e: p } = r;
  if (p.dead) return; // the market/mail town-service idiom: dead players bank nothing
  if (!nearBanker(ctx, p)) {
    ctx.error(meta.entityId, 'You are too far from the banker.');
    return;
  }
  if (!Number.isInteger(slotIndex) || slotIndex < 0) return;
  const book = ctx.accountBanks.get(accountId);
  if (!book) return;
  if (slotIndex >= book.inventory.length) return;
  const refusal = accountBankPipeRefusal(book.inventory[slotIndex], 'withdraw');
  if (refusal !== null) {
    ctx.error(meta.entityId, refusal);
    return;
  }
  let selectedSources: MaterialComposition | undefined;
  if (selection !== undefined) {
    const slot = book.inventory[slotIndex];
    if (selection.itemId !== slot.itemId || selection.target.slotIndex !== slotIndex) return;
    const resolved = resolveMaterialSourceTransferSelection(book.inventory, selection);
    if (!resolved.ok || (count ?? resolved.value.count) !== resolved.value.count) return;
    selectedSources = resolved.value.sources;
    count = resolved.value.count;
  }
  const itemName =
    ITEMS[book.inventory[slotIndex].itemId]?.name ?? book.inventory[slotIndex].itemId;
  const result = moveBetweenContainers(
    book.inventory,
    slotIndex,
    count,
    meta.inventory,
    bagPools(meta.bags),
    selectedSources,
  );
  if (result.refusal === 'no_fit') {
    if (result.noFitCause === 'instanced_units') {
      ctx.error(meta.entityId, 'That stack cannot be split to fit the space left in your bags.');
      return;
    }
    bagsFullError(ctx, meta.entityId);
    return;
  }
  if (result.refusal) return; // 'invalid': malformed input (cheat/desync), no player line
  ctx.onInventoryChangedForQuests(meta);
  ctx.notice(meta.entityId, `You withdraw ${itemName} from the account bank.`);
}

/** Buy the next slot expansion, at the table price for the current
 *  bought-rung count, paid from the acting character's own purse (there is no
 *  treasury). Blocked at the ladder's end; no refusal mutates. */
export function accountBankBuySlots(ctx: SimContext, accountId: number, pid: number): void {
  const r = resolveActor(ctx, pid);
  if (!r) return;
  const { meta, e: p } = r;
  if (p.dead) return; // the market/mail town-service idiom: dead players bank nothing
  if (!nearBanker(ctx, p)) {
    ctx.error(meta.entityId, 'You are too far from the banker.');
    return;
  }
  const book = ctx.accountBanks.get(accountId);
  if (!book) return;
  const price = accountBankNextExpansionPrice(book);
  if (price === null) {
    ctx.error(meta.entityId, 'Your account bank cannot be expanded further.');
    return;
  }
  if (meta.copper < price) {
    ctx.error(meta.entityId, 'You cannot afford that account bank expansion.');
    return;
  }
  meta.copper -= price;
  book.purchasedSlots += ACCOUNT_BANK_EXPANSION_SLOTS;
  ctx.notice(meta.entityId, 'You purchase additional account bank slots.');
}

/** The proximity-gated account bank snapshot the IWorld seam exposes (the
 *  bankInfoFor / guildBankInfoFor pattern): null unless the player is alive,
 *  stands within reach of a banker NPC, and the account's book is loaded. A
 *  pure read: it draws NO rng and never hands out live sim slot references. */
export function accountBankInfoFor(
  ctx: SimContext,
  accountId: number,
  pid: number,
): AccountBankInfo | null {
  const r = resolveActor(ctx, pid);
  if (!r) return null;
  const { e: p } = r;
  if (p.dead) return null;
  if (!nearBanker(ctx, p)) return null;
  const book = ctx.accountBanks.get(accountId);
  if (!book) return null;
  return {
    slots: book.inventory.map(cloneInvSlot),
    capacity: accountBankCapacity(book),
    purchasedSlots: book.purchasedSlots,
    nextExpansionPrice: accountBankNextExpansionPrice(book),
  };
}
