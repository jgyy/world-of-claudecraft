// @vitest-environment happy-dom
// The Crucible Quartermaster window painter: the sigil-balance line must
// compose through the crucibleShop.balanceEntry catalog key plus formatList
// (Intl.ListFormat), never a hardcoded `${name} x${count}` + join(', ')
// (review finding on the Ignivar base merge). The pure view core is covered
// by tests/crucible_vendor.test.ts; this suite drives the real painter.
import { afterEach, describe, expect, it } from 'vitest';
import { ITEMS } from '../src/sim/data';
import type { ItemDef } from '../src/sim/types';
import type {
  CrucibleShopView,
  CrucibleSigilBalance,
  CrucibleSigilTradeRow,
} from '../src/ui/hud/vendor/crucible_vendor_view';
import {
  type CrucibleVendorWindowDeps,
  renderCrucibleVendorWindow,
} from '../src/ui/hud/vendor/crucible_vendor_window';
import { ensureLocaleLoaded, setLanguage } from '../src/ui/i18n';

function deps(): CrucibleVendorWindowDeps {
  return {
    itemIcon: () => '<img>',
    moneyHtml: (copper: number) => `${copper}c`,
    itemTooltip: () => '<div></div>',
    attachTooltip: () => {},
    hideTooltip: () => {},
    onBuy: () => {},
    onTrade: () => {},
    onClose: () => {},
  };
}

function balance(sigilId: string, count: number): CrucibleSigilBalance {
  const sigil = ITEMS[sigilId] as ItemDef | undefined;
  if (!sigil) throw new Error(`unknown sigil id in fixture: ${sigilId}`);
  return { sigilId, sigil, count };
}

function trade(fromSigilId: string, toSigilId: string): CrucibleSigilTradeRow {
  const fromSigil = ITEMS[fromSigilId] as ItemDef | undefined;
  const toSigil = ITEMS[toSigilId] as ItemDef | undefined;
  if (!fromSigil || !toSigil) throw new Error('unknown sigil id in fixture');
  return { fromSigilId, fromSigil, toSigilId, toSigil };
}

function paint(
  balances: CrucibleSigilBalance[],
  trades: CrucibleSigilTradeRow[] = [],
  depsOverride?: Partial<CrucibleVendorWindowDeps>,
): HTMLElement {
  const view: CrucibleShopView = { rows: [], balances, trades };
  const el = document.createElement('div');
  renderCrucibleVendorWindow(el, 'Quartermaster', view, { ...deps(), ...depsOverride });
  return el;
}

// The balance div is appended first, ahead of the goods grid / empty line
// (which shares the class), so the first match is always the balance slot.
const balanceLine = (el: HTMLElement): string =>
  el.querySelector('.vendor-section-title')?.textContent ?? '';

afterEach(() => setLanguage('en'));

describe('renderCrucibleVendorWindow: the sigil balance line', () => {
  it('composes each entry through the catalog key and joins two entries with the en conjunction', () => {
    const el = paint([balance('sigil_anvil_helmet', 2), balance('sigil_anvil_gloves', 1)]);
    // {name} x{count} from crucibleShop.balanceEntry, and Intl.ListFormat's
    // two-item English conjunction (no comma), never a hardcoded ', ' join.
    expect(balanceLine(el)).toBe(
      'Your sigils: Helm Sigil of the Anvil x2 and Grip Sigil of the Anvil x1',
    );
  });

  it('joins three entries with the en Oxford-comma list (formatList, not join)', () => {
    const el = paint([
      balance('sigil_anvil_helmet', 2),
      balance('sigil_anvil_gloves', 1),
      balance('sigil_anvil_chest', 3),
    ]);
    expect(balanceLine(el)).toBe(
      'Your sigils: Helm Sigil of the Anvil x2, Grip Sigil of the Anvil x1, and Robe Sigil of the Anvil x3',
    );
  });

  it('renders the explicit none line when no sigils are held', () => {
    expect(balanceLine(paint([]))).toBe('You hold no Crucible sigils.');
  });

  it('honors a non-English locale: ja wrapper, ja list punctuation, localized names (ja_JP)', async () => {
    // LOADED, not merely selected: setLanguage alone leaves t() on the
    // English fallback for a lazy locale (the bank_bonus_view idiom).
    await ensureLocaleLoaded('ja_JP');
    setLanguage('ja_JP');
    const el = paint([balance('sigil_anvil_helmet', 2), balance('sigil_anvil_gloves', 1)]);
    const line = balanceLine(el);
    // The wrapper is the ja overlay fill of crucibleShop.balance.
    expect(line.startsWith('所持している印章: ')).toBe(true);
    // The join is ja's Intl.ListFormat separator, never the hardcoded ', '.
    // (crucibleShop.balanceEntry itself is pending in ja at PR tier, so the
    // entry pattern is deliberately NOT pinned here: the maintainer's release
    // fill may reorder count and name, and both orders must stay green.)
    expect(line).toContain('、');
    expect(line).not.toContain(', ');
    // Each entry resolves the localized sigil name and its count through the
    // entry key's placeholders (the ja names are overlay fills).
    expect(line).toContain('金床の兜の印章');
    expect(line).toContain('金床の篭手の印章');
    expect(line).toContain('2');
    expect(line).toContain('1');
  });
});

describe('renderCrucibleVendorWindow: Trade Sigils section', () => {
  it('renders nothing when there are no eligible trades', () => {
    const el = paint([], []);
    expect(el.textContent).not.toContain('Trade Sigils');
    expect(el.querySelectorAll('button.vendor-item').length).toBe(0);
  });

  it('renders one row per trade, priced in the source sigil, and reports the click', () => {
    let clicked: [string, string] | null = null;
    const el = paint(
      [balance('sigil_anvil_helmet', 1)],
      [trade('sigil_anvil_helmet', 'sigil_anvil_chest')],
      { onTrade: (from, to) => (clicked = [from, to]) },
    );
    expect(el.textContent).toContain('Trade Sigils');
    const rows = [...el.querySelectorAll<HTMLButtonElement>('button.vendor-item')];
    expect(rows).toHaveLength(1);
    const row = rows[0];
    expect(row.disabled).toBe(false);
    expect(row.querySelector('.vi-name')?.textContent).toBe('Robe Sigil of the Anvil');
    expect(row.querySelector('.vi-price')?.textContent).toBe('1 Helm Sigil of the Anvil');
    expect(row.getAttribute('aria-label')).toBe(
      'Trade Helm Sigil of the Anvil for Robe Sigil of the Anvil',
    );
    row.click();
    expect(clicked).toEqual(['sigil_anvil_helmet', 'sigil_anvil_chest']);
  });
});
