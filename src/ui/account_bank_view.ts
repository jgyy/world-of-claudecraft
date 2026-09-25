// Pure view-core for the Account tab of the Bank window (#bank-window): an
// account-wide item store shared across every character on the account, read
// off the IWorld accountBankInfo mirror. DOM/Three/i18n-free, the buildBankView
// (bank_view.ts) shape: it maps the proximity-gated AccountBankInfo snapshot
// (null away from a banker, while dead, or offline, where accounts do not
// exist) to a flat render model the thin pane painter (account_bank_window.ts)
// draws. Reuses bank_view.ts's own BankSlotModel/bankSlotAction so the grid
// cell (personal_bank_item_cell.ts) and click handling need no bespoke
// account-bank copy: an account bank slot is shaped exactly like a personal
// bank slot (item, count, quality, per-copy payload).
//
// SCOPE (v1): every character on the account may freely deposit/withdraw (no
// officer/read-only distinction, since the account has exactly one owner).
// A slot the anonymous-pipe item policy would refuse (src/sim/guild_bank.ts
// guildBankPipeRefusal, reused by the sim's accountBankDeposit/Withdraw) is
// NOT given the guild bank's dormant styling here: unlike a guild's shared
// pool, nothing can ever be deposited into an account's own book in a state
// the withdraw side would then refuse (both directions run the identical
// policy, and there is no second depositor to hand a book a stale row).
// A later content reclassification is the only reachable edge, and it
// degrades to the sim's own plain refusal toast rather than a styled cell,
// exactly the personal bank's posture (which carries no dormant concept at
// all). Money stays out of this pane entirely: the account bank moves items
// only, never copper (Ravenpost mail already moves gold between characters).
//
// Registered in UI_PURE_CORES; unit-tested against both Sim- and
// ClientWorld-shaped inputs in tests/account_bank_view.test.ts.

import { ACCOUNT_BANK_EXPANSION_SLOTS } from '../sim/account_bank';
import type { AccountBankInfo } from '../world_api';
import { bagQualityKey } from './bags_view';
import type { BankItemLookup, BankSlotModel } from './bank_view';

export type { BankItemLookup as AccountBankItemLookup };

/** The expand-slots footer: the next block's copper price (null once maxed)
 *  and the block size. No affordability flag (the personal bank's phase 13
 *  precedent: the only use for one would be a guess the button never needs,
 *  since the sim refuses with its own localized line either way). */
export interface AccountBankBuySlotsModel {
  nextPrice: number | null;
  blockSlots: number;
  maxed: boolean;
}

/** The header counter: occupied slots over the total budget. */
export interface AccountBankCapacityModel {
  used: number;
  total: number;
  purchasedSlots: number;
}

/** The whole account pane model: 'hidden' when accountBankInfo is null
 *  (offline, away from a banker, or dead), else the populated grid + buy
 *  panel. Slot order and indices are preserved verbatim (no search/sort
 *  layer, the guild tab's own choice: an account book stays small enough that
 *  one is not worth the complexity yet). */
export type AccountBankViewModel =
  | { kind: 'hidden' }
  | {
      kind: 'account';
      capacity: AccountBankCapacityModel;
      slots: BankSlotModel[];
      // Free cells to paint after the items. Over-capacity states (a
      // tampered/legacy book with used > total) clamp to 0, never a negative pad.
      emptyCells: number;
      empty: boolean; // no occupied slots
      buy: AccountBankBuySlotsModel;
    };

/** Map the gated account bank snapshot to the render model. `info` is null
 *  whenever the tab must not render (both worlds), which yields 'hidden'.
 *  Slot order and indices are preserved verbatim; nothing is dropped. */
export function buildAccountBankView(
  info: AccountBankInfo | null,
  lookup: BankItemLookup,
): AccountBankViewModel {
  if (!info) return { kind: 'hidden' };
  const used = info.slots.length;
  const total = info.capacity;
  const slots: BankSlotModel[] = info.slots.map((slot, slotIndex) => ({
    slotIndex,
    itemId: slot.itemId,
    count: slot.count,
    showCount: slot.count > 1,
    qualityKey: bagQualityKey(lookup(slot.itemId) ?? {}, slot.instance),
    instance: slot.instance,
    ...(slot.materialSources === undefined ? {} : { materialSources: slot.materialSources }),
  }));
  return {
    kind: 'account',
    capacity: { used, total, purchasedSlots: info.purchasedSlots },
    slots,
    emptyCells: Math.max(0, total - used),
    empty: slots.length === 0,
    buy: {
      nextPrice: info.nextExpansionPrice,
      blockSlots: ACCOUNT_BANK_EXPANSION_SLOTS,
      maxed: info.nextExpansionPrice === null,
    },
  };
}
