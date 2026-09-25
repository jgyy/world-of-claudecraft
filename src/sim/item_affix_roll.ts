// The affix roll for an `affixable` item shell (types.ts BaseItemDef.affixable):
// picks a tier (green/blue), picks one affix from that tier's pool, and rolls
// each of its stats to a concrete integer. Pure leaf, like rift/band_ladder.ts:
// no SimContext, no clock; every draw comes from the `Rng` passed in, so a
// caller controls draw order and this stays a plain Vitest import.
//
// Draw order (exactly two `Rng` draws per roll, both unconditional so a
// replay's draw count never depends on which affix or magnitude comes out):
//   1. rng.chance(ITEM_AFFIX_BLUE_CHANCE) picks the tier.
//   2. rng.int(0, pool.length - 1) picks the affix within that tier's pool.
//   3. rng.int(min, max) once per stat the affix carries (order: array order).
// Callers that draw this inside a shared rng stream (loot/item_affix_loot.ts)
// must only call it for a def with `affixable` true, so ordinary loot draws
// zero extra rng and existing parity traces are untouched.
import {
  ITEM_AFFIX_BLUE_CHANCE,
  ITEM_AFFIXES_BLUE,
  ITEM_AFFIXES_GREEN,
} from './content/item_affixes';
import type { Rng } from './rng';
import type { ItemDef } from './types';

export interface ItemAffixRoll {
  affixId: string;
  /** Set only for a blue-tier roll: the copy's effective quality upgrades
   *  above the shell's own def-level 'uncommon'. */
  quality?: 'rare';
  stats: Record<string, number>;
}

/** Roll one affix instance for `item`. Returns undefined for a non-affixable
 *  def (no rng drawn). */
export function rollItemAffixInstance(rng: Rng, item: ItemDef): ItemAffixRoll | undefined {
  if (!item.affixable) return undefined;
  const blue = rng.chance(ITEM_AFFIX_BLUE_CHANCE);
  const pool = blue ? ITEM_AFFIXES_BLUE : ITEM_AFFIXES_GREEN;
  const affix = pool[rng.int(0, pool.length - 1)];
  const stats: Record<string, number> = {};
  for (const roll of affix.stats) {
    stats[roll.stat] = (stats[roll.stat] ?? 0) + rng.int(roll.min, roll.max);
  }
  return { affixId: affix.id, ...(blue ? { quality: 'rare' as const } : {}), stats };
}
