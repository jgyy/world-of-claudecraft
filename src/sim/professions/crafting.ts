// Common-tier crafting resolution (issue #1127). Behind the SimContext seam:
// checks a player has every reagent a recipe requires, consumes them (denying
// and consuming NOTHING if any reagent is short), rolls the output's quality
// via the shared material-rarity ladder (rollMaterialRarity, keyed on the
// player's craft skill for this recipe's craft rather than gathering
// proficiency: same ladder, different "power" input, exactly the reuse the
// gathering.ts comment on that function invites), grants the resulting item,
// and grants a flat point of craft skill (see wheel.ts: additive-only,
// free-floor).
//
// Scope: COMMON TIER ONLY (skillReq 0 on every recipe in content/recipes.ts).
// Higher-tier gating, the wheel, and archetype-exclusive combos are later
// issues; this module resolves exactly the common-tier path end to end.
//
// Combo-recipe requirement (issue #1132): a recipe may carry a
// `comboRequirement` naming one specific adjacent craft pair and a minimum
// tier both must meet. `hasComboRequirement` checks the player's tier
// capability in BOTH named crafts (via wheel.ts tierCapability), independent
// of the recipe's `professionId`. Only the two named crafts ever count: a
// player's skill in any other craft, however high, never substitutes for
// either half of the pair.
//
// This module is `src/sim`-pure (see src/sim/CLAUDE.md): no DOM/render/ui/
// game/net imports, no Math.random/Date.now, host-agnostic so it runs
// offline, on the server, and in the headless RL env unchanged.

import { recipeById } from '../content/recipes';
import type { SimContext } from '../sim_context';
import { type MaterialRarity, rollMaterialRarity } from './gathering';
import type { ProfessionRecipeRecord } from './types';
import {
  type CraftSkills,
  gainCraftSkill,
  tierCapability,
  tierForSkill,
  tierProgressMultiplier,
} from './wheel';

// One flat craft-skill point per successful common-tier craft (the free-floor
// rule: common-tier crafting itself never costs anything, but skill still
// accrues so later tiers have something to build a gate against).
const CRAFT_SKILL_GAIN = 1;

export interface CraftResult {
  ok: boolean;
  recipeId: string;
  // Present only when ok: the granted item id/count and the rolled quality.
  itemId?: string;
  count?: number;
  quality?: MaterialRarity;
  // Present only when !ok: a stable reason code, not player-facing prose (the
  // caller renders/localizes the denial).
  reason?: 'unknown_recipe' | 'insufficient_materials' | 'combo_requirement_unmet';
}

/** Whether the given player currently holds every reagent a recipe requires,
 *  in the required quantities. Read-only: never mutates inventory. */
export function hasRecipeMaterials(
  ctx: SimContext,
  recipe: ProfessionRecipeRecord,
  pid: number,
): boolean {
  return recipe.reagents.every((r) => ctx.countItem(r.itemId, pid) >= r.count);
}

/** Whether the given player's craft skills satisfy a recipe's dual-craft
 *  combo requirement (issue #1132): true if the recipe carries no
 *  `comboRequirement` at all, otherwise true only when the player's tier
 *  capability (wheel.ts tierCapability) in BOTH named crafts is at or above
 *  `minTier`. Deliberately does not fall back to any other craft: a high
 *  skill in a craft outside the required pair never satisfies this check. */
export function meetsComboRequirement(
  skills: CraftSkills,
  recipe: ProfessionRecipeRecord,
): boolean {
  const combo = recipe.comboRequirement;
  if (!combo) return true;
  return (
    tierCapability(skills, combo.craftA) >= combo.minTier &&
    tierCapability(skills, combo.craftB) >= combo.minTier
  );
}

/** Pure resolution of one craft attempt against an already-resolved recipe
 *  record and player entity id (issue #1128 tiered mastery gating; issue
 *  #1132 combo-recipe gating): denies (no side effect at all) if any reagent
 *  is short OR the recipe's `comboRequirement` (if any) is unmet, partial
 *  consumption never happens. On success, consumes every reagent, rolls the
 *  output's quality off the player's current skill in the recipe's craft,
 *  grants the output item, and grants craft skill scaled by tier mastery:
 *  full at or above the player's tier capability (including always-full for
 *  the common tier, regardless of capability), reduced one tier below, zero
 *  two or more tiers below. Exported separately from `resolveCraft` so tests
 *  can exercise the tier curve against a synthetic recipe without needing
 *  higher-tier content in `content/recipes.ts`. */
export function resolveCraftForRecipe(
  ctx: SimContext,
  pid: number,
  recipe: ProfessionRecipeRecord,
): CraftResult {
  const meta = ctx.players.get(pid);
  if (recipe.comboRequirement && !meetsComboRequirement(meta ? meta.craftSkills : {}, recipe)) {
    return { ok: false, recipeId: recipe.id, reason: 'combo_requirement_unmet' };
  }
  if (!hasRecipeMaterials(ctx, recipe, pid)) {
    return { ok: false, recipeId: recipe.id, reason: 'insufficient_materials' };
  }
  for (const reagent of recipe.reagents) {
    ctx.removeItem(reagent.itemId, reagent.count, pid);
  }
  const skill = meta ? (meta.craftSkills[recipe.professionId] ?? 0) : 0;
  const quality = rollMaterialRarity(skill, ctx.rng);
  ctx.addItem(recipe.resultItemId, recipe.resultCount, pid);
  if (meta) {
    const capabilityTier = tierCapability(meta.craftSkills, recipe.professionId);
    const recipeTier = tierForSkill(recipe.skillReq);
    const multiplier = tierProgressMultiplier(capabilityTier, recipeTier);
    gainCraftSkill(meta.craftSkills, recipe.professionId, CRAFT_SKILL_GAIN * multiplier);
  }
  return {
    ok: true,
    recipeId: recipe.id,
    itemId: recipe.resultItemId,
    count: recipe.resultCount,
    quality,
  };
}

/** Pure resolution of one craft attempt against one recipe id, given an
 *  already-resolved player entity id: denies with `unknown_recipe` if the id
 *  does not resolve, otherwise delegates to `resolveCraftForRecipe`. */
export function resolveCraft(ctx: SimContext, pid: number, recipeId: string): CraftResult {
  const recipe = recipeById(recipeId);
  if (!recipe) return { ok: false, recipeId, reason: 'unknown_recipe' };
  return resolveCraftForRecipe(ctx, pid, recipe);
}

// Command entry point (behind the SimContext seam): resolves one player's
// craft attempt, resolving the caller's own player entity the same way every
// other immediate-interaction command does (ctx.resolve), and surfaces a
// denial as a player-facing error toast. Runs on the deterministic tick the
// wire command arrives on, never off-tick.
export function craftItem(ctx: SimContext, recipeId: string, pid?: number): CraftResult {
  const r = ctx.resolve(pid);
  if (!r) return { ok: false, recipeId, reason: 'unknown_recipe' };
  const result = resolveCraft(ctx, r.meta.entityId, recipeId);
  if (!result.ok) {
    ctx.error(
      r.meta.entityId,
      result.reason === 'unknown_recipe'
        ? 'That recipe does not exist.'
        : result.reason === 'combo_requirement_unmet'
          ? 'You do not have both required crafts at the required tier for that recipe.'
          : 'You do not have the materials for that.',
    );
  }
  return result;
}
