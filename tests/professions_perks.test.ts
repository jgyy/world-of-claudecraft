import { describe, expect, it } from 'vitest';
import { PERK_THRESHOLDS } from '../src/sim/content/professions';
import { discountedIngredients, resolveCraft } from '../src/sim/professions/crafting';
import { isStationActive, placeMobileCraftingStation } from '../src/sim/professions/mobile_station';
import { rechargeCost, slotEffect } from '../src/sim/professions/tools';
import {
  isSpecialized,
  materialCostMultiplier,
  rechargeDiscountMultiplier,
  skillInCraft,
} from '../src/sim/professions/wheel';

const CRAFT_ID = 'enchanting';
const THRESHOLD = PERK_THRESHOLDS[CRAFT_ID].specializedSkillThreshold;

describe('specialization perk eligibility (#1134, wheel.ts)', () => {
  it('a craft absent from the skill record defaults to 0 and is never specialized', () => {
    expect(skillInCraft({}, CRAFT_ID)).toBe(0);
    expect(isSpecialized({}, CRAFT_ID)).toBe(false);
  });

  it('a player below the threshold is not specialized', () => {
    const skills = { [CRAFT_ID]: THRESHOLD - 1 };
    expect(isSpecialized(skills, CRAFT_ID)).toBe(false);
    expect(materialCostMultiplier(skills, CRAFT_ID)).toBe(1);
    expect(rechargeDiscountMultiplier(skills, CRAFT_ID)).toBe(1);
  });

  it('a player at or above the threshold is specialized and gets the content-driven discount', () => {
    const skills = { [CRAFT_ID]: THRESHOLD };
    expect(isSpecialized(skills, CRAFT_ID)).toBe(true);
    const expectedMult = 1 - PERK_THRESHOLDS[CRAFT_ID].materialDiscountPct;
    expect(materialCostMultiplier(skills, CRAFT_ID)).toBeCloseTo(expectedMult);
  });

  it('perk thresholds are read from content, not hardcoded: changing content changes the read', () => {
    const original = PERK_THRESHOLDS[CRAFT_ID].specializedSkillThreshold;
    PERK_THRESHOLDS[CRAFT_ID].specializedSkillThreshold = 5;
    try {
      expect(isSpecialized({ [CRAFT_ID]: 5 }, CRAFT_ID)).toBe(true);
    } finally {
      PERK_THRESHOLDS[CRAFT_ID].specializedSkillThreshold = original;
    }
  });

  it('throws on an unknown craft id, same as the rest of the wheel content', () => {
    expect(() => isSpecialized({}, 'not_a_real_craft')).toThrow();
  });
});

describe('material-cost discount when crafting (#1134, crafting.ts)', () => {
  const recipe = {
    craftId: CRAFT_ID,
    ingredients: [
      { itemId: 'thorium_ore', qty: 10 },
      { itemId: 'arcanite_bar', qty: 1 },
    ],
    outputItemId: 'thorium_mining_pick',
  };

  it('a non-specialized player pays the full listed material cost', () => {
    const consumed = discountedIngredients(recipe, {});
    expect(consumed).toEqual(recipe.ingredients);
  });

  it('a specialized player sees a reduced quantity, floored, with a minimum of 1', () => {
    const skills = { [CRAFT_ID]: THRESHOLD };
    const consumed = discountedIngredients(recipe, skills);
    const discountPct = PERK_THRESHOLDS[CRAFT_ID].materialDiscountPct;
    expect(consumed[0].qty).toBe(Math.max(1, Math.floor(10 * (1 - discountPct))));
    expect(consumed[0].qty).toBeLessThan(10);
    // The 1-qty ingredient floors at the minimum of 1, never drops to 0.
    expect(consumed[1].qty).toBe(1);
  });

  it('resolveCraft succeeds when discounted materials are available, and reports what it consumed', () => {
    const skills = { [CRAFT_ID]: THRESHOLD };
    const materials = { thorium_ore: 8, arcanite_bar: 1 };
    const result = resolveCraft(recipe, skills, materials);
    expect(result.success).toBe(true);
    expect(result.consumed[0].qty).toBeLessThanOrEqual(8);
  });

  it('resolveCraft fails for a non-specialized player short of the full-price materials', () => {
    const materials = { thorium_ore: 8, arcanite_bar: 1 };
    const result = resolveCraft(recipe, {}, materials);
    expect(result.success).toBe(false);
  });
});

describe('specialized recharge discount composes with the original-crafter discount (#1134, tools.ts)', () => {
  it('a specialized original recharger pays strictly less than a merely-original (non-specialized) recharger', () => {
    const specializedSlot = slotEffect('gatherers_cache', 'player_alice');
    const plainSlot = slotEffect('gatherers_cache', 'player_alice');
    const specializedCost = rechargeCost(specializedSlot, 'player_alice', {
      [CRAFT_ID]: THRESHOLD,
    });
    const plainOriginalCost = rechargeCost(plainSlot, 'player_alice');
    expect(specializedCost.materials).toBeLessThanOrEqual(plainOriginalCost.materials);
    expect(specializedCost.ticks).toBeLessThan(plainOriginalCost.ticks);
  });

  it('a specialized NON-original recharger gets no additional discount: the perk is for recharging your own work', () => {
    const slot = slotEffect('gatherers_cache', 'player_alice');
    const genericCost = rechargeCost(slot, 'player_bob');
    const specializedButNotOriginal = rechargeCost(slot, 'player_bob', { [CRAFT_ID]: THRESHOLD });
    expect(specializedButNotOriginal).toEqual(genericCost);
  });

  it('omitting rechargerSkills behaves exactly like the pre-#1134 original-crafter-only discount', () => {
    const slot = slotEffect('gatherers_cache', 'player_alice');
    const withEmptySkills = rechargeCost(slot, 'player_alice', {});
    const withNoArg = rechargeCost(slot, 'player_alice');
    expect(withEmptySkills).toEqual(withNoArg);
  });
});

describe('mobile crafting station (#1134, mobile_station.ts, stub)', () => {
  it('a non-specialized player cannot place a station', () => {
    const station = placeMobileCraftingStation('player_bob', CRAFT_ID, { x: 1, z: 2 }, {}, 1000);
    expect(station).toBeUndefined();
  });

  it('a specialized player can place a station, and it is queryable by existence and duration', () => {
    const skills = { [CRAFT_ID]: THRESHOLD };
    const station = placeMobileCraftingStation(
      'player_alice',
      CRAFT_ID,
      { x: 5, z: 9 },
      skills,
      1000,
    );
    expect(station).toBeDefined();
    if (!station) throw new Error('station should have been placed');
    expect(station.playerId).toBe('player_alice');
    expect(station.pos).toEqual({ x: 5, z: 9 });
    expect(isStationActive(station, 1000)).toBe(true);
    expect(isStationActive(station, station.expiresAtTick - 1)).toBe(true);
    expect(isStationActive(station, station.expiresAtTick)).toBe(false);
  });
});
