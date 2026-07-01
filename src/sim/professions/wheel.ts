// Specialization-perk eligibility reads over the ten-craft wheel (#1134).
// This module is a pure leaf, like tools.ts/threat.ts/spatial.ts: no
// SimContext state, just comparisons over a `CraftSkillState` the caller owns
// and passes in.
//
// P5's live wheel state (a per-player skill record tracked by Sim, per
// #1128's `tierForSkill`/`tierCapability`) is not present on this branch: it
// is stacked directly on #1137 (effect recharge), which itself stacks on
// #1135/#1136 (tool tiers/effects), none of which carry a player skill
// record. Rather than invent one inline here (which would drift from
// whatever #1128 actually lands with), this module takes a plain
// `CraftSkillState` record as an explicit parameter, the same "caller owns
// the state" shape `ToolEffectSlot` already established in tools.ts. Once
// P5's wheel state lands on `Sim`/`PlayerMeta`, its call sites plug straight
// into these functions with zero change to this module.

import { craftById, PERK_THRESHOLDS, type PerkThresholdDef } from '../content/professions';

/**
 * A player's skill (0 to 100) in each craft on the wheel, keyed by craft id
 * (see `CRAFT_RING` in content/professions.ts). A craft absent from the
 * record is treated as skill 0, same as a fresh, never-trained craft.
 */
export type CraftSkillState = Partial<Record<string, number>>;

/** The player's skill in `craftId`, defaulting to 0 when untracked. */
export function skillInCraft(skills: CraftSkillState, craftId: string): number {
  return skills[craftId] ?? 0;
}

function thresholdFor(craftId: string): PerkThresholdDef {
  // Throws on an unknown craft id, same as craftById/adjacentCrafts above:
  // every craft on CRAFT_RING has a PERK_THRESHOLDS entry (see content).
  craftById(craftId);
  const threshold = PERK_THRESHOLDS[craftId];
  if (!threshold) {
    throw new Error(`no perk threshold registered for craft id: ${craftId}`);
  }
  return threshold;
}

/**
 * True only when the player's skill in `craftId` has reached that craft's
 * specialization threshold (read from content, never hardcoded here). This
 * is the single eligibility gate every perk in this issue reads: the
 * material-cost discount (crafting.ts), the additional recharge discount
 * (tools.ts), and the mobile crafting station (mobile_station.ts).
 */
export function isSpecialized(skills: CraftSkillState, craftId: string): boolean {
  return skillInCraft(skills, craftId) >= thresholdFor(craftId).specializedSkillThreshold;
}

/**
 * The multiplier to apply to a recipe's material quantities when crafted in
 * `craftId`: 1 (no discount) when not specialized, or
 * `1 - materialDiscountPct` once specialized. Never negative or zero-clamped
 * here; `crafting.ts` owns rounding and the floor-at-1 rule when it applies
 * this to an actual integer quantity.
 */
export function materialCostMultiplier(skills: CraftSkillState, craftId: string): number {
  if (!isSpecialized(skills, craftId)) return 1;
  return 1 - thresholdFor(craftId).materialDiscountPct;
}

/**
 * The ADDITIONAL multiplier (#1134) an original crafter's recharge discount
 * composes with when that crafter is also specialized in `craftId`: 1 (no
 * additional discount) when not specialized, or `1 - rechargeDiscountPct`
 * once specialized. `tools.ts` multiplies this into its existing
 * original-crafter discount rather than replacing it, so a specialized
 * recharger always pays strictly less than a merely-original one.
 */
export function rechargeDiscountMultiplier(skills: CraftSkillState, craftId: string): number {
  if (!isSpecialized(skills, craftId)) return 1;
  return 1 - thresholdFor(craftId).rechargeDiscountPct;
}
