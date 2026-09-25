// @vitest-environment jsdom
// Drives the REAL BankWindow with its composed AccountBankTab pane
// (account_bank_window.ts) against a jsdom container, the vault_window.test.ts
// harness shape: the Account tab renders ONLY while accountBankInfo is
// non-null and snaps back to Personal when it disappears, the grid renders
// from the wire snapshot, withdraw/buy round-trip through the IWorldAccountBank
// commands, and accountTabActive (the bags-companion arming getter) tracks
// exactly the open+tab+live-mirror state.

import { beforeEach, describe, expect, it } from 'vitest';
import type { InvSlot } from '../src/sim/types';
import { BankWindow, type BankWindowDeps } from '../src/ui/bank_window';
import type { AccountBankInfo, BankInfo, IWorld } from '../src/world_api';

function personalInfo(): BankInfo {
  return {
    slots: [],
    capacity: 24,
    purchasedSlots: 0,
    bonusSlots: 0,
    nextExpansionCost: 500,
    bonusSources: [],
    socketsUnlocked: 0,
    socketBags: [null, null, null, null],
    nextSocketCost: 1000000,
    generalCapacity: 24,
    materialsCapacity: 0,
    generalUsed: 0,
    materialsUsed: 0,
  };
}

function accountInfo(over: Partial<AccountBankInfo> = {}): AccountBankInfo {
  return { slots: [], capacity: 24, purchasedSlots: 0, nextExpansionPrice: 20000, ...over };
}

interface Harness {
  window: BankWindow;
  root: HTMLElement;
  world: {
    bankInfo: BankInfo | null;
    guildBankInfo: null;
    vaultInfo: null;
    accountBankInfo: AccountBankInfo | null;
    inventory: InvSlot[];
    bags: (string | null)[];
    copper: number;
    player: { dead: boolean };
    accountBankDeposit: (...a: unknown[]) => void;
    accountBankWithdraw: (...a: unknown[]) => void;
    accountBankBuySlots: () => void;
  };
  calls: string[];
}

function harness(account: AccountBankInfo | null): Harness {
  document.body.innerHTML = '<div id="prompt-stack"></div>';
  const root = document.createElement('div');
  root.id = 'bank-window';
  document.body.appendChild(root);
  const calls: string[] = [];
  const world = {
    bankInfo: personalInfo(),
    guildBankInfo: null,
    vaultInfo: null,
    accountBankInfo: account,
    inventory: [] as InvSlot[],
    bags: [null, null, null, null] as (string | null)[],
    copper: 100_000,
    player: { dead: false },
    bankDeposit: (): void => {},
    bankWithdraw: (): void => {},
    bankBuySlots: (): void => {},
    accountBankDeposit: (...a: unknown[]) => calls.push(`accountBankDeposit:${a.join(',')}`),
    accountBankWithdraw: (...a: unknown[]) => calls.push(`accountBankWithdraw:${a.join(',')}`),
    accountBankBuySlots: () => calls.push('accountBankBuySlots'),
  };
  const noop = (): void => {};
  const deps: BankWindowDeps = {
    itemIcon: () => '<span class="item-icon"></span>',
    moneyHtml: (c: number) => `<span class="money-inline">${c}</span>`,
    itemTooltip: () => '',
    attachTooltip: noop,
    root: () => root,
    world: () => world as unknown as IWorld,
    closeOthers: noop,
    hideTooltip: noop,
    consumePeek: () => false,
    captureFocus: () => null,
    restoreFocus: noop,
    onClosed: noop,
    onInventoryChanged: noop,
  };
  return { window: new BankWindow(deps), root, world, calls };
}

const accountTabButton = (h: Harness): HTMLElement | null =>
  h.root.querySelector('.bank-tab[data-tab="account"]');

function clickAccountTab(h: Harness): void {
  (accountTabButton(h) as HTMLElement).click();
}

beforeEach(() => {
  localStorage.clear();
});

describe('the Account tab strip entry', () => {
  it('ACCEPTANCE: renders only while accountBankInfo is non-null and snaps back to Personal when it disappears', () => {
    const h = harness(accountInfo());
    h.window.open();
    expect(accountTabButton(h)).not.toBeNull();
    clickAccountTab(h);
    expect(h.root.querySelector('#bank-panel-account')).not.toBeNull();

    h.world.accountBankInfo = null;
    h.window.refreshIfChanged();
    expect(accountTabButton(h)).toBeNull();
    expect(h.root.querySelector('#bank-panel-account')).toBeNull();
  });

  it('an account-less world (explicit null) never renders the tab', () => {
    const h = harness(null);
    h.window.open();
    expect(accountTabButton(h)).toBeNull();
  });

  it('a world with NO accountBankInfo member at all never renders the tab (the loose != arm)', () => {
    const h = harness(null);
    delete (h.world as { accountBankInfo?: unknown }).accountBankInfo;
    h.window.open();
    expect(accountTabButton(h)).toBeNull();
    expect(h.root.querySelector('.bank-tab')).toBeNull();
  });
});

describe('the Account pane grid', () => {
  it('renders occupied slots and the capacity line', () => {
    const h = harness(accountInfo({ slots: [{ itemId: 'roasted_boar', count: 3 }] }));
    h.window.open();
    clickAccountTab(h);
    const cells = h.root.querySelectorAll('#bank-panel-account button.bank-item');
    expect(cells.length).toBe(1);
    expect(h.root.querySelector('#bank-panel-account .bank-capacity')?.textContent).toContain('1');
  });

  it('an empty book renders the empty-state line', () => {
    const h = harness(accountInfo());
    h.window.open();
    clickAccountTab(h);
    expect(h.root.querySelector('#bank-panel-account .bank-empty')).not.toBeNull();
  });

  it('clicking a slot withdraws the whole stack', () => {
    const h = harness(accountInfo({ slots: [{ itemId: 'roasted_boar', count: 3 }] }));
    h.window.open();
    clickAccountTab(h);
    (h.root.querySelector('#bank-panel-account button.bank-item') as HTMLElement).click();
    expect(h.calls).toEqual(['accountBankWithdraw:0']);
  });
});

describe('the Account expand-slots buy row', () => {
  it('confirming the prompt sends accountBankBuySlots', () => {
    const h = harness(accountInfo());
    h.window.open();
    clickAccountTab(h);
    (h.root.querySelector('#bank-panel-account .bank-buy-btn') as HTMLElement).click();
    const confirm = document.querySelector('.abank-buy-prompt .btn') as HTMLElement;
    expect(confirm).not.toBeNull();
    confirm.click();
    expect(h.calls).toEqual(['accountBankBuySlots']);
  });

  it('a maxed ladder renders the maxed label instead of a buy button', () => {
    const h = harness(accountInfo({ nextExpansionPrice: null }));
    h.window.open();
    clickAccountTab(h);
    expect(h.root.querySelector('#bank-panel-account .bank-buy-btn')).toBeNull();
    expect(h.root.querySelector('#bank-panel-account .bank-buy-maxed')).not.toBeNull();
  });
});

describe('accountTabActive (the bags-companion arming getter)', () => {
  it('true only while OPEN on the account tab with a live mirror', () => {
    const h = harness(accountInfo());
    expect(h.window.accountTabActive).toBe(false); // closed
    h.window.open();
    expect(h.window.accountTabActive).toBe(false); // personal tab showing
    clickAccountTab(h);
    expect(h.window.accountTabActive).toBe(true);
    h.window.close();
    expect(h.window.accountTabActive).toBe(false); // closed again
  });
});
