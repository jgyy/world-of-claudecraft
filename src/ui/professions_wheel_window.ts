// Thin DOM painter for the Professions Wheel window (issue #1302).
//
// The consumer half of the pure-core + thin-painter split: it paints
// #professions-wheel-window from the structured ProfessionsWheelView
// (professions_wheel_view.ts). It owns no state and no cross-window
// orchestration; Hud calls this on open and on any craftSkills/archetype
// change, same as renderCraftingWindow.
//
// Drawn as a literal wheel (an SVG circle, dashed spokes, and one dot per
// craft), not a card grid: a plain circle in a 0-100 viewBox so the whole
// wheel scales with its container for free, dashed spokes from the center
// hub to each dot, a filled dot for any craft the player has touched
// (skill > 0) versus a hollow ring for one never touched, and the
// archetype/hobby dots picked out in their own colors. Labels sit beside
// each dot, flowing away from the circle (right of dots on the right half,
// left of dots on the left half, centered above/below at the top/bottom
// poles) so text never crosses the rim.

import type { MaterialRarity } from '../sim/professions/gathering';
import { esc } from './esc';
import { formatNumber, type TranslationKey, t } from './i18n';
import type { PainterHostPresentation } from './painter_host';
import type { ProfessionsWheelView, WheelCraftVM } from './professions_wheel_view';
import { svgIcon } from './ui_icons';

export interface ProfessionsWheelWindowDeps extends PainterHostPresentation {
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

function craftName(craftId: string | null): string {
  if (craftId === null) return t('hudChrome.archetypeTitle.none');
  return t(WHEEL_CRAFT_NAME_KEYS[craftId] ?? 'hudChrome.wheel.title');
}

const WHEEL_TIER_NAME_KEYS: Record<MaterialRarity, TranslationKey> = {
  common: 'itemUi.quality.common',
  uncommon: 'itemUi.quality.uncommon',
  rare: 'itemUi.quality.rare',
  epic: 'itemUi.quality.epic',
  legendary: 'itemUi.quality.legendary',
};

const SVG_NS = 'http://www.w3.org/2000/svg';
const CENTER = 50;
const RIM_RADIUS = 38;
const LABEL_RADIUS = 44;
const DOT_RADIUS = 2.4;

function pointOnCircle(angleDeg: number, radius: number): { x: number; y: number } {
  const rad = (angleDeg * Math.PI) / 180;
  return { x: CENTER + radius * Math.sin(rad), y: CENTER - radius * Math.cos(rad) };
}

function svgEl<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number>,
): SVGElementTagNameMap[K] {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [key, value] of Object.entries(attrs)) el.setAttribute(key, String(value));
  return el;
}

function craftDotClass(craft: WheelCraftVM): string {
  if (craft.state === 'archetype') return 'wheel-dot-archetype';
  if (craft.state === 'hobby') return 'wheel-dot-hobby';
  return craft.skill > 0 ? 'wheel-dot-touched' : 'wheel-dot-untouched';
}

function craftLabelClass(craft: WheelCraftVM): string {
  return craft.state !== 'dormant' || craft.skill > 0
    ? 'wheel-label-touched'
    : 'wheel-label-untouched';
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

  // -16 margin on every side: the window's overflow-y: auto clips overflow-x
  // too (a plain CSS rule once only one axis is non-visible), so the labels'
  // text glyphs need room INSIDE the svg's own coordinate space rather than
  // relying on the parent to let them bleed past the nominal 0-100 box.
  const svg = svgEl('svg', { viewBox: '-16 -16 132 132', class: 'wheel-svg' });
  svg.appendChild(svgEl('circle', { cx: CENTER, cy: CENTER, r: RIM_RADIUS, class: 'wheel-rim' }));

  for (const craft of view.crafts) {
    const rim = pointOnCircle(craft.angleDeg, RIM_RADIUS);
    const spoke = svgEl('line', {
      x1: CENTER,
      y1: CENTER,
      x2: rim.x,
      y2: rim.y,
      class: 'wheel-spoke-line',
    });
    svg.appendChild(spoke);
  }

  for (const craft of view.crafts) {
    const rim = pointOnCircle(craft.angleDeg, RIM_RADIUS);
    const dot = svgEl('circle', {
      cx: rim.x,
      cy: rim.y,
      r: DOT_RADIUS,
      class: `wheel-dot ${craftDotClass(craft)}`,
    });
    dot.setAttribute('tabindex', '-1');
    // attachTooltip is typed for HTMLElement (its wiring is addEventListener +
    // getBoundingClientRect, both plain Element/EventTarget members an SVG
    // element supports identically at runtime): safe to widen here rather
    // than duplicate the whole hover/tooltip wiring for one SVG circle.
    deps.attachTooltip(dot as unknown as HTMLElement, () => {
      const name = craftName(craft.craftId);
      const tierName = t(WHEEL_TIER_NAME_KEYS[craft.tierRarity]);
      return `<div class="tt-title">${esc(name)}</div><div class="tt-sub">${esc(t('hudChrome.wheel.craftTier', { craft: name, tier: tierName }))}</div>`;
    });
    svg.appendChild(dot);

    const normalized = ((craft.angleDeg % 360) + 360) % 360;
    const label = pointOnCircle(craft.angleDeg, LABEL_RADIUS);
    let anchor = 'middle';
    let dy = 0;
    if (normalized === 0) dy = -2.5;
    else if (normalized === 180) dy = 3.2;
    else if (normalized < 180) anchor = 'start';
    else anchor = 'end';
    const text = svgEl('text', {
      x: label.x,
      y: label.y,
      'text-anchor': anchor,
      'dominant-baseline': 'middle',
      dy,
      class: `wheel-label ${craftLabelClass(craft)}`,
    });
    text.textContent = craftName(craft.craftId);
    svg.appendChild(text);
  }
  ring.appendChild(svg);

  // The center hub sits ON TOP of the svg (a plain HTML overlay, easier to
  // localize/reflow than SVG text): the one summary that doesn't belong to
  // any single spoke.
  const hub = document.createElement('div');
  hub.className = 'wheel-hub';
  hub.innerHTML = `<span class="wheel-hub-label">${esc(t('hudChrome.wheel.archetypeLabel'))}</span><span class="wheel-hub-value">${esc(craftName(view.archetypeCraft))}</span><span class="wheel-hub-label">${esc(t('hudChrome.wheel.hobbyLabel'))}</span><span class="wheel-hub-value">${esc(craftName(view.hobbyCraft))}</span>`;
  ring.appendChild(hub);

  el.appendChild(ring);

  el.querySelector('[data-close]')?.addEventListener('click', () => deps.onClose());
  el.style.display = 'block';
  el.scrollTop = scrollTop;
}
