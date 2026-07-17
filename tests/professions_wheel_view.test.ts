import { describe, expect, it } from 'vitest';
import { CRAFT_RING } from '../src/sim/content/professions';
import { TIER_SKILL_STEP } from '../src/sim/professions/wheel';
import {
  buildProfessionsWheelView,
  type ProfessionsWheelInput,
  WHEEL_PIPS_PER_TIER,
} from '../src/ui/professions_wheel_view';

function makeInput(overrides: Partial<ProfessionsWheelInput> = {}): ProfessionsWheelInput {
  return {
    craftSkills: {},
    archetypeCraft: null,
    hobbyCraft: null,
    archetypeSwitchCount: 0,
    amendsProgress: 0,
    amendsRequired: 0,
    ...overrides,
  };
}

describe('buildProfessionsWheelView', () => {
  it('returns one row per craft on the ring, in ring order', () => {
    const view = buildProfessionsWheelView(makeInput());
    expect(view.crafts.map((c) => c.craftId)).toEqual(CRAFT_RING.map((c) => c.id));
  });

  it('defaults an unknown/missing craft to zero skill, tier 0, common rarity', () => {
    const view = buildProfessionsWheelView(makeInput());
    for (const craft of view.crafts) {
      expect(craft.skill).toBe(0);
      expect(craft.tier).toBe(0);
      expect(craft.tierRarity).toBe('common');
      expect(craft.pipsFilled).toBe(0);
    }
  });

  it('buckets skill into tiers matching tierForSkill exactly', () => {
    const view = buildProfessionsWheelView(
      makeInput({ craftSkills: { armorcrafting: TIER_SKILL_STEP * 2 + 10 } }),
    );
    const armor = view.crafts.find((c) => c.craftId === 'armorcrafting');
    expect(armor?.tier).toBe(2);
    expect(armor?.tierRarity).toBe('rare');
  });

  it('caps the display rarity at legendary for tiers past the named ladder', () => {
    const view = buildProfessionsWheelView(
      makeInput({ craftSkills: { armorcrafting: TIER_SKILL_STEP * 20 } }),
    );
    const armor = view.crafts.find((c) => c.craftId === 'armorcrafting');
    expect(armor?.tierRarity).toBe('legendary');
  });

  it('computes pip fill proportional to progress within the current tier', () => {
    // Halfway through tier 0's band (TIER_SKILL_STEP points wide).
    const halfway = Math.floor(TIER_SKILL_STEP / 2);
    const view = buildProfessionsWheelView(makeInput({ craftSkills: { alchemy: halfway } }));
    const alchemy = view.crafts.find((c) => c.craftId === 'alchemy');
    expect(alchemy?.pipsFilled).toBe(Math.floor((halfway / TIER_SKILL_STEP) * WHEEL_PIPS_PER_TIER));
    expect(alchemy?.pipsTotal).toBe(WHEEL_PIPS_PER_TIER);
  });

  it('marks the active archetype craft, the hobby craft, and everything else dormant', () => {
    const view = buildProfessionsWheelView(
      makeInput({ archetypeCraft: 'weaponcrafting', hobbyCraft: 'tailoring' }),
    );
    const byId = new Map(view.crafts.map((c) => [c.craftId, c.state]));
    expect(byId.get('weaponcrafting')).toBe('archetype');
    expect(byId.get('tailoring')).toBe('hobby');
    expect(byId.get('alchemy')).toBe('dormant');
  });

  it('lays crafts out at evenly spaced angles around the ring, starting at 0deg', () => {
    const view = buildProfessionsWheelView(makeInput());
    const step = 360 / CRAFT_RING.length;
    view.crafts.forEach((craft, index) => {
      expect(craft.angleDeg).toBeCloseTo(index * step);
    });
    expect(view.crafts[0].angleDeg).toBe(0);
  });

  it('passes archetype/hobby identity and amends progress through unchanged', () => {
    const view = buildProfessionsWheelView(
      makeInput({
        archetypeCraft: 'cooking',
        hobbyCraft: 'inscription',
        archetypeSwitchCount: 2,
        amendsProgress: 3,
        amendsRequired: 8,
      }),
    );
    expect(view.archetypeCraft).toBe('cooking');
    expect(view.hobbyCraft).toBe('inscription');
    expect(view.archetypeSwitchCount).toBe(2);
    expect(view.amendsProgress).toBe(3);
    expect(view.amendsRequired).toBe(8);
  });
});
