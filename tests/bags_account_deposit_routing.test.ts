// @vitest-environment jsdom
// Behavioral pin for the ACCOUNT-tab bag-click routing: drives the REAL
// BagsWindow (the bags_guild_deposit_routing.test.ts fixture idiom) with
// isAccountBankTab true and asserts WHICH facet command a click actually
// invokes (accountBankDeposit with the reference-resolved index, never the
// personal bankDeposit or the guild's guildBankDeposit) and which localized
// sim line each pipe deny shows (the account-worded lines, never the guild's
// GUILD-worded strings).
import { describe, expect, it } from 'vitest';
import { ITEMS } from '../src/sim/data';
import type { InvSlot } from '../src/sim/types';
import { BagsWindow, type BagsWindowDeps } from '../src/ui/bags_window';
import { ItemDragState } from '../src/ui/item_drag_state';
import { tSim } from '../src/ui/sim_i18n';
import type { IWorld } from '../src/world_api';

const plainId = Object.keys(ITEMS).find((id) => {
  const d = ITEMS[id];
  return !d.soulbound && !d.noMarketList && d.kind !== 'quest' && d.kind !== 'bag';
}) as string;
const questId = Object.keys(ITEMS).find((id) => ITEMS[id].kind === 'quest') as string;
const soulboundId = Object.keys(ITEMS).find(
  (id) => ITEMS[id].soulbound && ITEMS[id].kind !== 'quest',
) as string;
const noMarketId = Object.keys(ITEMS).find(
  (id) => ITEMS[id].noMarketList && !ITEMS[id].soulbound && ITEMS[id].kind !== 'quest',
) as string;

interface Harness {
  root: HTMLElement;
  calls: string[];
  errors: string[];
}

function harness(inventory: InvSlot[], accountTab: boolean, personalTab = !accountTab): Harness {
  document.body.innerHTML = '<div id="prompt-stack"></div>';
  const calls: string[] = [];
  const errors: string[] = [];
  const sink =
    (name: string) =>
    (...a: unknown[]) =>
      calls.push(`${name}:${a.filter((x) => x !== undefined).join(',')}`);
  const world = {
    inventory,
    bags: [null, null, null, null],
    bagCapacity: 16,
    copper: 0,
    bankInfo: null,
    bankDeposit: sink('bankDeposit'),
    bankSocketBag: sink('bankSocketBag'),
    accountBankDeposit: sink('accountBankDeposit'),
    useItem: sink('useItem'),
    equipBag: sink('equipBag'),
    unequipBag: sink('unequipBag'),
    discardItem: sink('discardItem'),
    feedPet: sink('feedPet'),
    sellItem: sink('sellItem'),
    moveInventoryItem: sink('moveInventoryItem'),
  } as unknown as IWorld;
  const root = document.createElement('div');
  document.body.appendChild(root);
  const noop = (): void => {};
  const deps: BagsWindowDeps = {
    itemIcon: () => '<span class="item-icon"></span>',
    moneyHtml: () => '',
    itemTooltip: () => '',
    attachTooltip: noop,
    root: () => root,
    world: () => world,
    wocBalanceHtml: () => '',
    claudiumLauncherHtml: () => '',
    openClaudium: noop,
    openWallet: noop,
    hideTooltip: noop,
    consumePeek: () => false,
    cancelPetFeed: noop,
    captureFocus: () => null,
    restoreFocus: noop,
    renderCharIfOpen: noop,
    vendorOpen: () => false,
    tradeOpen: () => false,
    isMarketSell: () => false,
    isMailAttach: () => false,
    isBankOpen: () => true,
    isPersonalBankTab: () => personalTab,
    isGuildBankTab: () => false,
    isVaultBankTab: () => false,
    isAccountBankTab: () => accountTab,
    pendingPetFeed: () => false,
    closeVendor: noop,
    closeBank: noop,
    onClosed: noop,
    addItemToTrade: noop,
    tradeOfferHeadroom: () => 0,
    stageMarketSell: noop,
    stageMailParcel: noop,
    insertItemChatLink: noop,
    showError: (text: string) => errors.push(text),
    setPendingPetFeed: noop,
    resetPetBarSig: noop,
    isHotbarItemId: () => false,
    useGatherTool: () => false,
    setDragAction: noop,
    clearActionDropTargets: noop,
    dragState: new ItemDragState(),
    isTouchHud: () => false,
    sellConfirmPolicy: () => ({ enabled: true, minQualityRank: 1 }),
    markEquipDropTargets: noop,
    dropOnEquipSlot: noop,
    dropOnActionSlot: noop,
    dropOnActionRingSlot: noop,
    openItemActionMenu: noop,
  };
  new BagsWindow(deps).render();
  return { root, calls, errors };
}

function clickCellFor(root: HTMLElement, itemId: string, shift = false): void {
  const cells = Array.from(root.querySelectorAll<HTMLElement>('button.bag-item'));
  const cell = cells.find((c) => c.getAttribute('aria-label')?.includes(ITEMS[itemId].name));
  expect(cell, `no bag cell for ${itemId}`).toBeTruthy();
  cell?.dispatchEvent(new MouseEvent('click', { bubbles: true, shiftKey: shift }));
}

describe('account-tab bag click routing (behavioral, real BagsWindow)', () => {
  it('routes an allowed click to accountBankDeposit with the reference-resolved index, never bankDeposit or guildBankDeposit', () => {
    const h = harness(
      [
        { itemId: questId, count: 1 },
        { itemId: plainId, count: 1 },
      ],
      true,
    );
    clickCellFor(h.root, plainId);
    expect(h.calls).toEqual(['accountBankDeposit:1']);
  });

  it('keeps routing to the PERSONAL bankDeposit while the Personal tab is active', () => {
    const h = harness([{ itemId: plainId, count: 1 }], false);
    clickCellFor(h.root, plainId);
    expect(h.calls).toEqual(['bankDeposit:0']);
  });

  it('the shift split prompt submit sends accountBankDeposit(index, count)', () => {
    const h = harness([{ itemId: plainId, count: 5 }], true);
    clickCellFor(h.root, plainId, true);
    const prompt = document.querySelector('.bank-deposit-prompt') as HTMLElement;
    expect(prompt).not.toBeNull();
    const input = prompt.querySelector('.prompt-number') as HTMLInputElement;
    input.value = '3';
    (prompt.querySelector('.btn') as HTMLElement).click();
    expect(h.calls).toEqual(['accountBankDeposit:0,3']);
  });

  it('each pipe deny voices its ACCOUNT-worded sim line (never the guild wording) and dispatches nothing', () => {
    const denies: Array<[string, string]> = [
      [questId, tSim('error.accountBankQuestItem')],
      [soulboundId, tSim('error.accountBankSoulbound')],
      [noMarketId, tSim('error.accountBankNoTransfer')],
    ];
    for (const [itemId, line] of denies) {
      const h = harness([{ itemId, count: 1 }], true);
      clickCellFor(h.root, itemId);
      expect(h.calls, itemId).toEqual([]);
      expect(h.errors, itemId).toEqual([line]);
      // Never the guild's GUILD-worded line for the same dimension.
      expect(h.errors[0]).not.toContain('guild bank');
    }
  });

  it('a transfer-locked copy denies with the account no-transfer line and dispatches nothing', () => {
    const h = harness([{ itemId: plainId, count: 1, instance: { boundTo: 7 } }], true);
    clickCellFor(h.root, plainId);
    expect(h.calls).toEqual([]);
    expect(h.errors).toEqual([tSim('error.accountBankNoTransfer')]);
  });
});
