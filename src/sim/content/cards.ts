export type CardRarity = 'common' | 'uncommon' | 'rare' | 'epic';

// ---------------------------------------------------------------------------
// Card Adept deck data: each card references a card_adept ability id (see
// classes.ts CARD ADEPT section). Playing a card spends its Focus cost and
// triggers the referenced ability's effects through the normal dispatch
// pipeline (see src/sim/card_hand.ts). Pure data, no logic.
// ---------------------------------------------------------------------------

export interface CardDef {
  id: string;
  name: string;
  // Focus spent to play the card. Mirrors the referenced ability's own cost so
  // the resource economy is identical whether played as a card or cast.
  cost: number;
  // The card_adept ability whose effects resolve when the card is played.
  effectAbilityId: string;
  rarity: CardRarity;
  // How many copies of this card seed a fresh deck.
  copies: number;
}

export const CARDS: CardDef[] = [
  { id: 'card_quickstrike', name: 'Quickstrike', cost: 20, effectAbilityId: 'ca_quickstrike', rarity: 'common', copies: 4 },
  { id: 'card_jab', name: 'Jab', cost: 20, effectAbilityId: 'ca_quickstrike', rarity: 'common', copies: 2 },
  { id: 'card_arcane_bolt', name: 'Arcane Bolt', cost: 35, effectAbilityId: 'ca_arcane_bolt', rarity: 'common', copies: 3 },
  { id: 'card_spark', name: 'Spark', cost: 35, effectAbilityId: 'ca_arcane_bolt', rarity: 'common', copies: 2 },
  { id: 'card_flame_fan', name: 'Flame Fan', cost: 50, effectAbilityId: 'ca_flame_fan', rarity: 'uncommon', copies: 2 },
  { id: 'card_ember_spread', name: 'Ember Spread', cost: 50, effectAbilityId: 'ca_flame_fan', rarity: 'uncommon', copies: 1 },
  { id: 'card_mending', name: 'Mending', cost: 30, effectAbilityId: 'ca_mending_card', rarity: 'common', copies: 2 },
  { id: 'card_soothe', name: 'Soothe', cost: 30, effectAbilityId: 'ca_mending_card', rarity: 'common', copies: 1 },
  { id: 'card_warding', name: 'Warding', cost: 25, effectAbilityId: 'ca_warding_card', rarity: 'common', copies: 2 },
  { id: 'card_bulwark', name: 'Bulwark', cost: 25, effectAbilityId: 'ca_warding_card', rarity: 'uncommon', copies: 1 },
  { id: 'card_hex', name: 'Hex', cost: 30, effectAbilityId: 'ca_hex_card', rarity: 'common', copies: 2 },
  { id: 'card_snare', name: 'Snare', cost: 30, effectAbilityId: 'ca_hex_card', rarity: 'common', copies: 1 },
  { id: 'card_empower', name: 'Empower', cost: 30, effectAbilityId: 'ca_empower_card', rarity: 'uncommon', copies: 2 },
  { id: 'card_focus_draw', name: 'Focus Draw', cost: 30, effectAbilityId: 'ca_empower_card', rarity: 'uncommon', copies: 1 },
  { id: 'card_royal_flush', name: 'Royal Flush', cost: 80, effectAbilityId: 'ca_royal_flush', rarity: 'rare', copies: 1 },
  { id: 'card_high_roller', name: 'High Roller', cost: 80, effectAbilityId: 'ca_royal_flush', rarity: 'rare', copies: 1 },
  { id: 'card_double_down', name: 'Double Down', cost: 35, effectAbilityId: 'ca_arcane_bolt', rarity: 'common', copies: 1 },
  { id: 'card_wild_card', name: 'Wild Card', cost: 50, effectAbilityId: 'ca_flame_fan', rarity: 'rare', copies: 1 },
  { id: 'card_healers_gambit', name: "Healer's Gambit", cost: 30, effectAbilityId: 'ca_mending_card', rarity: 'uncommon', copies: 1 },
  { id: 'card_ace', name: 'Ace', cost: 20, effectAbilityId: 'ca_quickstrike', rarity: 'uncommon', copies: 1 },
];

export const CARDS_BY_ID: Record<string, CardDef> = Object.fromEntries(
  CARDS.map((c) => [c.id, c]),
);

// The full starting deck for a Card Adept, expanded by copy count, in a stable
// order. The shuffle (deterministic, rng-seeded) happens in the sim.
export function buildStartingDeck(): string[] {
  const deck: string[] = [];
  for (const card of CARDS) {
    for (let i = 0; i < card.copies; i++) deck.push(card.id);
  }
  return deck;
}
