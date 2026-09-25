import type { MaterialSourceTransferSelection } from '../sim/material_source_transfer_selection';
import type { InvSlot } from '../sim/types';

// ---------------------------------------------------------------------------
// The Account Bank: an account-wide pooled item store shared across every
// character on the account, the account-scale sibling of the personal bank
// (bank.ts). Unlike the Guild Bank (an anonymous exchange pipe between
// DIFFERENT players), this pipe moves items between different CHARACTERS of
// the SAME player, exactly the use case Ravenpost mail already serves
// (server/game.ts names it: mail moves coin and goods between an account's
// characters). It carries the identical anonymous-pipe item policy mail and
// the guild bank enforce (src/sim/guild_bank.ts anonymousPipeRefused, the
// shared WHETHER; account_bank.ts words its own refusal text, never the guild
// bank's GUILD-worded strings): quest, soulbound, noMarketList, and per-copy
// transfer-locked items are refused in both directions, because a round trip
// through ANY shared container must not let a bind-on-pickup or quest-bound
// copy escape the character that earned it.
//
// accountBankInfo streams only while the player stands at a banker NPC (the
// bankInfo / guildBankInfo pattern). Offline play has no account, so the
// offline Sim reads null and every command is inert, forever.
//
// Only ONE character per account may be online at a time
// (MAX_ACTIVE_SESSIONS_PER_ACCOUNT, server/game.ts), so unlike the guild bank
// this book never has two simultaneous writers and needs no escrow-merge
// machinery: it loads at join and saves/evicts at leave, exactly like any
// other per-session state.
// ---------------------------------------------------------------------------

export interface AccountBankInfo {
  slots: InvSlot[]; // the pooled contents (a boundary clone, never a live sim reference)
  capacity: number; // total slot budget: base plus every bought expansion
  // Copper-bought expansion slots, always a multiple of ACCOUNT_BANK_EXPANSION_SLOTS
  // in [0, ACCOUNT_BANK_PURCHASED_SLOTS_MAX] (src/sim/account_bank.ts).
  purchasedSlots: number;
  // Copper price of the NEXT expansion (table lookup, never client-supplied),
  // null once every expansion has been purchased.
  nextExpansionPrice: number | null;
}

export interface IWorldAccountBank {
  // Non-null only while the player stands at a banker NPC.
  accountBankInfo: AccountBankInfo | null;
  accountBankDeposit(
    slotIndex: number,
    count?: number,
    selection?: MaterialSourceTransferSelection,
  ): void;
  accountBankWithdraw(
    slotIndex: number,
    count?: number,
    selection?: MaterialSourceTransferSelection,
  ): void;
  accountBankBuySlots(): void;
}
