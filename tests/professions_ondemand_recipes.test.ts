// Coverage for the disenchant epic-reagent economy's on-demand recipes
// (ON_DEMAND_RECIPES, src/sim/content/recipes.ts): each is craftable end to
// end from its typed reagent plus normal materials, denies without the
// reagent, requires the skillReq-75 trainer tier, and grants a
// tradesRemaining:1 instance of the new epic-tier output.

import { describe, expect, it } from 'vitest';
import { ON_DEMAND_RECIPES, recipeById } from '../src/sim/content/recipes';
import { ITEMS } from '../src/sim/data';
import { resolveCraftForRecipe } from '../src/sim/professions/crafting';
import { stationsOfType } from '../src/sim/professions/stations';
import { TIER_SKILL_STEP } from '../src/sim/professions/wheel';
import { Sim } from '../src/sim/sim';

function makeSim(seed = 101) {
  return new Sim({ seed, playerClass: 'warrior', autoEquip: false });
}

function grantItem(sim: Sim, itemId: string, count: number, pid: number) {
  for (let i = 0; i < count; i++) sim.addItem(itemId, 1, pid);
}

function grantReagents(sim: Sim, recipe: (typeof ON_DEMAND_RECIPES)[number], pid: number) {
  for (const r of recipe.reagents) grantItem(sim, r.itemId, r.count, pid);
}

function placeAtStation(sim: Sim, pid: number, stationType: string) {
  const station = stationsOfType(stationType as never)[0];
  // biome-ignore lint/suspicious/noExplicitAny: test-only reach into private entity state
  const entity = (sim as any).entities.get(pid);
  entity.pos.x = station.pos.x;
  entity.pos.z = station.pos.z;
  entity.prevPos = { ...entity.pos };
}

function knowRecipe(sim: Sim, pid: number, recipeId: string) {
  // biome-ignore lint/suspicious/noExplicitAny: test-only reach into private player state
  (sim as any).players.get(pid).knownRecipes.add(recipeId);
}

describe('on-demand recipes (disenchant epic-reagent economy)', () => {
  it('defines exactly one recipe per typed reagent, all at the 75-skill trainer tier', () => {
    expect(ON_DEMAND_RECIPES.length).toBe(5);
    for (const recipe of ON_DEMAND_RECIPES) {
      expect(recipe.skillReq).toBe(75);
      expect(recipe.acquisition).toEqual(['trainer']);
      expect(recipe.stationType).toBeDefined();
      expect(recipe.tradesRemaining).toBe(1);
      // The typed reagent is always the first, count-1 reagent.
      const [typedReagent] = recipe.reagents;
      expect(typedReagent.itemId.startsWith('arcane_bound_')).toBe(true);
      expect(typedReagent.count).toBe(1);
    }
  });

  it.each(ON_DEMAND_RECIPES.map((r) => r.id))(
    'crafts %s end to end from its typed reagent, granting a tradesRemaining:1 epic instance',
    (recipeId) => {
      const recipe = recipeById(recipeId);
      if (!recipe) throw new Error(`missing recipe ${recipeId}`);
      const sim = makeSim();
      const pid = sim.playerId;
      knowRecipe(sim, pid, recipeId);
      grantReagents(sim, recipe as (typeof ON_DEMAND_RECIPES)[number], pid);
      const meta = sim.ctx.players.get(pid);
      if (meta) meta.craftSkills[recipe.professionId] = 75;
      placeAtStation(sim, pid, recipe.stationType as string);

      const outcome = resolveCraftForRecipe(sim.ctx, pid, recipe);
      expect(outcome.ok).toBe(true);

      const slot = sim.ctx.players
        .get(pid)
        ?.inventory.find((s) => s.itemId === recipe.resultItemId);
      expect(slot).toBeDefined();
      expect(slot?.instance?.tradesRemaining).toBe(1);

      const outputDef = ITEMS[recipe.resultItemId];
      expect(outputDef?.quality).toBe('epic');

      // Every typed reagent was consumed (count-1 in the reagents list).
      expect(sim.countItem(recipe.reagents[0].itemId, pid)).toBe(0);
    },
  );

  it('denies the craft when the typed reagent is missing (all other materials present)', () => {
    const recipe = ON_DEMAND_RECIPES[0];
    const sim = makeSim();
    const pid = sim.playerId;
    knowRecipe(sim, pid, recipe.id);
    // Grant every reagent EXCEPT the typed one.
    for (const r of recipe.reagents.slice(1)) grantItem(sim, r.itemId, r.count, pid);
    const meta = sim.ctx.players.get(pid);
    if (meta) meta.craftSkills[recipe.professionId] = 75;
    placeAtStation(sim, pid, recipe.stationType as string);

    const outcome = resolveCraftForRecipe(sim.ctx, pid, recipe);
    expect(outcome.ok).toBe(false);
    expect(outcome.reason).toBe('insufficient_materials');
  });

  it('denies the craft off-station even with every material and the recipe known', () => {
    const recipe = ON_DEMAND_RECIPES[0];
    const sim = makeSim();
    const pid = sim.playerId;
    knowRecipe(sim, pid, recipe.id);
    grantReagents(sim, recipe, pid);
    const meta = sim.ctx.players.get(pid);
    if (meta) meta.craftSkills[recipe.professionId] = 75;
    // Explicitly park the player far from every station (rather than trusting
    // wherever the default spawn happens to sit relative to content stations).
    // biome-ignore lint/suspicious/noExplicitAny: test-only reach into private entity state
    const entity = (sim as any).entities.get(pid);
    entity.pos.x = -99999;
    entity.pos.z = -99999;
    entity.prevPos = { ...entity.pos };

    const outcome = resolveCraftForRecipe(sim.ctx, pid, recipe);
    expect(outcome.ok).toBe(false);
    expect(outcome.reason).toBe('station_required');
  });

  it('denies the craft when the recipe is not yet known (the trainer gate)', () => {
    const recipe = ON_DEMAND_RECIPES[0];
    const sim = makeSim();
    const pid = sim.playerId;
    grantReagents(sim, recipe, pid);
    const meta = sim.ctx.players.get(pid);
    if (meta) meta.craftSkills[recipe.professionId] = 75;
    placeAtStation(sim, pid, recipe.stationType as string);
    // Deliberately never calls knowRecipe.

    const outcome = resolveCraftForRecipe(sim.ctx, pid, recipe);
    expect(outcome.ok).toBe(false);
    expect(outcome.reason).toBe('recipe_not_learned');
  });

  it('the 75-skill trainer tier sits one rung above the existing 0/25/50 ladder', () => {
    // A skillReq of 75 is the fourth rung (tierForSkill buckets on
    // TIER_SKILL_STEP), one past the highest pre-existing LADDER_RECIPES rung.
    expect(75).toBe(TIER_SKILL_STEP * 3);
  });
});
