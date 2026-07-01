// Minimal recipe-crafting resolution (#1134). #1127 (the general crafting
// action / `resolveCraft`) has not landed on any branch this stacks on (see
// the P3 reconciliation note above `TOOL_RECIPE_STUBS` in
// content/professions.ts): there is no live recipe table or crafting entry
// point to hang the material-cost discount off of. Rather than leave the
// discount unimplemented pending an unrelated PR, this module is the
// MINIMAL viable slice of what #1127's `resolveCraft` needs to exist: a
// pure function that consumes materials for a `CraftRecipe`, discounted by
// the crafter's specialization (wheel.ts) in that recipe's craft. It is
// intentionally small and host-agnostic (no SimContext, no Sim state) so it
// slots straight into whatever #1127 lands with; once it does, this module's
// discount logic should MOVE (not be copied) into the real `resolveCraft`.

import { craftById } from '../content/professions';
import { type CraftSkillState, materialCostMultiplier } from './wheel';

export interface CraftIngredient {
  itemId: string;
  qty: number;
}

export interface CraftRecipe {
  /** Which craft on CRAFT_RING this recipe belongs to. */
  craftId: string;
  ingredients: CraftIngredient[];
  outputItemId: string;
}

/**
 * The materials this recipe actually costs `crafterSkills` to make, after
 * the specialization discount (#1134): each ingredient's quantity is
 * multiplied by `materialCostMultiplier`, then floored, with a minimum of 1
 * (a discount can never make a recipe free of an ingredient it needs at
 * least one of). Documented rounding rule: floor, min 1, applied
 * independently per ingredient.
 */
export function discountedIngredients(
  recipe: CraftRecipe,
  crafterSkills: CraftSkillState,
): CraftIngredient[] {
  const multiplier = materialCostMultiplier(crafterSkills, recipe.craftId);
  return recipe.ingredients.map((ingredient) => ({
    itemId: ingredient.itemId,
    qty: Math.max(1, Math.floor(ingredient.qty * multiplier)),
  }));
}

export interface CraftResult {
  success: boolean;
  /** The (possibly discounted) ingredient quantities actually consumed. */
  consumed: CraftIngredient[];
}

/**
 * Pure: attempts to craft `recipe` given `materialsAvailable` (itemId ->
 * quantity on hand). On success returns the discounted ingredients that
 * were consumed; on failure (insufficient materials for at least one
 * discounted ingredient) returns the ingredients that WOULD be consumed,
 * with `success: false`, and consumes nothing. The caller owns actually
 * deducting `consumed` from inventory and granting `recipe.outputItemId`,
 * same division of responsibility as `rechargeEffect` in tools.ts.
 */
export function resolveCraft(
  recipe: CraftRecipe,
  crafterSkills: CraftSkillState,
  materialsAvailable: Record<string, number>,
): CraftResult {
  // Throws on an unknown craft id, same as the rest of the wheel content.
  craftById(recipe.craftId);
  const consumed = discountedIngredients(recipe, crafterSkills);
  const success = consumed.every(
    (ingredient) => (materialsAvailable[ingredient.itemId] ?? 0) >= ingredient.qty,
  );
  return { success, consumed };
}
