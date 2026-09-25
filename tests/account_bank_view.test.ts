// Pure view-core tests for the Account tab of the Bank window
// (account_bank_view.ts): the accountBankInfo -> AccountBankViewModel mapping.
// DOM-free (registered in UI_PURE_CORES, tests/architecture.test.ts).

import { describe, expect, it } from 'vitest';
import { ACCOUNT_BANK_EXPANSION_SLOTS } from '../src/sim/account_bank';
import { buildAccountBankView } from '../src/ui/account_bank_view';
import type { AccountBankInfo } from '../src/world_api';

const lookup = () => undefined;

describe('buildAccountBankView', () => {
  it('is hidden when info is null (offline, away from a banker, or dead)', () => {
    expect(buildAccountBankView(null, lookup)).toEqual({ kind: 'hidden' });
  });

  it('maps an empty book to the empty grid with the full capacity free', () => {
    const info: AccountBankInfo = {
      slots: [],
      capacity: 24,
      purchasedSlots: 0,
      nextExpansionPrice: 20000,
    };
    expect(buildAccountBankView(info, lookup)).toEqual({
      kind: 'account',
      capacity: { used: 0, total: 24, purchasedSlots: 0 },
      slots: [],
      emptyCells: 24,
      empty: true,
      buy: { nextPrice: 20000, blockSlots: ACCOUNT_BANK_EXPANSION_SLOTS, maxed: false },
    });
  });

  it('maps occupied slots verbatim, preserving order and index', () => {
    const info: AccountBankInfo = {
      slots: [
        { itemId: 'roasted_boar', count: 3 },
        { itemId: 'copper_ore', count: 5 },
      ],
      capacity: 24,
      purchasedSlots: 6,
      nextExpansionPrice: 50000,
    };
    const model = buildAccountBankView(info, lookup);
    expect(model.kind).toBe('account');
    if (model.kind !== 'account') throw new Error('unreachable');
    expect(model.slots).toEqual([
      {
        slotIndex: 0,
        itemId: 'roasted_boar',
        count: 3,
        showCount: true,
        qualityKey: 'common',
        instance: undefined,
      },
      {
        slotIndex: 1,
        itemId: 'copper_ore',
        count: 5,
        showCount: true,
        qualityKey: 'common',
        instance: undefined,
      },
    ]);
    expect(model.capacity).toEqual({ used: 2, total: 24, purchasedSlots: 6 });
    expect(model.emptyCells).toBe(22);
    expect(model.empty).toBe(false);
  });

  it('a lone item hides its count (showCount false)', () => {
    const info: AccountBankInfo = {
      slots: [{ itemId: 'roasted_boar', count: 1 }],
      capacity: 24,
      purchasedSlots: 0,
      nextExpansionPrice: 20000,
    };
    const model = buildAccountBankView(info, lookup);
    if (model.kind !== 'account') throw new Error('unreachable');
    expect(model.slots[0].showCount).toBe(false);
  });

  it('clamps emptyCells to 0 for a tampered over-capacity book, never negative', () => {
    const info: AccountBankInfo = {
      slots: Array.from({ length: 30 }, (_, i) => ({ itemId: `filler_${i}`, count: 1 })),
      capacity: 24,
      purchasedSlots: 0,
      nextExpansionPrice: 20000,
    };
    const model = buildAccountBankView(info, lookup);
    if (model.kind !== 'account') throw new Error('unreachable');
    expect(model.emptyCells).toBe(0);
  });

  it('maxed is true once the wire quotes no next price', () => {
    const info: AccountBankInfo = {
      slots: [],
      capacity: 60,
      purchasedSlots: 36,
      nextExpansionPrice: null,
    };
    const model = buildAccountBankView(info, lookup);
    if (model.kind !== 'account') throw new Error('unreachable');
    expect(model.buy).toEqual({
      nextPrice: null,
      blockSlots: ACCOUNT_BANK_EXPANSION_SLOTS,
      maxed: true,
    });
  });

  it('never invents a price the wire did not send (no client price table)', () => {
    // A snapshot claiming a non-maxed ladder with no price is unreachable off a
    // real sim, but the core must not fabricate one either way.
    const info: AccountBankInfo = {
      slots: [],
      capacity: 24,
      purchasedSlots: 0,
      nextExpansionPrice: null,
    };
    const model = buildAccountBankView(info, lookup);
    if (model.kind !== 'account') throw new Error('unreachable');
    expect(model.buy.nextPrice).toBeNull();
    expect(model.buy.maxed).toBe(true);
  });
});
