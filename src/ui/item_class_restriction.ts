// Pure resolver: the item tooltip's explicit "Requires: <classes>" line. Classic
// MMO tooltips always name the eligible classes for a class-restricted item; the
// armor weight badge (Cloth/Leather/Mail, see item_armor_type.ts) and the weapon
// proficiency archetype (see equipment_rules.ts weaponArchetypeForItem) are both
// USED for equip-legality math, but neither of them actually states which classes
// can use the item, so they must never suppress this line. Bug #1893: a rogue/
// hunter-only dagger (Fang of Korzul) or a warrior/paladin/shaman mail chest
// (Deathlord Warplate) resolves to a known archetype/armor-weight group, and a
// prior version of the tooltip hid the class list whenever that happened, leaving
// a blocked player with no in-game explanation at all.
import type { ItemDef, PlayerClass } from '../sim/types';

// Returns the classes that can use the item, or null when the item carries no
// class restriction (nothing to show).
export function requiredClassesForTooltip(item: ItemDef): readonly PlayerClass[] | null {
  return item.requiredClass && item.requiredClass.length > 0 ? item.requiredClass : null;
}
