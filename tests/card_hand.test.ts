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

  it('the pinned card cost matches the ability RANK-1 cost, and higher ranks cost more', () => {
    // The pinned CardDef.cost is the rank-1 cost; the sim/HUD resolve the real cost
    // through the ability's resolved rank (ranks[]), so a card in hand at a higher
    // rank can cost more than its pinned value. Guard that at least one card's
    // ability actually scales its cost across ranks, so the resolved-cost path is
    // load-bearing (the pinned cost alone would understate affordability).
    let sawRankCostIncrease = false;
    for (const card of CARDS) {
      const def = ABILITIES[card.effectAbilityId];
      expect(card.cost, card.id).toBe(def.cost); // pinned == rank 1
      for (const rank of def.ranks ?? []) {
        if (rank.cost !== undefined && rank.cost > def.cost) sawRankCostIncrease = true;
      }
    }
    expect(sawRankCostIncrease, 'at least one card ability raises its cost at a higher rank').toBe(
      true,
    );
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

  it('draw reshuffles the discard back into the deck once the deck runs dry', () => {
    const state = createCardHand();
    const total = state.deck.length;
    startCombat(new Rng(7), state);
    // Play the opening hand into the discard so the discard is non-empty.
    while (state.hand.length > 0) playCardAt(state, 0);
    expect(state.discard.length).toBeGreaterThan(0);
    // Drain the deck to zero with cards still sitting in the discard. drawOne
    // caps at MAX_HAND_SIZE, so play cards back out to discard as the hand
    // fills, keeping the loop making forward progress on the deck.
    while (state.deck.length > 0) {
      if (drawOne(new Rng(1), state) === null) playCardAt(state, 0);
    }
    expect(state.deck.length).toBe(0);
    // Play the hand back out too, so the next drawOne is blocked only by the
    // empty deck (reshuffle), not the MAX_HAND_SIZE cap.
    while (state.hand.length > 0) playCardAt(state, 0);
    const discardBeforeReshuffle = state.discard.length;
    expect(discardBeforeReshuffle).toBeGreaterThan(0);
    // The next draw with an empty deck MUST reshuffle the discard back in (the
    // branch the old test never reached), pulling one card out as the draw.
    const drawn = drawOne(new Rng(1), state);
    expect(drawn).not.toBeNull();
    expect(state.discard.length).toBe(0); // discard emptied into the deck
    expect(state.deck.length).toBe(discardBeforeReshuffle - 1); // minus the drawn card
    // No card is ever lost or duplicated across the reshuffle. hand.length
    // already includes the just-drawn card (drawOne pushes onto state.hand).
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
