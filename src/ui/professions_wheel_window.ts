// Thin DOM painter for the Professions Wheel window (issue #1302).
//
// The consumer half of the pure-core + thin-painter split: it paints
// #professions-wheel-window from the structured ProfessionsWheelView
// (professions_wheel_view.ts). It owns no state and no cross-window
// orchestration; Hud calls this on open and on any craftSkills/archetype
// change, same as renderCraftingWindow.

import type { MaterialRarity } from '../sim/professions/gathering';
import { esc } from './esc';
import { formatNumber, type TranslationKey, t } from './i18n';
import type { ProfessionsWheelView, WheelCraftVM } from './professions_wheel_view';
import { svgIcon } from './ui_icons';

export interface ProfessionsWheelWindowDeps {
  onClose(): void;
}

// The ten craft display-name keys (distinct from the practitioner titles in
// char_window.ts's ARCHETYPE_TITLE_KEYS): see hud_chrome.ts `wheel.<craftId>`.
const WHEEL_CRAFT_NAME_KEYS: Record<string, TranslationKey> = {
  armorcrafting: 'hudChrome.wheel.armorcrafting',
  weaponcrafting: 'hudChrome.wheel.weaponcrafting',
  jewelcrafting: 'hudChrome.wheel.jewelcrafting',
  alchemy: 'hudChrome.wheel.alchemy',
  engineering: 'hudChrome.wheel.engineering',
  cooking: 'hudChrome.wheel.cooking',
  inscription: 'hudChrome.wheel.inscription',
  enchanting: 'hudChrome.wheel.enchanting',
  tailoring: 'hudChrome.wheel.tailoring',
  leatherworking: 'hudChrome.wheel.leatherworking',
};

const WHEEL_TIER_NAME_KEYS: Record<MaterialRarity, TranslationKey> = {
  common: 'itemUi.quality.common',
  uncommon: 'itemUi.quality.uncommon',
  rare: 'itemUi.quality.rare',
  epic: 'itemUi.quality.epic',
  legendary: 'itemUi.quality.legendary',
};

function craftStateClass(craft: WheelCraftVM): string {
  if (craft.state === 'archetype') return 'wheel-craft-archetype';
  if (craft.state === 'hobby') return 'wheel-craft-hobby';
  return 'wheel-craft-dormant';
}

function craftStateLabel(craft: WheelCraftVM): string {
  if (craft.state === 'archetype') return t('hudChrome.wheel.archetypeLabel');
  if (craft.state === 'hobby') return t('hudChrome.wheel.hobbyLabel');
  return t('hudChrome.wheel.dormantLabel');
}

function renderPips(craft: WheelCraftVM): string {
  let pips = '';
  for (let i = 0; i < craft.pipsTotal; i++) {
    const filled = i < craft.pipsFilled;
    pips += `<span class="wheel-pip${filled ? ' wheel-pip-filled' : ''}"></span>`;
  }
  return pips;
}

/** Paint the professions wheel panel from a prepared view. */
export function renderProfessionsWheelWindow(
  el: HTMLElement,
  view: ProfessionsWheelView,
  deps: ProfessionsWheelWindowDeps,
): void {
  const scrollTop = el.scrollTop;
  el.innerHTML = `<div class="panel-title"><span>${esc(t('hudChrome.wheel.title'))}</span><button type="button" class="x-btn" data-close aria-label="${esc(t('hudChrome.wheel.close'))}">${svgIcon('close')}</button></div>`;

  if (view.archetypeCraft !== null && view.amendsRequired > 0) {
    const amends = document.createElement('div');
    amends.className = 'wheel-amends';
    amends.textContent = t('hudChrome.wheel.amends', {
      progress: formatNumber(view.amendsProgress, { maximumFractionDigits: 0 }),
      required: formatNumber(view.amendsRequired, { maximumFractionDigits: 0 }),
    });
    el.appendChild(amends);
  }

  const ring = document.createElement('div');
  ring.className = 'wheel-ring';
  for (const craft of view.crafts) {
    const cell = document.createElement('div');
    cell.className = `wheel-craft ${craftStateClass(craft)}`;
    const name = t(WHEEL_CRAFT_NAME_KEYS[craft.craftId] ?? 'hudChrome.wheel.title');
    const tierName = t(WHEEL_TIER_NAME_KEYS[craft.tierRarity]);
    cell.innerHTML = `<span class="wheel-craft-name">${esc(name)}</span><span class="wheel-craft-state">${esc(craftStateLabel(craft))}</span><span class="wheel-craft-tier">${esc(t('hudChrome.wheel.craftTier', { craft: name, tier: tierName }))}</span><span class="wheel-pips">${renderPips(craft)}</span>`;
    ring.appendChild(cell);
  }
  el.appendChild(ring);

  el.querySelector('[data-close]')?.addEventListener('click', () => deps.onClose());
  el.style.display = 'block';
  el.scrollTop = scrollTop;
}
