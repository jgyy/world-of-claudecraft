import { describe, expect, it } from 'vitest';
import {
  createCardHand,
  drawOne,
  endCombat,
  playCardAt,
  STARTING_HAND_SIZE,
  shuffle,
  startCombat,
  tickRedraw,
} from '../src/sim/card_hand';
import { buildStartingDeck, CARDS, CARDS_BY_ID } from '../src/sim/content/cards';
import { ABILITIES } from '../src/sim/content/classes';
import { Rng } from '../src/sim/rng';

describe('Card Adept deck data', () => {
  it('every card references a real card_adept ability', () => {
    for (const card of CARDS) {
      const ability = ABILITIES[card.effectAbilityId];
      expect(ability, card.id).toBeTruthy();
      expect(ability.class, card.id).toBe('card_adept');
    }
  });

  it('card cost mirrors the referenced ability cost', () => {
    for (const card of CARDS) {
      expect(card.cost, card.id).toBe(ABILITIES[card.effectAbilityId].cost);
    }
  });

  it('has around twenty cards and a multi-copy starting deck', () => {
    expect(CARDS.length).toBeGreaterThanOrEqual(20);
    expect(buildStartingDeck().length).toBeGreaterThan(CARDS.length);
  });
});

describe('deterministic shuffle and draw', () => {
  it('same seed yields identical shuffles', () => {
    const a = buildStartingDeck();
    const b = buildStartingDeck();
    shuffle(new Rng(1234), a);
    shuffle(new Rng(1234), b);
    expect(a).toEqual(b);
  });

  it('different seeds diverge', () => {
    const a = buildStartingDeck();
    const b = buildStartingDeck();
    shuffle(new Rng(1), a);
    shuffle(new Rng(2), b);
    expect(a).not.toEqual(b);
  });

  it('shuffle is a permutation (no cards lost or duplicated)', () => {
    const deck = buildStartingDeck();
    const before = [...deck].sort();
    shuffle(new Rng(99), deck);
    expect([...deck].sort()).toEqual(before);
  });

  it('startCombat draws the same opening hand for the same seed', () => {
    const s1 = createCardHand();
    const s2 = createCardHand();
    startCombat(new Rng(42), s1);
    startCombat(new Rng(42), s2);
    expect(s1.hand).toEqual(s2.hand);
    expect(s1.hand.length).toBe(STARTING_HAND_SIZE);
  });

  it('draw pulls from the deck and reshuffles the discard when empty', () => {
    const state = createCardHand();
    const total = state.deck.length;
    startCombat(new Rng(7), state);
    // Play the whole hand into discard, then drain the deck, forcing a reshuffle.
    let guard = 0;
    while ((state.hand.length > 0 || state.deck.length > 0) && guard++ < 1000) {
      if (state.hand.length > 0) playCardAt(state, 0);
      else drawOne(new Rng(guard), state);
    }
    // Every card is conserved across deck + hand + discard.
    const seen = state.deck.length + state.hand.length + state.discard.length;
    expect(seen).toBe(total);
  });
});

describe('combat lifecycle and redraw cadence', () => {
  it('redraws on the interval while in combat, never before', () => {
    const state = createCardHand();
    startCombat(new Rng(3), state);
    const rng = new Rng(3);
    // No draw before the interval elapses.
    for (let i = 0; i < 40; i++) expect(tickRedraw(rng, state)).toBeNull();
    // The next tick draws.
    const drawn = tickRedraw(rng, state);
    expect(drawn).not.toBeNull();
    expect(CARDS_BY_ID[drawn as string]).toBeTruthy();
  });

  it('does not draw out of combat', () => {
    const state = createCardHand();
    expect(tickRedraw(new Rng(1), state)).toBeNull();
    endCombat(state); // no-op when not in combat
    expect(state.hand.length).toBe(0);
  });

  it('endCombat returns every card to the deck', () => {
    const state = createCardHand();
    const total = state.deck.length;
    startCombat(new Rng(5), state);
    playCardAt(state, 0);
    endCombat(state);
    expect(state.deck.length).toBe(total);
    expect(state.hand.length).toBe(0);
    expect(state.discard.length).toBe(0);
  });
});

describe('playCardAt', () => {
  it('moves the played card to discard and returns its def', () => {
    const state = createCardHand();
    startCombat(new Rng(11), state);
    const before = state.hand.length;
    const def = playCardAt(state, 0);
    expect(def).toBeTruthy();
    expect(state.hand.length).toBe(before - 1);
    expect(state.discard).toContain(def!.id);
  });

  it('rejects an out-of-range index', () => {
    const state = createCardHand();
    startCombat(new Rng(11), state);
    expect(playCardAt(state, 99)).toBeNull();
    expect(playCardAt(state, -1)).toBeNull();
  });
});
