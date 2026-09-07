// The chat lines for the counter-service result events: the Maker's Bond
// unbind (unbindResult), the Soul Key release (soulKeyResult), and the Heroic
// Mark tier upgrade (heroicUpgradeResult). Each event is personal and
// text-free (the sim never emits English); the item name resolves through
// entity i18n and every number formats locally, identical in both worlds.
// ONE chat line either way (the trainResult single-surface rule: no toast, no
// extra sound cue); a reason-less deny is the malformed-id probe arm, nothing
// legible to render, so it returns null.
//
// DOM-free (registered in tests/architecture.test.ts UI_PURE_CORES): the HUD
// only logs what comes back.

import { ITEMS } from '../sim/data';
import { HEROIC_UPGRADE_MARKS } from '../sim/instances/heroic_upgrade';
import { SOUL_KEY_USES_PER_WEEK } from '../sim/soul_key';
import type { SimEvent } from '../sim/types';
import { itemDisplayName } from './entity_i18n';
import { formatMoney, formatNumber, t } from './i18n';

export interface ServiceChatLine {
  text: string;
  color: string;
}

const OK_COLOR = '#7fdc4f';
const DENY_COLOR = '#ff6b6b';

function itemName(itemId: string): string {
  const def = ITEMS[itemId];
  return def ? itemDisplayName(def) : itemId;
}

const count = (n: number): string => formatNumber(n, { maximumFractionDigits: 0 });

export function unbindResultLine(
  ev: Extract<SimEvent, { type: 'unbindResult' }>,
): ServiceChatLine | null {
  if (ev.ok) {
    return {
      text: t('hudChrome.unbind.unbound', {
        name: itemName(ev.itemId),
        fee: formatMoney(ev.fee),
      }),
      color: OK_COLOR,
    };
  }
  if (!ev.reason) return null;
  const key =
    ev.reason === 'unbind_not_eligible'
      ? 'hudChrome.unbind.notEligible'
      : ev.reason === 'unbind_not_bound'
        ? 'hudChrome.unbind.notBound'
        : ev.reason === 'unbind_cannot_afford'
          ? 'hudChrome.unbind.cannotAfford'
          : ev.reason === 'unbind_no_space'
            ? 'hudChrome.unbind.noSpace'
            : 'hudChrome.unbind.outOfRange';
  return { text: t(key), color: DENY_COLOR };
}

export function soulKeyResultLine(
  ev: Extract<SimEvent, { type: 'soulKeyResult' }>,
): ServiceChatLine | null {
  if (ev.ok) {
    return {
      text: t('hudChrome.soulKey.released', {
        name: itemName(ev.itemId),
        left: count(ev.usesLeft),
        cap: count(SOUL_KEY_USES_PER_WEEK),
      }),
      color: OK_COLOR,
    };
  }
  if (!ev.reason) return null;
  const key =
    ev.reason === 'soul_key_not_eligible'
      ? 'hudChrome.soulKey.notEligible'
      : ev.reason === 'soul_key_not_bound'
        ? 'hudChrome.soulKey.notBound'
        : ev.reason === 'soul_key_none_held'
          ? 'hudChrome.soulKey.noneHeld'
          : 'hudChrome.soulKey.weeklyCap';
  return { text: t(key), color: DENY_COLOR };
}

export function heroicUpgradeResultLine(
  ev: Extract<SimEvent, { type: 'heroicUpgradeResult' }>,
): ServiceChatLine | null {
  if (ev.ok) {
    return { text: t('heroicShop.upgraded', { item: itemName(ev.itemId) }), color: OK_COLOR };
  }
  if (!ev.reason) return null;
  if (ev.reason === 'heroic_upgrade_not_enough_marks') {
    return {
      text: t('heroicShop.upgradeNotEnoughMarks', { marks: count(HEROIC_UPGRADE_MARKS) }),
      color: DENY_COLOR,
    };
  }
  return {
    text: t(
      ev.reason === 'heroic_upgrade_out_of_range'
        ? 'heroicShop.upgradeOutOfRange'
        : 'heroicShop.upgradeNotEligible',
    ),
    color: DENY_COLOR,
  };
}
