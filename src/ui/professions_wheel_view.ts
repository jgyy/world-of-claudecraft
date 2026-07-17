// Pure, host-agnostic view model for the Professions Wheel window (issue #1302).
//
// This is the pure-core half of the pure-core + thin-painter split (root
// CLAUDE.md Conventions; reference unit_portrait.ts / vendor_view.ts). It shows
// all ten crafts on the ring at once: current skill, tier (common through
// legendary, matching the ITEMS quality scale), and which craft is the active
// archetype vs. the hobby vs. still dormant. Everything it reads (craftSkills,
// activeArchetype, hobbyCraft, archetypeSwitchCount/amends) is already a plain
// IWorld read (progression_xp.ts / professions.ts facets): this window adds no
// new sim or wire surface, only a new way to look at existing state.
//
// DOM-free and i18n-free (the painter localizes craft names via hud_chrome.ts
// `wheel.<craftId>` and tier names via the existing `itemUi.quality.*` keys) so
// tests/professions_wheel_view.test.ts can drive it directly.

import { CRAFT_RING } from '../sim/content/professions';
import type { MaterialRarity } from '../sim/professions/gathering';
import { TIER_SKILL_STEP, tierForSkill } from '../sim/professions/wheel';

/** Number of pips shown for the player's progress within their current tier. */
export const WHEEL_PIPS_PER_TIER = 5;

// The tier-name ladder, reusing the same five names as item quality (root
// CLAUDE.md: crafting output tiers are the classic common/uncommon/rare/epic/
// legendary scale). Tier indices at or past the last name display as legendary:
// there is no sixth name to grow into.
const TIER_RARITY_NAMES: readonly MaterialRarity[] = [
  'common',
  'uncommon',
  'rare',
  'epic',
  'legendary',
];

/** Clamp a raw tier index (tierForSkill can grow unbounded) to a display rarity. */
function rarityForTier(tier: number): MaterialRarity {
  const index = Math.min(tier, TIER_RARITY_NAMES.length - 1);
  return TIER_RARITY_NAMES[index];
}

export type WheelCraftState = 'archetype' | 'hobby' | 'dormant';

export interface WheelCraftVM {
  craftId: string;
  skill: number;
  /** 0-based capability tier from the flat skill value (see wheel.ts). */
  tier: number;
  tierRarity: MaterialRarity;
  /** How many of WHEEL_PIPS_PER_TIER pips are filled toward the NEXT tier. */
  pipsFilled: number;
  pipsTotal: number;
  state: WheelCraftState;
}

export interface ProfessionsWheelView {
  crafts: readonly WheelCraftVM[];
  archetypeCraft: string | null;
  hobbyCraft: string | null;
  archetypeSwitchCount: number;
  amendsProgress: number;
  amendsRequired: number;
}

export interface ProfessionsWheelInput {
  craftSkills: Readonly<Record<string, number>>;
  archetypeCraft: string | null;
  hobbyCraft: string | null;
  archetypeSwitchCount: number;
  amendsProgress: number;
  amendsRequired: number;
}

function wheelCraftState(
  craftId: string,
  archetypeCraft: string | null,
  hobbyCraft: string | null,
): WheelCraftState {
  if (craftId === archetypeCraft) return 'archetype';
  if (craftId === hobbyCraft) return 'hobby';
  return 'dormant';
}

/**
 * Build the structured wheel view from raw IWorld reads. Read-only: never
 * mutates any of its inputs.
 */
export function buildProfessionsWheelView(input: ProfessionsWheelInput): ProfessionsWheelView {
  const crafts: WheelCraftVM[] = CRAFT_RING.map((craft) => {
    const skill = input.craftSkills[craft.id] ?? 0;
    const tier = tierForSkill(skill);
    const withinTier = skill - tier * TIER_SKILL_STEP;
    const pipsFilled = Math.min(
      WHEEL_PIPS_PER_TIER,
      Math.floor((withinTier / TIER_SKILL_STEP) * WHEEL_PIPS_PER_TIER),
    );
    return {
      craftId: craft.id,
      skill,
      tier,
      tierRarity: rarityForTier(tier),
      pipsFilled,
      pipsTotal: WHEEL_PIPS_PER_TIER,
      state: wheelCraftState(craft.id, input.archetypeCraft, input.hobbyCraft),
    };
  });

  return {
    crafts,
    archetypeCraft: input.archetypeCraft,
    hobbyCraft: input.hobbyCraft,
    archetypeSwitchCount: input.archetypeSwitchCount,
    amendsProgress: input.amendsProgress,
    amendsRequired: input.amendsRequired,
  };
}
