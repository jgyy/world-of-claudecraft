// The Honing card on the character sheet's Progression tab (virtual levels as
// an enchanting resource, src/sim/progression/honing.ts): a pure IWorld ->
// model -> html builder on the character_progression_view pattern, so every
// affordance (the unspent pool, the worn-slot pick, the stat pick, the next
// rank's cost and chance, the button's enabled state) is decided in Node
// without a DOM. The thin controller (honing_sheet_controller.ts) owns the
// select and button listeners and the one command send.
import { ITEMS } from '../sim/data';
import { type HoningInfo, honingInfoFrom, honingRankOf } from '../sim/progression/honing';
import {
  HONING_FAIL_RESETS,
  HONING_STATS,
  type HoningStat,
  unspentVirtualLevels,
} from '../sim/progression/honing_policy';
import { ALL_EQUIP_SLOTS, type EquipSlot, MAX_LEVEL } from '../sim/types';
import type { IWorld } from '../world_api';
import { itemDisplayName } from './entity_i18n';
import { esc } from './esc';
import { formatMoney, formatNumber, type TranslationKey, t, tPlural } from './i18n';

/** The player's current picks, owned by the character window across repaints
 *  (the sheet rebuilds its innerHTML on every render). A missing slot means
 *  "the first worn slot". */
export interface HoningPick {
  slot?: EquipSlot;
  stat: HoningStat;
}

export interface HoningSheetSlot {
  slot: EquipSlot;
  itemId: string;
  name: string;
  rank: number;
}

export interface HoningSheetModel {
  atCap: boolean;
  unspent: number;
  copper: number;
  slots: HoningSheetSlot[];
  picked: EquipSlot | null;
  stat: HoningStat;
  info: HoningInfo | null;
  /** Both the pool and the purse cover the next rank, and the copy is not maxed. */
  canHone: boolean;
}

const STAT_LABEL_KEYS: Record<HoningStat, TranslationKey> = {
  str: 'itemUi.stats.str',
  agi: 'itemUi.stats.agi',
  sta: 'itemUi.stats.sta',
  int: 'itemUi.stats.int',
  spi: 'itemUi.stats.spi',
};

export function buildHoningSheetModel(world: IWorld, pick: HoningPick): HoningSheetModel {
  const slots: HoningSheetSlot[] = [];
  for (const slot of ALL_EQUIP_SLOTS) {
    const itemId = world.equipment[slot];
    const def = itemId ? ITEMS[itemId] : undefined;
    if (!itemId || !def) continue;
    slots.push({
      slot,
      itemId,
      name: itemDisplayName(def),
      rank: honingRankOf(world.equipmentInstances[slot]),
    });
  }
  const picked =
    slots.find((s) => s.slot === pick.slot)?.slot ?? (slots.length > 0 ? slots[0].slot : null);
  const info =
    picked === null
      ? null
      : honingInfoFrom(
          { equipment: world.equipment, equipmentInstances: world.equipmentInstances },
          picked,
        );
  const atCap = world.player.level >= MAX_LEVEL;
  const unspent = unspentVirtualLevels(world.lifetimeXp, world.virtualLevelsSpent);
  const copper = world.copper;
  const canHone =
    atCap &&
    info !== null &&
    !info.maxed &&
    unspent >= info.cost.levels &&
    copper >= info.cost.copper;
  return { atCap, unspent, copper, slots, picked, stat: pick.stat, info, canHone };
}

const whole = (value: number): string => formatNumber(value, { maximumFractionDigits: 0 });

function slotOptionLabel(s: HoningSheetSlot): string {
  return s.rank > 0 ? `${s.name} (${t('game.honing.rank', { rank: whole(s.rank) })})` : s.name;
}

export function honingSheetHtml(model: HoningSheetModel): string {
  let html = `<div class="cp-milestones cp-honing ui-card"><div class="cp-title">${esc(t('game.honing.title'))}</div>`;
  html += `<div><span class="cp-ms-label">${esc(t('game.honing.unspent'))}:</span> <b class="cp-honing-pool">${whole(model.unspent)}</b></div>`;
  if (!model.atCap) {
    html += `<span class="cp-hint">${esc(t('game.honing.needCap'))}</span></div>`;
    return html;
  }
  const slotOptions =
    model.slots.length === 0
      ? `<option value="">${esc(t('game.honing.nothingWorn'))}</option>`
      : model.slots
          .map(
            (s) =>
              `<option value="${esc(s.slot)}"${s.slot === model.picked ? ' selected' : ''}>${esc(slotOptionLabel(s))}</option>`,
          )
          .join('');
  const statOptions = HONING_STATS.map(
    (stat) =>
      `<option value="${stat}"${stat === model.stat ? ' selected' : ''}>${esc(t(STAT_LABEL_KEYS[stat]))}</option>`,
  ).join('');
  html += `<div class="cp-honing-row"><label>${esc(t('game.honing.item'))} <select class="hud-select" data-act="hone-slot" data-honing="slot"${model.slots.length === 0 ? ' disabled' : ''}>${slotOptions}</select></label>`;
  html += `<label>${esc(t('game.honing.stat'))} <select class="hud-select" data-act="hone-stat" data-honing="stat">${statOptions}</select></label></div>`;
  if (model.info) {
    const rankLine = model.info.maxed
      ? `<b class="cp-honing-rank">${esc(t('game.honing.maxed'))}</b>`
      : `<span class="cp-hint">${esc(t('game.honing.cost'))}: ${esc(tPlural('hudChrome.plurals.honingLevels', model.info.cost.levels, { count: whole(model.info.cost.levels) }))}, ${formatMoney(model.info.cost.copper)}</span>` +
        `<span class="cp-hint">${esc(t('game.honing.chance'))}: ${formatNumber(model.info.chance, { style: 'percent', maximumFractionDigits: 0 })}</span>`;
    html += `<div class="cp-actions cp-honing-row">${rankLine}<button type="button" class="ui-btn ui-btn--gold" data-act="hone"${model.canHone ? '' : ' disabled'}>${esc(t('game.honing.action'))}</button></div>`;
  }
  html += `<span class="cp-hint">${esc(t('game.honing.hint'))}${HONING_FAIL_RESETS ? ` ${esc(t('game.honing.hintReset'))}` : ''}</span></div>`;
  return html;
}
