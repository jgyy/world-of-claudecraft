// Account tab pane painter for the Bank window (#bank-window): renders the
// account-wide item store (grid + expansion purchase) from the structured
// AccountBankViewModel (account_bank_view.ts). Every character on the account
// may freely deposit/withdraw (no officer/read-only distinction: the account
// has exactly one owner). The pure core decides slot shape, capacity, and the
// buy panel; this thin consumer renders that and wires every action back
// through the IWorldAccountBank facet commands, reusing the personal bank's
// own item-cell builder (personal_bank_item_cell.ts) and slot-action decision
// (bank_view.ts bankSlotAction) rather than a bespoke copy: an account bank
// slot is shaped exactly like a personal bank slot.
//
// It is composed by BankWindow (bank_window.ts), which owns the tab strip,
// the open/close lifecycle, the refresh signature, and the prompt-dialog
// chrome (injected here as installPromptDialog so the account prompts share
// the exact WCAG wiring, #prompt-stack mount, and force-close teardown the
// personal prompts have).
//
// Cold-pane contract (the bank_window cold-bucket rules): no forced-reflow
// layout read (BankWindow owns the .bank-scroll offset capture) and no
// repeating driver.

import { audio } from '../game/audio';
import { ITEMS } from '../sim/data';
import type { InvSlot } from '../sim/types';
import type { IWorld } from '../world_api';
import {
  type AccountBankBuySlotsModel,
  type AccountBankViewModel,
  buildAccountBankView,
} from './account_bank_view';
import { showBuyConfirmPrompt } from './bank_buy_prompt';
import { bankSlotDisplayName } from './bank_item_name_core';
import { showQuantityPrompt } from './bank_quantity_prompt';
import { bankSlotAction } from './bank_view';
import { esc } from './esc';
import { formatMoney, t } from './i18n';
import { knownItemDef } from './known_item';
import type { PainterHostPresentation } from './painter_host';
import {
  buildPersonalBankItemCell,
  type PersonalBankItemCellDeps,
} from './personal_bank_item_cell';

/**
 * BankWindow-supplied glue. The icon/money/tooltip painters are the shared
 * PainterHostPresentation bag; on top ride the world reads/commands, the
 * peek-suppression, the sibling repaint nudge, and the prompt-dialog installer
 * (BankWindow's own, so account prompts share its aria wiring and teardown).
 */
export interface AccountBankTabDeps extends PainterHostPresentation {
  /** The #bank-window root (for prompt focus landing; never hardcoded). */
  root(): HTMLElement;
  /** The live world (offline Sim or online ClientWorld mirror). */
  world(): IWorld;
  hideTooltip(): void;
  /** True when this click is the release of a long-press tooltip peek (the
   *  bank grid semantics: the release inspects, never withdraws). */
  consumePeek(): boolean;
  /** An account bank op moved inventory: repaint the bags companion. */
  onInventoryChanged(): void;
  /** BankWindow's WCAG prompt-dialog wiring (Tab cycle, Escape, inert root). */
  installPromptDialog(
    prompt: HTMLElement,
    opener: HTMLElement | null,
    close: () => void,
  ): { dismiss: () => void; dismissAndReturn: () => void };
  /** BankWindow's sibling-prompt teardown (dismissBankPrompts): every account
   *  prompt opener calls it first so two prompts can never stack. */
  dismissPrompts(): void;
  /** Ask the owning window for a full repaint (after an op). */
  requestRender(): void;
}

/** The Account pane's role=tabpanel element id. */
export const ACCOUNT_PANEL_ID = 'bank-panel-account';

/** The outer Account TAB's element id: BankWindow stamps it through the
 *  shared strip's `buttonId`. */
export const ACCOUNT_TAB_ID = 'bank-tab-account';

export class AccountBankTab {
  constructor(private readonly deps: AccountBankTabDeps) {}

  /** Build the account pane model from the live world. Exposed so BankWindow
   *  can branch on 'hidden' (tab fallback) without duplicating the core call. */
  model(): AccountBankViewModel {
    const world = this.deps.world();
    // knownItemDef, never a raw ITEMS index: a prototype key ('constructor',
    // '__proto__') indexes to a truthy Function, which would send an unknown
    // server item id down the KNOWN arm below (the guild/personal pane rule).
    return buildAccountBankView(world.accountBankInfo, (id) => knownItemDef(ITEMS, id));
  }

  /** Append the account pane sections (capacity, grid, buy row) to the window
   *  root. BankWindow has already painted the title + tab strip and captured
   *  the .bank-scroll offset it restores after this returns; it hands the
   *  model it already built for the tab-visibility branch (one core call per
   *  paint, never two). */
  renderInto(root: HTMLElement, model: AccountBankViewModel): void {
    if (model.kind === 'hidden') return; // raced null: BankWindow falls back next paint
    const el = document.createElement('div');
    el.id = ACCOUNT_PANEL_ID;
    el.className = 'abank-pane';
    el.setAttribute('role', 'tabpanel');
    el.setAttribute('aria-labelledby', ACCOUNT_TAB_ID);
    root.appendChild(el);
    const capacity = document.createElement('div');
    capacity.className = 'bank-capacity';
    const used = String(model.capacity.used);
    const total = String(model.capacity.total);
    capacity.textContent = t('hudChrome.bank.capacity', { used, total });
    el.appendChild(capacity);
    const scroll = document.createElement('div');
    scroll.className = 'bank-scroll';
    const grid = document.createElement('div');
    grid.className = 'bank-grid';
    this.fillGrid(grid, model);
    scroll.appendChild(grid);
    el.appendChild(scroll);
    el.appendChild(this.buildBuyRow(model.buy));
  }

