// The client half of Soul Keys and the Heroic Mark upgrade: the chat-line
// builders (src/ui/counter_service_lines.ts), the bag-menu release row
// (src/ui/bag_item_context_menu.ts), and the Heroic Quartermaster's upgrade
// section view (src/ui/hud/vendor/heroic_vendor_view.ts).
import { describe, expect, it } from 'vitest';
import { heroicVariantId } from '../src/sim/content/heroic_variants';
import { HEROIC_VENDOR_STOCK } from '../src/sim/content/heroic_vendor';
import { ITEMS } from '../src/sim/data';
import { HEROIC_UPGRADE_MARKS } from '../src/sim/instances/heroic_upgrade';
import { SOUL_KEY_ITEM_ID, SOUL_KEY_USES_PER_WEEK } from '../src/sim/soul_key';
import {
  bagItemContextActions,
  bagItemNewActions,
  holdsSoulKey,
} from '../src/ui/bag_item_context_menu';
import {
  heroicUpgradeResultLine,
  soulKeyResultLine,
  unbindResultLine,
} from '../src/ui/counter_service_lines';
import { buildHeroicVendorView } from '../src/ui/hud/vendor/heroic_vendor_view';
import { t } from '../src/ui/i18n';

const HELM = 'slagbreaker_helmet';

describe("unbindResultLine (the Maker's Bond copy, moved out of hud.ts)", () => {
  it('names the item from static content and formats the fee locally on ok', () => {
    const line = unbindResultLine({ type: 'unbindResult', ok: true, itemId: HELM, fee: 12345 });
    expect(line?.text).toContain('Slagbreaker Helm');
    expect(line?.text).toContain('1');
    expect(line?.text).toContain(
      t('hudChrome.unbind.unbound', { name: 'Slagbreaker Helm', fee: '' }).slice(0, 8),
    );
  });

  it('pairs each deny reason with ITS OWN key and renders nothing for the silent arm', () => {
    const pairs = [
      ['unbind_not_eligible', 'hudChrome.unbind.notEligible'],
      ['unbind_not_bound', 'hudChrome.unbind.notBound'],
      ['unbind_cannot_afford', 'hudChrome.unbind.cannotAfford'],
      ['unbind_no_space', 'hudChrome.unbind.noSpace'],
      ['unbind_out_of_range', 'hudChrome.unbind.outOfRange'],
    ] as const;
    for (const [reason, key] of pairs) {
      const line = unbindResultLine({
        type: 'unbindResult',
        ok: false,
        itemId: HELM,
        reason,
        fee: 0,
      });
      expect(line?.text, reason).toBe(t(key));
      expect(line?.color, reason).toBe('#ff6b6b');
    }
    expect(unbindResultLine({ type: 'unbindResult', ok: false, itemId: 'x', fee: 0 })).toBeNull();
  });
});

describe('soulKeyResultLine', () => {
  it('reports the release with the uses left, and each deny with its own key', () => {
    const ok = soulKeyResultLine({ type: 'soulKeyResult', ok: true, itemId: HELM, usesLeft: 1 });
    expect(ok?.text).toBe(
      t('hudChrome.soulKey.released', {
        name: 'Slagbreaker Helm',
        left: '1',
        cap: String(SOUL_KEY_USES_PER_WEEK),
      }),
    );
    const pairs = [
      ['soul_key_not_eligible', 'hudChrome.soulKey.notEligible'],
      ['soul_key_not_bound', 'hudChrome.soulKey.notBound'],
      ['soul_key_none_held', 'hudChrome.soulKey.noneHeld'],
      ['soul_key_weekly_cap', 'hudChrome.soulKey.weeklyCap'],
    ] as const;
    for (const [reason, key] of pairs) {
      const line = soulKeyResultLine({
        type: 'soulKeyResult',
        ok: false,
        itemId: HELM,
        reason,
        usesLeft: 0,
      });
      expect(line?.text, reason).toBe(t(key));
    }
    expect(
      soulKeyResultLine({ type: 'soulKeyResult', ok: false, itemId: HELM, usesLeft: 0 }),
    ).toBeNull();
  });
});

