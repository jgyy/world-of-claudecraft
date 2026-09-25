// SQL boundary for the account bank (src/sim/account_bank.ts): a single JSONB
// row per (account, realm), the account_wealth / account_weapon_cosmetics
// precedent for account-scoped state, scoped to a realm the same way
// guild_banks is (a character's alts on a different realm keep a separate
// book there). One row per account per realm, cascade-deleted with the
// account. No escrow-merge machinery: MAX_ACTIVE_SESSIONS_PER_ACCOUNT (server/
// game.ts) means only one session ever writes a given account's row at a
// time, so a plain load-at-join, save-at-autosave-and-leave lifecycle
// (server/game.ts join/saveCharacter/leave) is sufficient, unlike the guild
// bank's book shared by many simultaneous officers.
//
// Deliberate lazy `pool` read (the account_cosmetics_db doctrine): `pool` is
// touched only inside the functions, never at module scope.

import { pool } from './db';
import { REALM } from './realm';

// account_banks is bounded (one row per account per realm, cascade-deleted
// with the account), so it needs no retention registration: it can never grow
// past the accounts table it references.
export const ACCOUNT_BANK_SCHEMA = `
CREATE TABLE IF NOT EXISTS account_banks (
  account_id INT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  realm TEXT NOT NULL,
  data JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, realm)
);
`;

/** The raw JSONB blob for one account's book on this realm, or null when no
 *  row exists yet (a fresh account, or one that has never opened the account
 *  bank tab). Handed to `sim.loadAccountBank`, which owns sanitizing it
 *  (src/sim/account_bank.ts sanitizeAccountBankState). */
export async function loadAccountBankRow(accountId: number): Promise<unknown> {
  const res = await pool.query(
    `SELECT data FROM account_banks WHERE account_id = $1 AND realm = $2`,
    [accountId, REALM],
  );
  return res.rows[0]?.data ?? null;
}

/** Upsert one account's book for this realm. Called on the normal character
 *  save cadence (autosave + leave, server/game.ts saveCharacter) for any
 *  session whose account has a loaded book; unconditional (no dirty-tracking)
 *  because the write is bounded by the connected-session count, the same
 *  multiplier the character autosave itself already pays every tick. */
export async function saveAccountBankState(accountId: number, data: unknown): Promise<void> {
  await pool.query(
    `INSERT INTO account_banks (account_id, realm, data, updated_at) VALUES ($1, $2, $3, now())
     ON CONFLICT (account_id, realm) DO UPDATE SET data = EXCLUDED.data, updated_at = now()`,
    [accountId, REALM, JSON.stringify(data)],
  );
}
