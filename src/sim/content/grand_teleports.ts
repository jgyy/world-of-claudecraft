// Grand Teleports: the mage's party portals. Data only; the portal object and
// its party gate live in src/sim/party_gate.ts, the learn paths in
// src/sim/grand_teleport_learning.ts.
//
// Each destination is ONE hidden mage ability (`grand_teleport_<id>`) that the
// mage learns either from its tome (a mage-only raid-boss drop) or by clearing
// every quest handed out in that city. Learning is recorded as a synthetic
// questsDone key (GRAND_TELEPORT_LEARN_PREFIX + id) so the existing
// `requiresQuest` kit gate, its persistence and its wire mirror all carry it
// with no new seam. Every teleport shares one 20 minute cooldown
// (combat/ability_cooldown_groups.ts) and burns one Rune of Passage.

import type { AbilityDef, ItemDef, LootEntry } from '../types';

export interface GrandTeleportDestination {
  id: string;
  /** Zone whose hub counts as "the city" for the quest-clear unlock. */
  zoneId: string;
  town: string;
  landing: { x: number; z: number; facing: number };
}

export const GRAND_TELEPORT_DESTINATIONS: readonly GrandTeleportDestination[] = [
  {
    id: 'eastbrook',
    zoneId: 'eastbrook_vale',
    town: 'Eastbrook',
    landing: { x: -6, z: -92, facing: 3.1 },
  },
  {
    id: 'fenbridge',
    zoneId: 'mirefen_marsh',
    town: 'Fenbridge',
    landing: { x: 8, z: 292, facing: 3.1 },
  },
  {
    id: 'highwatch',
    zoneId: 'thornpeak_heights',
    town: 'Highwatch',
    landing: { x: 6, z: 652, facing: 3.1 },
  },
  {
    id: 'eldergleam',
    zoneId: 'veiled_hollow',
    town: 'Eldergleam',
    landing: { x: -30, z: 1022, facing: 3.1 },
  },
];

export const GRAND_TELEPORT_LEARN_PREFIX = 'learned:';
export const GRAND_PORTAL_OBJECT_ITEM_ID = 'grand_portal';
export const GRAND_PORTAL_DURATION = 300;
/** The shared cooldown every Grand Teleport arms (20 minutes). */
export const GRAND_TELEPORT_COOLDOWN = 1200;
export const GRAND_TELEPORT_CAST_TIME = 10;
export const RUNE_OF_PASSAGE_ITEM_ID = 'rune_of_passage';
export const TOME_SELL_COPPER = 15_000;
export const RUNE_BUY_COPPER = 10_000;
/** The tome's own per-boss roll, made only for an eligible mage. */
export const GRAND_TELEPORT_TOME_CHANCE = 1 / 64;
/** The reagent's own per-boss roll, made only for an eligible mage. */
export const RUNE_OF_PASSAGE_DROP_CHANCE = 0.35;

export function grandTeleportAbilityId(destinationId: string): string {
  return `grand_teleport_${destinationId}`;
}
export function grandTeleportTomeItemId(destinationId: string): string {
  return `tome_grand_teleport_${destinationId}`;
}
/** The questsDone key that marks a destination as learned. */
export function grandTeleportLearnKey(destinationId: string): string {
  return `${GRAND_TELEPORT_LEARN_PREFIX}${grandTeleportAbilityId(destinationId)}`;
}
export function grandTeleportDestination(id: string): GrandTeleportDestination | undefined {
  return GRAND_TELEPORT_DESTINATIONS.find((d) => d.id === id);
}
/** Destination id of a Grand Teleport ability id, else null. */
export function grandTeleportDestinationOfAbility(abilityId: string): string | null {
  const dest = GRAND_TELEPORT_DESTINATIONS.find((d) => grandTeleportAbilityId(d.id) === abilityId);
  return dest ? dest.id : null;
}

export const GRAND_TELEPORT_ABILITY_IDS: readonly string[] = GRAND_TELEPORT_DESTINATIONS.map((d) =>
  grandTeleportAbilityId(d.id),
);

/** Raid bosses whose kill makes the mage-only tome and rune rolls. */
export const GRAND_TELEPORT_BOOK_BOSSES: readonly string[] = [
  'nythraxis_scourge_of_thornpeak',
  'ignivar_herald_of_the_last_flame',
  'ignivar_heart_of_the_end',
  'varkhul_forgefather_of_the_last_flame',
];

export const GRAND_TELEPORT_ABILITIES: Record<string, AbilityDef> = Object.fromEntries(
  GRAND_TELEPORT_DESTINATIONS.map((dest) => {
    const id = grandTeleportAbilityId(dest.id);
    const def: AbilityDef = {
      id,
      name: `Grand Teleport: ${dest.town}`,
      class: 'mage',
      learnLevel: 10,
      cost: 120,
      castTime: GRAND_TELEPORT_CAST_TIME,
      cooldown: GRAND_TELEPORT_COOLDOWN,
      range: 0,
      school: 'arcane',
      requiresTarget: false,
      requiresOutOfCombat: true,
      requiresQuest: grandTeleportLearnKey(dest.id),
      reagent: { itemId: RUNE_OF_PASSAGE_ITEM_ID, count: 1 },
      effects: [
        { type: 'summonGrandPortal', destination: dest.id, duration: GRAND_PORTAL_DURATION },
      ],
      description: `Opens a Grand Portal to ${dest.town} for 5 min. Only members of your group at the moment of casting can step through. Consumes a Rune of Passage. 10 sec cast. Shares a 20 min cooldown with every other Grand Teleport.`,
    };
    return [id, def];
  }),
);

export const GRAND_TELEPORT_ITEMS: Record<string, ItemDef> = {
  [RUNE_OF_PASSAGE_ITEM_ID]: {
    id: RUNE_OF_PASSAGE_ITEM_ID,
    name: 'Rune of Passage',
    kind: 'junk',
    quality: 'common',
    stackSize: 20,
    sellValue: 2_500,
    buyValue: RUNE_BUY_COPPER,
  },
  ...Object.fromEntries(
    GRAND_TELEPORT_DESTINATIONS.map((dest) => {
      const id = grandTeleportTomeItemId(dest.id);
      const def: ItemDef = {
        id,
        name: `Tome of Passage: ${dest.town}`,
        kind: 'junk',
        quality: 'rare',
        stackSize: 1,
        requiredClass: ['mage'],
        sellValue: TOME_SELL_COPPER,
        use: { type: 'learnSpell', abilityId: grandTeleportAbilityId(dest.id) },
      };
      return [id, def];
    }),
  ),
};

/** The per-boss mage-only roll table: one tome (any destination) and the rune. */
export const GRAND_TELEPORT_BOSS_ROLLS: readonly LootEntry[] = [
  ...GRAND_TELEPORT_DESTINATIONS.map((dest) => ({
    itemId: grandTeleportTomeItemId(dest.id),
    chance: GRAND_TELEPORT_TOME_CHANCE,
  })),
  { itemId: RUNE_OF_PASSAGE_ITEM_ID, chance: RUNE_OF_PASSAGE_DROP_CHANCE },
];
