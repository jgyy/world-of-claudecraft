import { describe, expect, it } from 'vitest';
import {
  cardDuelQueueSize,
  createCardDuelQueue,
  isQueuedForCardDuel,
  joinCardDuelQueue,
  leaveCardDuelQueue,
  tryPairCardDuel,
} from '../src/sim/social/card_duel_queue';

describe('Card Duel matchmaking queue', () => {
  it('only Card Adepts may queue', () => {
    const q = createCardDuelQueue();
    expect(joinCardDuelQueue(q, 1, false, false)).toEqual({ ok: false, reason: 'not_card_adept' });
    expect(cardDuelQueueSize(q)).toBe(0);
    expect(joinCardDuelQueue(q, 1, true, false)).toEqual({ ok: true });
    expect(isQueuedForCardDuel(q, 1)).toBe(true);
  });

  it('rejects a player already in a duel', () => {
    const q = createCardDuelQueue();
    expect(joinCardDuelQueue(q, 1, true, true)).toEqual({ ok: false, reason: 'in_duel' });
    expect(cardDuelQueueSize(q)).toBe(0);
  });

  it('rejects a duplicate queue entry', () => {
    const q = createCardDuelQueue();
    joinCardDuelQueue(q, 1, true, false);
    expect(joinCardDuelQueue(q, 1, true, false)).toEqual({ ok: false, reason: 'already_queued' });
    expect(cardDuelQueueSize(q)).toBe(1);
  });

  it('leaves the queue', () => {
    const q = createCardDuelQueue();
    joinCardDuelQueue(q, 7, true, false);
    expect(leaveCardDuelQueue(q, 7)).toBe(true);
    expect(isQueuedForCardDuel(q, 7)).toBe(false);
    expect(leaveCardDuelQueue(q, 7)).toBe(false);
  });

  it('pairs the two longest-waiting players in FIFO order', () => {
    const q = createCardDuelQueue();
    expect(tryPairCardDuel(q)).toBeNull();
    joinCardDuelQueue(q, 10, true, false);
    expect(tryPairCardDuel(q)).toBeNull(); // only one waiting
    joinCardDuelQueue(q, 20, true, false);
    joinCardDuelQueue(q, 30, true, false);
    expect(tryPairCardDuel(q)).toEqual([10, 20]); // oldest two
    expect(cardDuelQueueSize(q)).toBe(1); // 30 still waiting
    expect(tryPairCardDuel(q)).toBeNull();
  });
});
