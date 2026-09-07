// The account Reliquary fold: the server-side half of account-wide ownership
// (the pure half is src/sim/reliquary_account.ts). One live ledger per online
// account; each fold takes a character's current ownership surfaces, unions
// them in, and reports the grown ledger so the caller can push it to every
// live session on the account and the sim's PlayerMeta stamp. Growth persists
// through a per-account serial writer (the weapon-skin loadout idiom), so two
// folds for one account never interleave their inserts.
//
// Cadence is the caller's: game.ts folds at join (the character's own fills
// seed the account the first time it logs in after this shipped), on every
// non-retro relic fill, and on the 60 second standing sweep as a catch-all
// for surfaces with no fill event (a mount reins bought, a title deed).

import {
  catalogCharacterCompletion,
  characterReliquaryOwnership,
  curatorRankFromOwned,
} from '../src/sim/reliquary';
import {
  accountReliquaryLedgerFromOwnership,
  emptyAccountReliquaryLedger,
  mergeAccountReliquaryLedger,
} from '../src/sim/reliquary_account';
import type { PlayerMeta } from '../src/sim/sim';
import type { AccountReliquaryLedger } from '../src/world_api/cosmetics';
import { addAccountRelics } from './account_reliquary_db';
import { createKeyedSerialWriter } from './serial_writer';

export interface CuratorStanding {
  rank: number;
  owned: number;
  total: number;
}

/** The identity-wire Curator standing (crk/cro/crt) for a player meta, or
 *  null when unranked (an owned count of 0 reads as ABSENT on the wire, never
 *  zero). Account-wide through characterReliquaryOwnership. Gated on the
 *  RANK so the three fields move as one: rank >= 1 iff owned >= 1 today. */
export function curatorStandingFor(meta: PlayerMeta): CuratorStanding | null {
  const { owned, total } = catalogCharacterCompletion(characterReliquaryOwnership(meta));
  const rank = curatorRankFromOwned(owned);
  return rank > 0 ? { rank, owned, total } : null;
}

/** Stamp a grown ledger onto a live PlayerMeta (a no-op for a missing meta or
 *  an absent ledger), so the sim's grant paths read the account union. */
export function stampAccountRelics(
  meta: PlayerMeta | null | undefined,
  ledger: AccountReliquaryLedger | undefined,
): void {
  if (meta && ledger) meta.accountRelics = ledger;
}

export class AccountReliquaryFold {
  private readonly ledgers = new Map<number, AccountReliquaryLedger>();
  private readonly saves = createKeyedSerialWriter<number>();

  constructor(
    private readonly persist: (
      accountId: number,
      added: AccountReliquaryLedger,
    ) => Promise<unknown> = addAccountRelics,
  ) {}

  /** The live ledger for an account (empty when nothing is known yet). */
  ledgerFor(accountId: number): AccountReliquaryLedger {
    return this.ledgers.get(accountId) ?? emptyAccountReliquaryLedger();
  }

  /** Seed (or widen) the live ledger from a stored read at join. Never
   *  narrows: a stale read cannot drop an id a fold already added. */
  remember(accountId: number, ledger: AccountReliquaryLedger | undefined): AccountReliquaryLedger {
    if (!ledger) return this.ledgerFor(accountId);
    const merged = mergeAccountReliquaryLedger(this.ledgerFor(accountId), ledger).ledger;
    this.ledgers.set(accountId, merged);
    return merged;
  }

  /**
   * Fold one character's live ownership into its account ledger. Returns the
   * grown ledger when the character held an id the account did not, and null
   * when nothing moved (the overwhelming case on the sweep). Growth is
   * persisted in the background; a failed insert is logged and retried by the
   * next fold, because the live ledger already holds the id and the next fold
   * re-derives `added` against the stored row set only through this same
   * in-memory copy. That is deliberate: losing a write costs one re-insert at
   * the next join, never a lost fill (the character's own surfaces still carry
   * it and will fold again).
   */
  fold(accountId: number, meta: PlayerMeta): AccountReliquaryLedger | null {
    const own = accountReliquaryLedgerFromOwnership({
      itemsDiscovered: meta.deedStats.itemsDiscovered,
      marks: meta.reliquary.marks,
      ownedMounts: characterReliquaryOwnership(meta).ownedMounts,
      deedsEarned: meta.deedsEarned,
    });
    const { ledger, grew, added } = mergeAccountReliquaryLedger(this.ledgerFor(accountId), own);
    if (!grew) return null;
    this.ledgers.set(accountId, ledger);
    void this.saves
      .enqueue(accountId, () => this.persist(accountId, added))
      .catch((err) => console.error('failed to save account relics:', err));
    return ledger;
  }
}
