// Card Adept hand/deck/discard state machine. Pure, deterministic leaf module:
// it imports only the CARDS data and the sim Rng, so a Vitest exercises it
// directly. The live Sim owns one CardHandState per Card Adept player (on
// PlayerMeta) and drives it from the per-player tick; playing a card is resolved
// by the sim casting the referenced ability through the normal effect pipeline.
//
// Determinism: every shuffle and draw flows through the shared sim Rng, never
// Math.random, so the same seed yields the same draws. Guarded to Card Adept
// entities in the Sim, so a world with no Card Adept draws zero card rng and the
// golden-trace parity gate is unaffected.

import { buildStartingDeck, CARDS_BY_ID, type CardDef } from './content/cards';
import type { Rng } from './rng';

// The hand a Card Adept holds at once. Small so the HUD row stays readable.
export const STARTING_HAND_SIZE = 4;
// Ticks between automatic card draws while in combat. 20 Hz tick (DT = 1/20), so
// 40 ticks is one draw every 2 seconds, matching the combat-loop cadence.
export const REDRAW_INTERVAL_TICKS = 40;
// The largest hand the auto-draw will grow to (a full hand plus buffered draws).
export const MAX_HAND_SIZE = 6;

export interface CardHandState {
  // Draw pile, top of deck at the END of the array (pop() draws).
  deck: string[];
  // The cards currently in hand, in draw order.
  hand: string[];
  // Spent and expired cards, reshuffled into the deck when the deck empties.
  discard: string[];
  // Ticks remaining until the next automatic draw.
  redrawTimer: number;
  // Whether the opening hand has been dealt for the current combat.
  inCombat: boolean;
}

// A fresh, unshuffled hand state seeded with the full Card Adept deck.
export function createCardHand(): CardHandState {
  return {
    deck: buildStartingDeck(),
    hand: [],
    discard: [],
    redrawTimer: REDRAW_INTERVAL_TICKS,
    inCombat: false,
  };
}

// Fisher-Yates shuffle in place, using the shared sim Rng for determinism.
export function shuffle(rng: Rng, cards: string[]): void {
  for (let i = cards.length - 1; i > 0; i--) {
    const j = rng.int(0, i);
    const tmp = cards[i];
    cards[i] = cards[j];
    cards[j] = tmp;
  }
}

// Move every discard back onto the deck and shuffle. Called when the deck runs
// dry so draws never stall.
function reshuffleDiscard(rng: Rng, state: CardHandState): void {
  if (state.discard.length === 0) return;
  for (const id of state.discard) state.deck.push(id);
  state.discard.length = 0;
  shuffle(rng, state.deck);
}

// Draw a single card from the deck into the hand. Reshuffles the discard when the
// deck is empty; a no-op only if every card is already in hand. Respects the hand
// cap. Returns the drawn card id, or null if nothing could be drawn.
export function drawOne(rng: Rng, state: CardHandState): string | null {
  if (state.hand.length >= MAX_HAND_SIZE) return null;
  if (state.deck.length === 0) reshuffleDiscard(rng, state);
  const id = state.deck.pop();
  if (id === undefined) return null;
  state.hand.push(id);
  return id;
}

// Deal the opening hand for a fresh combat: reset the deck, shuffle, and draw the
// starting hand. Idempotent while a combat is ongoing.
export function startCombat(rng: Rng, state: CardHandState): void {
  if (state.inCombat) return;
  // Collect every card back into the deck, then shuffle for a clean opener.
  for (const id of state.hand) state.deck.push(id);
  for (const id of state.discard) state.deck.push(id);
  state.hand.length = 0;
  state.discard.length = 0;
  shuffle(rng, state.deck);
  for (let i = 0; i < STARTING_HAND_SIZE; i++) drawOne(rng, state);
  state.redrawTimer = REDRAW_INTERVAL_TICKS;
  state.inCombat = true;
}

// Leave combat: return the hand and discard to the deck so the next fight opens
// fresh. Does not shuffle (startCombat shuffles).
export function endCombat(state: CardHandState): void {
  if (!state.inCombat) return;
  for (const id of state.hand) state.deck.push(id);
  for (const id of state.discard) state.deck.push(id);
  state.hand.length = 0;
  state.discard.length = 0;
  state.redrawTimer = REDRAW_INTERVAL_TICKS;
  state.inCombat = false;
}

// Advance the redraw timer by one tick while in combat, drawing a card when it
// elapses. Returns the drawn card id, or null if nothing was drawn this tick.
export function tickRedraw(rng: Rng, state: CardHandState): string | null {
  if (!state.inCombat) return null;
  if (state.redrawTimer > 0) {
    state.redrawTimer--;
    return null;
  }
  state.redrawTimer = REDRAW_INTERVAL_TICKS;
  return drawOne(rng, state);
}

// Remove the card at `index` from the hand and move it to the discard pile.
// Returns its CardDef (so the caller can resolve cost + effect), or null if the
// index is out of range or the card id is unknown.
export function playCardAt(state: CardHandState, index: number): CardDef | null {
  if (index < 0 || index >= state.hand.length) return null;
  const id = state.hand[index];
  const def = CARDS_BY_ID[id];
  if (!def) return null;
  state.hand.splice(index, 1);
  state.discard.push(id);
  return def;
}

// Read-only counts for the HUD (hand contents are exposed separately).
export function deckCount(state: CardHandState): number {
  return state.deck.length;
}
export function discardCount(state: CardHandState): number {
  return state.discard.length;
}
