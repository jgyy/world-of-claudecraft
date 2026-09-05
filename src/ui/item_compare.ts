// Pure item-comparison helper (no DOM), so the stat-delta math can be unit
// tested directly the way xp_bar.ts / player_context_menu.ts are. The HUD turns
// these deltas into coloured tooltip lines; see Hud.itemCompareBlock.
import type { CoreStats, ItemDef, ItemInstancePayload } from '../sim/types';

// Stable stat identifier; the HUD maps it to a localized label via t().
export type CompareStat =
  | 'dps'
  | 'armor'
  | 'str'
  | 'agi'
  | 'sta'
  | 'int'
  | 'spi'
  | 'warfare'
  | 'hitRating'
  | 'critRating'
  | 'hasteRating'
  | 'spellPower'
  | 'healPower';

export interface StatDelta {
  stat: CompareStat;
  delta: number; // candidate minus equipped; positive = upgrade
  decimals: number; // formatting precision (weapon DPS is fractional)
}

function weaponDps(w: ItemDef['weapon']): number {
  return w ? (w.min + w.max) / 2 / w.speed : 0;
}

// The stats a copy can carry on top of its definition (rolled.stats keys):
// weapon dps and the WARFARE pair are definition-only and read elsewhere.
type CopyStat = Exclude<CompareStat, 'dps' | 'warfare'>;

// A stat as the wearer would feel it: the definition's line plus whatever the
// specific copy carries in rolled.stats (an enchant, a masterwork bake, or a
// Riftbound band's whole ladder-priced line: its shell is stat-free, so without
// the copy a band would compare as an empty ring).
function effectiveStat(
  def: ItemDef,
  instance: ItemInstancePayload | undefined,
  key: CopyStat,
): number {
  const bonus = instance?.rolled?.stats?.[key] ?? 0;
  const base =
    key === 'armor' ||
    key === 'str' ||
    key === 'agi' ||
    key === 'sta' ||
    key === 'int' ||
    key === 'spi'
      ? (def.stats?.[key] ?? 0)
      : (def[key] ?? 0);
  return base + bonus;
}

// Ordered, human-readable stat lines. Only changes worth showing are returned:
// integer stats need a full point of difference, DPS a tenth, so a same-for-
// same swap yields an empty list (the HUD then shows no "If you equip" section).
// The optional instances are the hovered copy and the worn copy; a plain piece
// passes none and reads exactly as its definition.
export function itemStatDeltas(
  item: ItemDef,
  equipped: ItemDef,
  itemInstance?: ItemInstancePayload,
  equippedInstance?: ItemInstancePayload,
): StatDelta[] {
  const out: StatDelta[] = [];
  const dpsDelta = weaponDps(item.weapon) - weaponDps(equipped.weapon);
  if (Math.abs(dpsDelta) >= 0.05) out.push({ stat: 'dps', delta: dpsDelta, decimals: 1 });

  const stats: Array<keyof CoreStats & CompareStat> = ['armor', 'str', 'agi', 'sta', 'int', 'spi'];
  for (const k of stats) {
    const delta =
      effectiveStat(item, itemInstance, k) - effectiveStat(equipped, equippedInstance, k);
    if (Math.abs(delta) >= 0.5) out.push({ stat: k, delta, decimals: 0 });
  }

  const warfareRating = (def: ItemDef): number =>
    Math.min(def.pvpOffenseRating ?? 0, def.pvpDefenseRating ?? 0);
  const warfareDelta = warfareRating(item) - warfareRating(equipped);
  if (Math.abs(warfareDelta) >= 0.5) {
    out.push({ stat: 'warfare', delta: warfareDelta, decimals: 0 });
  }

  // Affixes and combat ratings, in the base item tooltip's order. The Crucible
  // tier authored Spell Power and Healing Power onto items, so both now earn
  // compare rows (the old "no content item carries it" carve-out is retired).
  const affixes = ['spellPower', 'healPower'] as const;
  for (const k of affixes) {
    const delta =
      effectiveStat(item, itemInstance, k) - effectiveStat(equipped, equippedInstance, k);
    if (Math.abs(delta) >= 0.5) out.push({ stat: k, delta, decimals: 0 });
  }
  const ratings = ['hitRating', 'critRating', 'hasteRating'] as const;
  for (const k of ratings) {
    const delta =
      effectiveStat(item, itemInstance, k) - effectiveStat(equipped, equippedInstance, k);
    if (Math.abs(delta) >= 0.5) out.push({ stat: k, delta, decimals: 0 });
  }
  return out;
}