describe('heroicUpgradeResultLine', () => {
  it('names the forged item on ok and the marks price on the shortfall deny', () => {
    const ok = heroicUpgradeResultLine({
      type: 'heroicUpgradeResult',
      ok: true,
      itemId: HELM,
      heroicItemId: heroicVariantId(HELM),
      marks: HEROIC_UPGRADE_MARKS,
    });
    expect(ok?.text).toBe(t('heroicShop.upgraded', { item: 'Slagbreaker Helm' }));
    const short = heroicUpgradeResultLine({
      type: 'heroicUpgradeResult',
      ok: false,
      itemId: HELM,
      reason: 'heroic_upgrade_not_enough_marks',
      marks: HEROIC_UPGRADE_MARKS,
    });
    expect(short?.text).toBe(
      t('heroicShop.upgradeNotEnoughMarks', { marks: String(HEROIC_UPGRADE_MARKS) }),
    );
    const far = heroicUpgradeResultLine({
      type: 'heroicUpgradeResult',
      ok: false,
      itemId: HELM,
      reason: 'heroic_upgrade_out_of_range',
      marks: HEROIC_UPGRADE_MARKS,
    });
    expect(far?.text).toBe(t('heroicShop.upgradeOutOfRange'));
    const no = heroicUpgradeResultLine({
      type: 'heroicUpgradeResult',
      ok: false,
      itemId: 'worn_sword',
      reason: 'heroic_upgrade_not_eligible',
      marks: HEROIC_UPGRADE_MARKS,
    });
    expect(no?.text).toBe(t('heroicShop.upgradeNotEligible'));
  });
});

describe('the bag-menu release row', () => {
  it('appears only with a key held, on bound paperdoll gear, before the lock row', () => {
    const helm = ITEMS[HELM];
    expect(bagItemNewActions(helm, HELM, undefined, false)).not.toContain('soulKey');
    // An epic tier piece also disenchants and salvages; the release row sits
    // after the profession rows and before the lock toggle.
    const withKey = bagItemNewActions(helm, HELM, undefined, true);
    expect(withKey.slice(-2)).toEqual(['soulKey', 'lock']);
    expect(withKey).toEqual([
      ...bagItemNewActions(helm, HELM, undefined, false).slice(0, -1),
      'soulKey',
      'lock',
    ]);
    expect(bagItemNewActions(helm, HELM, { unbound: true }, true)).not.toContain('soulKey');
    expect(bagItemNewActions(ITEMS.heroic_mark, 'heroic_mark', undefined, true)).not.toContain(
      'soulKey',
    );
    expect(bagItemNewActions(ITEMS.worn_sword, 'worn_sword', undefined, true)).not.toContain(
      'soulKey',
    );
    const rows = bagItemContextActions(helm, HELM, undefined, true);
    expect(rows[0].id).toBe('default');
    const release = rows.find((r) => r.id === 'soulKey');
    expect(release?.labelKey).toBe('hudChrome.soulKey.menuAction');
  });

  it('holdsSoulKey reads the bags', () => {
    expect(holdsSoulKey([])).toBe(false);
    expect(holdsSoulKey([{ itemId: SOUL_KEY_ITEM_ID, count: 0 }])).toBe(false);
    expect(
      holdsSoulKey([
        { itemId: HELM, count: 1 },
        { itemId: SOUL_KEY_ITEM_ID, count: 2 },
      ]),
    ).toBe(true);
  });
});

describe('the Heroic Quartermaster upgrade section view', () => {
  it('lists every bagged tier piece by slot with the flat marks price', () => {
    const view = buildHeroicVendorView(HEROIC_VENDOR_STOCK, ITEMS, HEROIC_UPGRADE_MARKS, [
      { itemId: 'worn_sword', count: 1 },
      { itemId: HELM, count: 1 },
      { itemId: heroicVariantId(HELM), count: 1 },
      { itemId: 'slagbreaker_legs', count: 1 },
      { itemId: 'no_such_item', count: 1 },
    ]);
    expect(view.upgrades.map((u) => [u.itemId, u.slotIndex, u.heroicItemId])).toEqual([
      [HELM, 1, heroicVariantId(HELM)],
      ['slagbreaker_legs', 3, heroicVariantId('slagbreaker_legs')],
    ]);
    expect(view.upgrades.every((u) => u.marks === HEROIC_UPGRADE_MARKS && u.affordable)).toBe(true);
    const broke = buildHeroicVendorView(HEROIC_VENDOR_STOCK, ITEMS, HEROIC_UPGRADE_MARKS - 1, [
      { itemId: HELM, count: 1 },
    ]);
    expect(broke.upgrades[0].affordable).toBe(false);
    expect(buildHeroicVendorView(HEROIC_VENDOR_STOCK, ITEMS, 0).upgrades).toEqual([]);
  });
});
