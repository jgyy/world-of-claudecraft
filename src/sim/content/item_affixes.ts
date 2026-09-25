// Content: green ("uncommon") and blue ("rare") item affixes for the loot-time
// affix roll on `affixable` item shells (src/sim/item_affix_roll.ts prices
// these; loot/item_affix_loot.ts draws the roll). An affixable def is a
// stat-free shell (the same "static def carries no stats, the copy carries
// the numbers" split rift/band_ladder.ts uses for Riftbound bands): every
// stat point a copy carries comes from the ItemAffixStatRoll ranges below.
//
// Magnitudes are sized off item_budget.ts's primaryStatBudget curve for a
// representative item level 20 two-handed mainhand shell (the level a first
// affixable weapon is expected to ship at):
//   primaryStatBudget(20, 'uncommon', 'mainhand', TWOHAND_STAT_MULT)
//     = round(20 * 0.55 * 1.3 * 0.7) = 10 points, which every green affix's
//     stat ranges average to exactly (a major/minor 60/40 split, e.g. 6 + 4).
//   primaryStatBudget(20, 'rare', 'mainhand', TWOHAND_STAT_MULT)
//     = round(20 * 0.8 * 1.3 * 0.7) = 15 points, which every blue affix's
//     three-stat ranges average to exactly (a 7/4/4 split), the strictly
//     better tier the design thread's "blue affixes are stronger" calls for.
// Re-derive these ranges (or add a level-scoped pool) before flagging a def
// at a materially different item level.
//
// Per the design thread's own scoping (Discord #feature-requests "Affix
// system"), this ships greens and blues only: an epic tier was explicitly
// flagged as needing separate curation to avoid an affix roll "jumping" an
// item past its item-level peers, so it is left for a follow-up change. This
// change ships the engine (this table, item_affix_roll.ts, the loot wiring,
// and the tooltip/name rendering) with `affixable` unset on every shipped
// item: minting the first affixable item is a follow-up content change,
// since a new equippable item needs its own committed icon art and
// ITEM_WEAPON_VARIANTS/ITEM_IMAGE_IDS wiring (src/sim/content/CLAUDE.md),
// which is unrelated to the roll mechanics this change adds.
import type { CoreStats } from '../types';

export type ItemAffixPrimaryStat = keyof Pick<CoreStats, 'str' | 'agi' | 'sta'>;

export interface ItemAffixStatRoll {
  stat: ItemAffixPrimaryStat;
  min: number;
  max: number;
}

export interface ItemAffixDef {
  id: string;
  tier: 'uncommon' | 'rare';
  /** i18n key under itemUi.affixSuffix.* (src/ui/i18n.catalog/items.ts),
   *  appended to the base item's own display name by
   *  src/ui/item_affix_name.ts. Plain string, not `TranslationKey`: src/sim
   *  never imports from src/ui (see src/CLAUDE.md dependency direction). */
  nameKey: string;
  stats: readonly ItemAffixStatRoll[];
}

/** Chance an affix roll draws from the blue pool instead of the green one
 *  (item_affix_roll.ts). A blue roll also stamps the copy's
 *  `rolled.quality` to 'rare', upgrading its effective quality above the
 *  shell's own def-level 'uncommon'. */
export const ITEM_AFFIX_BLUE_CHANCE = 0.15;

export const ITEM_AFFIXES_GREEN: readonly ItemAffixDef[] = [
  {
    id: 'green_bear',
    tier: 'uncommon',
    nameKey: 'itemUi.affixSuffix.bear',
    stats: [
      { stat: 'str', min: 5, max: 7 },
      { stat: 'sta', min: 3, max: 5 },
    ],
  },
  {
    id: 'green_wolf',
    tier: 'uncommon',
    nameKey: 'itemUi.affixSuffix.wolf',
    stats: [
      { stat: 'agi', min: 5, max: 7 },
      { stat: 'str', min: 3, max: 5 },
    ],
  },
  {
    id: 'green_ox',
    tier: 'uncommon',
    nameKey: 'itemUi.affixSuffix.ox',
    stats: [
      { stat: 'sta', min: 5, max: 7 },
      { stat: 'str', min: 3, max: 5 },
    ],
  },
];

export const ITEM_AFFIXES_BLUE: readonly ItemAffixDef[] = [
  {
    id: 'blue_warlord',
    tier: 'rare',
    nameKey: 'itemUi.affixSuffix.warlord',
    stats: [
      { stat: 'str', min: 6, max: 8 },
      { stat: 'agi', min: 3, max: 5 },
      { stat: 'sta', min: 3, max: 5 },
    ],
  },
  {
    id: 'blue_predator',
    tier: 'rare',
    nameKey: 'itemUi.affixSuffix.predator',
    stats: [
      { stat: 'agi', min: 6, max: 8 },
      { stat: 'str', min: 3, max: 5 },
      { stat: 'sta', min: 3, max: 5 },
    ],
  },
];

/** Every affix, keyed by id, for the display-name and tooltip lookups
 *  (src/ui/item_affix_name.ts reads this rather than re-deriving the pools). */
export const ITEM_AFFIXES: Readonly<Record<string, ItemAffixDef>> = Object.fromEntries(
  [...ITEM_AFFIXES_GREEN, ...ITEM_AFFIXES_BLUE].map((affix) => [affix.id, affix]),
);
