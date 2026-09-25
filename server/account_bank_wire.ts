// The Account Bank COMMAND DISPATCH: the wire-shape checks for the three
// mutations (`account_bank_deposit`, `_withdraw`, `_buy_slots`), extracted
// from GameServer's message switch the way server/guild_bank_wire.ts and
// server/bank_wire.ts took their own clusters.
//
// Shape-only checks here (the bank_* idiom): the Sim owns every gameplay rule
// (banker proximity, the anonymous-pipe item policy, price, capacity). `slot`
// is a container index, `count` optional (omit = whole stack). Unlike the
// guild bank this dispatch carries no bank_ledger audit trail: the account
// bank has exactly one owner (the account itself), so there is no
// "who took the ore" trust question a log would answer.
//
// accountId is the SESSION's own authenticated account id, never read from
// the wire message: a client can only ever act on its own account's book.

import type { MaterialSourceTransferSelection } from '../src/sim/material_source_transfer_selection';
import { readMaterialSourceTransferWire } from './material_source_transfer_wire';

export type AccountBankCommandName =
  | 'account_bank_deposit'
  | 'account_bank_withdraw'
  | 'account_bank_buy_slots';

export const ACCOUNT_BANK_COMMANDS: readonly AccountBankCommandName[] = [
  'account_bank_deposit',
  'account_bank_withdraw',
  'account_bank_buy_slots',
];

/** The Sim mutations the dispatch needs, by pid + accountId. */
export interface AccountBankWireSim {
  accountBankDepositFor(
    pid: number,
    accountId: number,
    slot: number,
    count?: number,
    selection?: MaterialSourceTransferSelection,
  ): void;
  accountBankWithdrawFor(
    pid: number,
    accountId: number,
    slot: number,
    count?: number,
    selection?: MaterialSourceTransferSelection,
  ): void;
  accountBankBuySlotsFor(pid: number, accountId: number): void;
}

export function isAccountBankCommand(cmd: string): cmd is AccountBankCommandName {
  return (ACCOUNT_BANK_COMMANDS as readonly string[]).includes(cmd);
}

/** Dispatch one account bank mutation frame. A malformed frame (a missing or
 *  non-numeric `slot`) is dropped silently, exactly as the bank_* idiom does:
 *  the honest client never sends one. */
export function dispatchAccountBankCommand(
  sim: AccountBankWireSim,
  cmd: AccountBankCommandName,
  msg: Record<string, unknown>,
  pid: number,
  accountId: number,
): void {
  switch (cmd) {
    case 'account_bank_deposit':
    case 'account_bank_withdraw': {
      if (typeof msg.slot !== 'number') break;
      const slot = msg.slot;
      const transfer = readMaterialSourceTransferWire(msg, slot);
      if (transfer === null) break;
      const { count, selection } = transfer;
      if (cmd === 'account_bank_deposit') {
        sim.accountBankDepositFor(pid, accountId, slot, count, selection);
      } else {
        sim.accountBankWithdrawFor(pid, accountId, slot, count, selection);
      }
      break;
    }
    case 'account_bank_buy_slots':
      sim.accountBankBuySlotsFor(pid, accountId);
      break;
  }
}