  private cellDeps(): PersonalBankItemCellDeps {
    return {
      world: () => this.deps.world(),
      itemIcon: this.deps.itemIcon,
      itemTooltip: this.deps.itemTooltip,
      attachTooltip: (element, html) => this.deps.attachTooltip(element, html),
      consumePeek: () => this.deps.consumePeek(),
      hideTooltip: () => this.deps.hideTooltip(),
      onInventoryChanged: () => this.deps.onInventoryChanged(),
    };
  }

  private fillGrid(grid: HTMLElement, model: AccountBankViewModel & { kind: 'account' }): void {
    if (model.empty) {
      grid.innerHTML = `<div class="bank-empty">${esc(t('hudChrome.bank.accountEmpty'))}</div>`;
      return;
    }
    for (const slot of model.slots) {
      const countLabel = String(slot.count);
      const cell = buildPersonalBankItemCell(
        this.cellDeps(),
        slot,
        countLabel,
        (slotIndex, shift) => this.onSlotClick(slotIndex, shift),
        () => this.deps.requestRender(),
      );
      grid.appendChild(cell);
    }
    for (let i = 0; i < model.emptyCells; i++) {
      const cell = document.createElement('div');
      cell.className = 'bank-item ui-socket ui-socket--bag empty';
      cell.setAttribute('aria-hidden', 'true');
      grid.appendChild(cell);
    }
  }

  // Plain click withdraws the whole stack; shift-click on a splittable stack
  // opens the quantity prompt. The pure bankSlotAction (bank_view.ts, the
  // same decision the personal pane uses) reads the live slot.
  private onSlotClick(slotIndex: number, shift: boolean): void {
    const slot: InvSlot | undefined = this.deps.world().accountBankInfo?.slots[slotIndex];
    const action = bankSlotAction(slot, slotIndex, shift);
    if (action.kind === 'withdraw') {
      this.deps.world().accountBankWithdraw(action.slotIndex);
      audio.click();
      this.deps.hideTooltip();
      this.deps.onInventoryChanged();
      this.deps.requestRender();
    } else if (action.kind === 'withdrawPartial') {
      this.showWithdrawQuantityPrompt(action.slotIndex, action.max);
    }
  }

  private showWithdrawQuantityPrompt(slotIndex: number, maxCount: number): void {
    const slot: InvSlot | undefined = this.deps.world().accountBankInfo?.slots[slotIndex];
    if (!slot) return;
    const item = knownItemDef(ITEMS, slot.itemId);
    const itemName = bankSlotDisplayName(item, slot);
    showQuantityPrompt(
      {
        installPromptDialog: (prompt, opener, close) =>
          this.deps.installPromptDialog(prompt, opener, close),
        dismissSiblings: () => this.deps.dismissPrompts(),
      },
      {
        className: 'bank-quantity-prompt abank-quantity-prompt',
        titleText: t('hudChrome.bank.withdrawQuantityTitle', { item: itemName }),
        inputAriaText: t('hudChrome.bank.withdrawQuantityInput'),
        confirmText: t('hudChrome.bank.withdrawQuantityConfirm'),
        cancelText: t('itemUi.vendor.sellQuantityCancel'),
        maxCount,
        resolveCount: (requested) => {
          // Re-resolve the live slot; refuse on a mismatch (withdrawing the
          // wrong item is worse than a stale send).
          const live = this.deps.world().accountBankInfo?.slots[slotIndex];
          if (!live || live.itemId !== slot.itemId) return null;
          return Math.max(1, Math.min(maxCount, live.count, requested));
        },
        send: (count) => {
          this.deps.world().accountBankWithdraw(slotIndex, count);
          audio.click();
          this.deps.onInventoryChanged();
        },
        afterClose: () => {
          (this.deps.root().querySelector('[data-close]') as HTMLElement | null)?.focus();
        },
      },
    );
  }

  private buildBuyRow(buy: AccountBankBuySlotsModel): HTMLElement {
    const row = document.createElement('div');
    row.className = 'bank-buy-row abank-buy-row';
    if (buy.maxed || buy.nextPrice === null) {
      const maxed = document.createElement('span');
      maxed.className = 'bank-buy-maxed';
      maxed.textContent = t('hudChrome.bank.buySlotsMaxed');
      row.appendChild(maxed);
      return row;
    }
    const price = buy.nextPrice;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'bank-buy-btn ui-btn ui-btn--gold';
    btn.innerHTML =
      `<span class="bank-buy-label">${esc(t('hudChrome.bank.buySlots', { count: String(buy.blockSlots) }))}</span>` +
      this.deps.moneyHtml(price);
    btn.addEventListener('click', () => this.showBuySlotsPrompt(buy, price));
    row.appendChild(btn);
    return row;
  }

  private showBuySlotsPrompt(buy: AccountBankBuySlotsModel, price: number): void {
    showBuyConfirmPrompt(
      {
        installPromptDialog: (prompt, opener, close) =>
          this.deps.installPromptDialog(prompt, opener, close),
        dismissSiblings: () => this.deps.dismissPrompts(),
      },
      {
        className: 'abank-buy-prompt',
        text: t('hudChrome.bank.accountBuyConfirm', {
          count: String(buy.blockSlots),
          price: formatMoney(price),
        }),
        confirmLabel: t('hudChrome.bank.buyConfirmAccept'),
        cancelLabel: t('itemUi.vendor.sellQuantityCancel'),
        onConfirm: (dismiss) => {
          this.deps.world().accountBankBuySlots();
          audio.click();
          dismiss();
          this.deps.requestRender();
        },
      },
    );
  }
}
