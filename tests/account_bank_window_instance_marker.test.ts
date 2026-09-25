// @vitest-environment happy-dom
//
// Account bank grid instanced-slot markers (the ALL-SURFACES item-mark family,
// src/ui/CLAUDE.md): a banked masterwork must keep the authored seal, and
// every other per-copy kind (enchanted / signed / bound / generic) must paint
// the same corner mark bags and the personal/guild banks use. The account
// bank grid reuses personal_bank_item_cell.ts VERBATIM (no bespoke cell), so
// this suite pins that the account tab actually wires the shared builder
// rather than trusting bank_window_instance_marker.test.ts's coverage of the
// same function from a different caller.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { InvSlot, ItemInstancePayload } from '../src/sim/types';
import { AccountBankTab, type AccountBankTabDeps } from '../src/ui/account_bank_window';
import type { AccountBankInfo, IWorld } from '../src/world_api';

function accountBankInfo(slots: InvSlot[], capacity = 12): AccountBankInfo {
  return { slots, capacity, purchasedSlots: 0, nextExpansionPrice: 20000 };
}

interface HarnessWorld {
  accountBankInfo: AccountBankInfo | null;
  inventory: InvSlot[];
  accountBankDeposit(): void;
  accountBankWithdraw(): void;
  accountBankBuySlots(): void;
}

function paneFor(slots: InvSlot[]): HTMLElement {
  const world: HarnessWorld = {
    accountBankInfo: accountBankInfo(slots),
    inventory: [],
    accountBankDeposit: () => {},
    accountBankWithdraw: () => {},
    accountBankBuySlots: () => {},
  };
  const root = document.createElement('div');
  document.body.appendChild(root);
  const noop = (): void => {};
  const deps: AccountBankTabDeps = {
    itemIcon: () => '<span class="item-icon"></span>',
    moneyHtml: () => '',
    itemTooltip: () => '',
    attachTooltip: noop,
    root: () => root,
    world: () => world as unknown as IWorld,
    hideTooltip: noop,
    consumePeek: () => false,
    onInventoryChanged: noop,
    installPromptDialog: () => ({ dismiss: noop, dismissAndReturn: noop }),
    dismissPrompts: noop,
    requestRender: noop,
  };
  const tab = new AccountBankTab(deps);
  tab.renderInto(root, tab.model());
  return root;
}

function slot(itemId: string, instance?: ItemInstancePayload, count = 1): InvSlot {
  return instance ? { itemId, count, instance } : { itemId, count };
}

describe('account bank grid instanced-slot marker', () => {
  it('a masterwork uses the authored seal and announces masterwork', () => {
    const root = paneFor([
      slot('worn_sword', { signer: 'Anna', rolled: { masterwork: true, stats: { sta: 1 } } }),
      slot('worn_sword'),
    ]);
    const cells = root.querySelectorAll('button.bank-item');
    expect(cells.length).toBe(2);
    const seal = cells[0].querySelector<HTMLImageElement>('.bi-masterwork-seal');
    expect(seal?.getAttribute('src')).toBe('/ui/professions/masterwork_seal.webp');
    expect(cells[0].getAttribute('aria-label')).toBe('Pitted Shortsword, quantity 1, masterwork');
    expect(cells[1].querySelector('.bi-masterwork-seal')).toBeNull();
  });

  it('each kind paints its own distinct glyph, exactly one per cell', () => {
    const root = paneFor([
      slot('copper_ore', { enchant: 'enchant_chest_stamina' }),
      slot('copper_ore', { signer: 'Anna' }),
      slot('copper_ore', { bindOnTrade: true }),
    ]);
    const cells = root.querySelectorAll('button.bank-item');
    expect(cells.length).toBe(3);
    expect(cells[0].querySelector('.bi-glyph-enchanted')).not.toBeNull();
    expect(cells[1].querySelector('.bi-glyph-signed')).not.toBeNull();
    expect(cells[2].querySelector('.bi-glyph-bound')).not.toBeNull();
    for (const cell of cells) {
      const markers = cell.querySelectorAll('.bi-glyph, .bi-instance, .bi-masterwork-seal');
      expect(markers.length).toBe(1);
    }
  });

  it('a banked fine material wears the rim class and the fine corner seal', () => {
    const root = paneFor([slot('fine_copper_ore', undefined, 3), slot('copper_ore', undefined, 3)]);
    const cells = root.querySelectorAll('button.bank-item');
    expect(cells[0].classList.contains('bag-fine')).toBe(true);
    expect(cells[0].querySelector('.bi-fine-seal')).not.toBeNull();
    expect(cells[1].classList.contains('bag-fine')).toBe(false);
  });

  it('an unknown-id instanced slot keeps the mark and the UNKNOWN aria wording', () => {
    const root = paneFor([
      slot('not_a_real_item_id', { rolled: { masterwork: true, stats: { sta: 1 } } }),
    ]);
    const cell = root.querySelector('button.bank-item');
    expect(cell?.querySelector('.bi-masterwork-seal')).not.toBeNull();
    expect(cell?.getAttribute('aria-label')).toBe(
      'Unknown item not_a_real_item_id, quantity 1, masterwork',
    );
  });

  it('a plain counted stack keeps the count badge and no marker', () => {
    const root = paneFor([slot('copper_ore', undefined, 5)]);
    const cell = root.querySelector('button.bank-item');
    expect(cell?.querySelector('.bank-count')?.textContent).toContain('5');
    expect(cell?.querySelector('.bi-instance')).toBeNull();
    expect(cell?.querySelector('.bi-glyph')).toBeNull();
    expect(cell?.querySelector('.bi-masterwork-seal')).toBeNull();
  });
});

describe('account bank pane wires the shared item-cell builder, not a bespoke copy', () => {
  it('imports buildPersonalBankItemCell from the one family module', () => {
    const painter = readFileSync(join(__dirname, '../src/ui/account_bank_window.ts'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/[^\n]*/g, '');
    expect(painter).toContain("from './personal_bank_item_cell'");
    expect(painter).toContain('buildPersonalBankItemCell(');
  });
});
