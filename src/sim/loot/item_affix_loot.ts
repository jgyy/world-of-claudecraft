// Apply the affix roll once, after a source has finished selecting its
// ordinary drops: the loot/enemy_quality.ts pattern, for `affixable` shells
// instead of the permanent-quality tier. Never call this from pickup/award:
// an ordinary copy intentionally rolls once, at the moment it drops.
import { ITEMS } from '../data';
import { rollItemAffixInstance } from '../item_affix_roll';
import type { Rng } from '../rng';
import { cloneItemInstancePayload, type Entity, type LootSlot } from '../types';
import { isEligibleEnemyQualitySource } from './enemy_quality';

/** Roll an affix onto every eligible slot in `slots` (an `affixable` item def,
 *  no existing affix on the copy, not one of the caller's `excluded` slots),
 *  splitting any stack into one draw per copy exactly like
 *  loot/enemy_quality.ts's `rollEnemyLootQuality`. Reuses that module's
 *  wild-kill source gate: an owned/dummy/dev-spawned kill mints no affix,
 *  same as it mints no quality tier. */
export function rollItemAffixes(
  rng: Rng,
  mob: Entity,
  slots: LootSlot[],
  excluded: ReadonlySet<LootSlot> = new Set(),
): LootSlot[] {
  if (!isEligibleEnemyQualitySource(mob)) return slots;
  return slots.flatMap((slot) => {
    const item = ITEMS[slot.itemId];
    if (excluded.has(slot) || slot.instance?.affixId || !item?.affixable) return [slot];
    return Array.from({ length: slot.count }, () => {
      const roll = rollItemAffixInstance(rng, item);
      const instance = slot.instance ? cloneItemInstancePayload(slot.instance) : undefined;
      const base = {
        ...slot,
        count: 1,
        ...(slot.personalFor ? { personalFor: [...slot.personalFor] } : {}),
      };
      if (!roll) return instance ? { ...base, instance } : base;
      return {
        ...base,
        instance: {
          ...instance,
          affixId: roll.affixId,
          rolled: {
            ...instance?.rolled,
            ...(roll.quality ? { quality: roll.quality } : {}),
            stats: roll.stats,
          },
        },
      };
    });
  });
}
