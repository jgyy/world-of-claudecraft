// Pure view-core for the Card Adept hand HUD. DOM/Three/i18n-free: it turns the
// IWorld card reads (hand ids, deck/discard counts, current Focus) into a display
// model the thin painter renders. A Vitest imports this directly. Card names are
// resolved by the painter (via the card's referenced ability), so this core stays
// i18n-free per the pure-core contract.

import { CARDS_BY_ID } from '../sim/content/cards';

export interface CardSlotView {
  // The card id (also the ability-icon source via its effectAbilityId).
  id: string;
  // The ability whose icon + tooltip the painter shows for this card.
  effectAbilityId: string;
  cost: number;
  rarity: 'common' | 'uncommon' | 'rare' | 'epic';
  // Whether the player currently has enough Focus to play this card.
  playable: boolean;
}

export interface CardHandView {
  visible: boolean;
  slots: CardSlotView[];
  deckCount: number;
  discardCount: number;
}

export interface CardHandInput {
  // Whether the local player is a Card Adept (drives visibility).
  isCardAdept: boolean;
  handIds: readonly string[];
  deckCount: number;
  discardCount: number;
  focus: number;
  // Resolves a card's ability to its talent-and-rank resolved Focus cost, or null
  // if the ability is not learned yet (a card in hand the player cannot cast). When
  // omitted (Node tests), the pinned CardDef.cost is used and every card is treated
  // as learned, preserving the original behavior.
  resolveCost?: (effectAbilityId: string) => number | null;
}

const EMPTY: CardHandView = { visible: false, slots: [], deckCount: 0, discardCount: 0 };

export function buildCardHandView(input: CardHandInput): CardHandView {
  if (!input.isCardAdept) return EMPTY;
  const slots: CardSlotView[] = [];
  for (const id of input.handIds) {
    const def = CARDS_BY_ID[id];
    if (!def) continue;
    const resolved = input.resolveCost ? input.resolveCost(def.effectAbilityId) : def.cost;
    // resolved === null means the referenced ability is not learned yet: the card
    // cannot be cast, so it is never playable and shows its pinned cost.
    const cost = resolved ?? def.cost;
    const playable = resolved === null ? false : input.focus >= cost;
    slots.push({
      id,
      effectAbilityId: def.effectAbilityId,
      cost,
      rarity: def.rarity,
      playable,
    });
  }
  return {
    visible: true,
    slots,
    deckCount: Math.max(0, input.deckCount),
    discardCount: Math.max(0, input.discardCount),
  };
}
