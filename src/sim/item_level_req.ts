// The level a character must reach before a gear piece can be equipped.
//
// Classic-era MMOs gate higher-tier gear behind a required level so a low-level
// character cannot equip a lucky drop (or a twink hand-up) far above their own
// level. This repo has no per-item "item level", so the requirement is DERIVED
// from the one tier signal every item already carries: `quality`. This mirrors
// the existing derive-don't-store approach in `armorTypeForItem` (equipment_rules.ts),
// which infers armor class from `requiredClass` rather than storing it.
//
// An item may still pin an explicit `requiredLevel` to override the per-quality
// default. The bands are capped at MAX_LEVEL so the highest-quality gear stays
// reachable at the level cap (a band above the cap would be unequippable forever).
//
// Pure leaf: no DOM/Three/render-ui-game-net imports, no rng/clock. Imported by
// the sim equip path (src/sim/items.ts) AND the HUD item tooltip, so it stays
// host-agnostic and is unit-tested directly.

import { MAX_LEVEL } from './types';
import type { ItemDef } from './types';

type Quality = NonNullable<ItemDef['quality']>;

// Per-quality required level. Poor/common gear (the starter kit) is ungated;
// each rarity step above raises the bar, topping out at the level cap for the
// rarest pieces. Tune the feature HERE, not at the equip site.
const QUALITY_REQUIRED_LEVEL: Record<Quality, number> = {
  poor: 1,
  common: 1,
  uncommon: 5,
  rare: 12,
  epic: 18,
  legendary: MAX_LEVEL,
};

// The minimum character level required to equip `item`. An explicit
// `requiredLevel` wins; otherwise derive from quality (default `common` when an
// item declares no quality). Always clamped to [1, MAX_LEVEL].
export function requiredLevelFor(item: ItemDef): number {
  const raw = item.requiredLevel ?? QUALITY_REQUIRED_LEVEL[item.quality ?? 'common'];
  return Math.max(1, Math.min(MAX_LEVEL, Math.floor(raw)));
}

// Whether a character of `level` meets `item`'s level requirement.
export function meetsLevelRequirement(level: number, item: ItemDef): boolean {
  return level >= requiredLevelFor(item);
}
