import { describe, expect, it, vi } from 'vitest';
import { CARD_MASTER_NPC_ID } from '../src/sim/content/card_master';
import { Rng } from '../src/sim/rng';
import type { PlayerMeta } from '../src/sim/sim';
import type { SimContext } from '../src/sim/sim_context';
import {
  cardDuelMatchFor,
  joinCardMinigameQueue,
  leaveCardMinigameEntirely,
  leaveCardMinigameQueue,
  playCardInDuel,
  updateCardDuelQueue,
} from '../src/sim/social/card_duel';
import type { Entity } from '../src/sim/types';

function makeCtx(overrides: Partial<{ dead: Set<number> }> = {}) {
  const dead = overrides.dead ?? new Set<number>();
  const players = new Map<number, PlayerMeta>();
  const entities = new Map<number, Entity>();
  const bumpDeedStat = vi.fn();
  const error = vi.fn();
  const emit = vi.fn();

  for (const pid of [1, 2, 3]) {
    players.set(pid, { entityId: pid, name: `Player${pid}` } as unknown as PlayerMeta);
    entities.set(pid, { id: pid, pos: { x: 0, y: 0, z: 0 }, dead: dead.has(pid) } as Entity);
  }
  // The Card Master NPC, standing at the same spot so every test pid is in range.
  entities.set(1000, {
    id: 1000,
    kind: 'npc',
    templateId: CARD_MASTER_NPC_ID,
    pos: { x: 0, y: 0, z: 0 },
  } as unknown as Entity);

  const ctx = {
    rng: new Rng(7),
    players,
    entities,
    cardDuelQueue: [] as number[],
    cardDuels: new Map(),
    bumpDeedStat,
    error,
    emit,
    resolve: (pid?: number) => {
      if (pid === undefined) return null;
      const meta = players.get(pid);
      const e = entities.get(pid);
      if (!meta || !e) return null;
      return { meta, e };
    },
  } as unknown as SimContext;
  return { ctx, players, entities, bumpDeedStat, error, emit };
}

describe('card_duel', () => {
  it('joining requires standing at the Card Master and queues the player', () => {
    const { ctx, error } = makeCtx();
    joinCardMinigameQueue(ctx, 1);
    expect(error).not.toHaveBeenCalled();
    expect(ctx.cardDuelQueue).toEqual([1]);
  });

  it('refuses to queue a dead player', () => {
    const { ctx, error } = makeCtx({ dead: new Set([1]) });
    joinCardMinigameQueue(ctx, 1);
    expect(error).toHaveBeenCalled();
    expect(ctx.cardDuelQueue).toEqual([]);
  });

  it('pairs two queued players into a live match on the next update', () => {
    const { ctx } = makeCtx();
    joinCardMinigameQueue(ctx, 1);
    joinCardMinigameQueue(ctx, 2);
    updateCardDuelQueue(ctx);
    expect(ctx.cardDuelQueue.length).toBe(0);
    const match = cardDuelMatchFor(ctx, 1);
    expect(match).not.toBeNull();
    expect(cardDuelMatchFor(ctx, 2)).toBe(match);
  });

  it('resolves a full match to a winner and bumps cardDuelsWon exactly once', () => {
    const { ctx, bumpDeedStat } = makeCtx();
    joinCardMinigameQueue(ctx, 1);
    joinCardMinigameQueue(ctx, 2);
    updateCardDuelQueue(ctx);

    // Drive rounds until the match ends (best-of-3). Side A always plays its
    // highest card and side B its lowest, which reliably breaks pushes so the
    // match converges instead of tying forever.
    let guard = 0;
    while (cardDuelMatchFor(ctx, 1) !== null && guard < 500) {
      const match = cardDuelMatchFor(ctx, 1);
      if (!match) break;
      const highA = Math.max(...match.handA.hand);
      const lowB = Math.min(...match.handB.hand);
      playCardInDuel(ctx, highA, 1);
      playCardInDuel(ctx, lowB, 2);
      guard++;
    }
    expect(cardDuelMatchFor(ctx, 1)).toBeNull();
    expect(cardDuelMatchFor(ctx, 2)).toBeNull();
    expect(bumpDeedStat).toHaveBeenCalledTimes(1);
    expect(bumpDeedStat.mock.calls[0][1]).toBe('cardDuelsWon');
    expect(bumpDeedStat.mock.calls[0][2]).toBe(1);
  });

  it('rejects playing a card not in hand', () => {
    const { ctx, error } = makeCtx();
    joinCardMinigameQueue(ctx, 1);
    joinCardMinigameQueue(ctx, 2);
    updateCardDuelQueue(ctx);
    const match = cardDuelMatchFor(ctx, 1);
    if (!match) throw new Error('expected a live match');
    const notHeld = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].find((v) => !match.handA.hand.includes(v));
    playCardInDuel(ctx, notHeld as number, 1);
    expect(error).toHaveBeenCalledWith(1, "You don't hold that card.");
  });

  it('leaving the queue removes the pid without touching a live match', () => {
    const { ctx } = makeCtx();
    joinCardMinigameQueue(ctx, 3);
    leaveCardMinigameQueue(ctx, 3);
    expect(ctx.cardDuelQueue).toEqual([]);
  });

  it('leaveCardMinigameEntirely forfeits a live match and notifies the opponent', () => {
    const { ctx, emit } = makeCtx();
    joinCardMinigameQueue(ctx, 1);
    joinCardMinigameQueue(ctx, 2);
    updateCardDuelQueue(ctx);
    expect(cardDuelMatchFor(ctx, 1)).not.toBeNull();
    leaveCardMinigameEntirely(ctx, 1);
    expect(cardDuelMatchFor(ctx, 1)).toBeNull();
    expect(cardDuelMatchFor(ctx, 2)).toBeNull();
    expect(emit).toHaveBeenCalledWith(
      expect.objectContaining({ text: 'Your opponent left the Card Duel.', pid: 2 }),
    );
  });
});
