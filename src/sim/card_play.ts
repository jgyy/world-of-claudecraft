// Card Adept hand driver: the SimContext-facing layer over the pure deck machine
// in card_hand.ts. Advances the hand each tick (deal on entering combat, redraw on
// a timer, return the hand to the deck when combat ends) and plays a card by
// routing its referenced ability through the normal cast pipeline. Draws rng only
// for a Card Adept (via the pure card_hand functions), so a world with no Card
// Adept is unaffected (parity-safe).

import {
  type CardHandState,
  endCombat as endCardCombat,
  playCardAt,
  startCombat as startCardCombat,
  tickRedraw as tickCardRedraw,
} from './card_hand';
import { castAbility } from './combat/casting_lifecycle';
import { CARDS_BY_ID } from './content/cards';
import type { SimContext } from './sim_context';
import type { Entity } from './types';

// Advance one Card Adept's deck machine for one tick.
export function updateCardHand(ctx: SimContext, p: Entity, state: CardHandState): void {
  if (p.inCombat) {
    if (!state.inCombat) startCardCombat(ctx.rng, state);
    else tickCardRedraw(ctx.rng, state);
  } else if (state.inCombat) {
    endCardCombat(state);
  }
}

// Play the card at `index` in the player's hand. Triggers the referenced ability
// through castAbility, which enforces the resolved-rank Focus cost, GCD, cooldown,
// target, and CC gates. The card moves from the hand to the discard ONLY when the
// cast actually committed (castAbility returned true); a card refused for any
// reason (unaffordable resolved cost, no target, on GCD, unlearned ability,
// stun/silence) stays in hand. No-op if the player is not a Card Adept or the
// index is empty.
export function playCard(
  ctx: SimContext,
  index: number,
  pid?: number,
  aim?: { x: number; z: number },
): void {
  const r = ctx.resolve(pid);
  if (!r) return;
  const state = r.meta.cardHand;
  if (!state) return;
  const cardId = state.hand[index];
  if (cardId === undefined) return;
  const def = CARDS_BY_ID[cardId];
  if (!def) return;
  const committed = castAbility(ctx, def.effectAbilityId, pid ?? r.meta.entityId, aim);
  if (committed) playCardAt(state, index);
}
