// The Card Duel minigame: a class-agnostic 1v1 push-your-luck card game,
// hosted by the Card Master NPC (src/sim/content/card_master.ts). Deliberately
// NOT built on top of src/sim/social/duel.ts's HP-based DuelState: that system
// is combat-coupled (forfeit-by-death, HP dueling range, ccDr clearing) and
// growing it for a non-combat minigame would be the wrong seam. This module
// owns its own live match state on SimContext, following the same "own module
// behind the seam" shape as arena.ts / duel.ts.
//
// Determinism: every card draw goes through ctx.rng (never Math.random).
// Server-authoritative: rounds resolve here once both sides have played, never
// client-side.

import {
  type CardHandState,
  createCardHand,
  drawOne,
  playCard as playCardFromHand,
} from '../minigames/card_hand';
import { cardMasterInRange } from '../instances/card_master';
import type { SimContext } from '../sim_context';
import {
  type CardDuelQueue,
  isQueuedForCardDuel,
  joinCardDuelQueue,
  leaveCardDuelQueue,
  tryPairCardDuel,
} from './card_duel_queue';

// Best-of-3 rounds; first to 2 round wins takes the match.
export const CARD_DUEL_ROUNDS_TO_WIN = 2;

export interface CardDuelMatch {
  a: number;
  b: number;
  handA: CardHandState;
  handB: CardHandState;
  playedA: number | null;
  playedB: number | null;
  roundsA: number;
  roundsB: number;
}

// The IWorldCardMinigame read-surface shape (src/world_api/card_minigame.ts
// imports this rather than sim depending on world_api, per the IWorld seam
// direction: world_api reads sim types, never the reverse).
export interface CardMinigameInfo {
  queued: boolean;
  match: {
    opponent: { pid: number; name: string };
    hand: number[];
    deckCount: number;
    discardCount: number;
    myRounds: number;
    opponentRounds: number;
    waitingOnOpponent: boolean;
  } | null;
}

export function inCardDuel(ctx: SimContext, pid: number): boolean {
  return ctx.cardDuels.has(pid);
}

export function cardDuelMatchFor(ctx: SimContext, pid: number): CardDuelMatch | null {
  return ctx.cardDuels.get(pid) ?? null;
}

export function joinCardMinigameQueue(ctx: SimContext, pid?: number): void {
  const r = ctx.resolve(pid);
  if (!r) return;
  if (r.e.dead) {
    ctx.error(r.meta.entityId, "You can't do that while dead.");
    return;
  }
  if (!cardMasterInRange(ctx, r.e)) {
    ctx.error(r.meta.entityId, 'You must be at the Card Master to queue for a Card Duel.');
    return;
  }
  const result = joinCardDuelQueue(ctx.cardDuelQueue, r.meta.entityId, inCardDuel(ctx, r.meta.entityId));
  if (!result.ok) {
    ctx.error(
      r.meta.entityId,
      result.reason === 'already_in_duel'
        ? 'You are already in a Card Duel.'
        : 'You are already queued for a Card Duel.',
    );
    return;
  }
  ctx.emit({ type: 'log', text: 'You queue for a Card Duel.', color: '#fa6', pid: r.meta.entityId });
}

export function leaveCardMinigameQueue(ctx: SimContext, pid?: number): void {
  const r = ctx.resolve(pid);
  if (!r) return;
  if (leaveCardDuelQueue(ctx.cardDuelQueue, r.meta.entityId)) {
    ctx.emit({ type: 'log', text: 'You leave the Card Duel queue.', color: '#fa6', pid: r.meta.entityId });
  }
}

export function isQueuedForCardMinigame(ctx: SimContext, pid: number): boolean {
  return isQueuedForCardDuel(ctx.cardDuelQueue, pid);
}

function startCardDuelMatch(ctx: SimContext, a: number, b: number): void {
  const match: CardDuelMatch = {
    a,
    b,
    handA: createCardHand(ctx.rng),
    handB: createCardHand(ctx.rng),
    playedA: null,
    playedB: null,
    roundsA: 0,
    roundsB: 0,
  };
  ctx.cardDuels.set(a, match);
  ctx.cardDuels.set(b, match);
  const aMeta = ctx.players.get(a);
  const bMeta = ctx.players.get(b);
  for (const [pid, opponent] of [
    [a, bMeta],
    [b, aMeta],
  ] as const) {
    ctx.emit({
      type: 'log',
      text: `Your Card Duel against ${opponent?.name ?? 'an opponent'} begins!`,
      color: '#fa6',
      pid,
    });
  }
}

// Called every tick from Sim (like updateDuels/updateArena): pairs waiting
// players off the queue and starts a match for each pair.
export function updateCardDuelQueue(ctx: SimContext): void {
  let pair = tryPairCardDuel(ctx.cardDuelQueue);
  while (pair) {
    const [a, b] = pair;
    // A player can leave/disconnect between queueing and pairing; drop pairs
    // where either side no longer exists.
    if (ctx.players.has(a) && ctx.players.has(b)) {
      startCardDuelMatch(ctx, a, b);
    }
    pair = tryPairCardDuel(ctx.cardDuelQueue);
  }
}

function handFor(match: CardDuelMatch, pid: number): CardHandState {
  return pid === match.a ? match.handA : match.handB;
}

export function playCardInDuel(ctx: SimContext, cardValue: number, pid?: number): void {
  const r = ctx.resolve(pid);
  if (!r) return;
  const match = ctx.cardDuels.get(r.meta.entityId);
  if (!match) {
    ctx.error(r.meta.entityId, 'You are not in a Card Duel.');
    return;
  }
  const isA = r.meta.entityId === match.a;
  if ((isA && match.playedA !== null) || (!isA && match.playedB !== null)) {
    ctx.error(r.meta.entityId, 'You already played a card this round.');
    return;
  }
  const played = playCardFromHand(handFor(match, r.meta.entityId), cardValue);
  if (played === null) {
    ctx.error(r.meta.entityId, "You don't hold that card.");
    return;
  }
  if (isA) match.playedA = played;
  else match.playedB = played;
  if (match.playedA !== null && match.playedB !== null) {
    resolveRound(ctx, match);
  }
}

function resolveRound(ctx: SimContext, match: CardDuelMatch): void {
  const a = match.playedA as number;
  const b = match.playedB as number;
  if (a > b) match.roundsA++;
  else if (b > a) match.roundsB++;
  // a === b: a push, neither side scores.
  match.playedA = null;
  match.playedB = null;
  drawOne(ctx.rng, match.handA);
  drawOne(ctx.rng, match.handB);
  for (const pid of [match.a, match.b]) {
    const mine = pid === match.a ? a : b;
    const theirs = pid === match.a ? b : a;
    ctx.emit({
      type: 'log',
      text: `Card Duel round: you played ${mine}, opponent played ${theirs}.`,
      color: '#fa6',
      pid,
    });
  }
  if (match.roundsA >= CARD_DUEL_ROUNDS_TO_WIN) {
    endCardDuelMatch(ctx, match, match.a);
  } else if (match.roundsB >= CARD_DUEL_ROUNDS_TO_WIN) {
    endCardDuelMatch(ctx, match, match.b);
  }
}

function endCardDuelMatch(ctx: SimContext, match: CardDuelMatch, winnerPid: number): void {
  ctx.cardDuels.delete(match.a);
  ctx.cardDuels.delete(match.b);
  const loserPid = winnerPid === match.a ? match.b : match.a;
  const winnerMeta = ctx.players.get(winnerPid);
  const loserMeta = ctx.players.get(loserPid);
  if (winnerMeta) ctx.bumpDeedStat(winnerMeta, 'cardDuelsWon', 1);
  for (const pid of [match.a, match.b]) {
    ctx.emit({
      type: 'log',
      text:
        pid === winnerPid
          ? `You win the Card Duel against ${loserMeta?.name ?? 'your opponent'}!`
          : `You lose the Card Duel against ${winnerMeta?.name ?? 'your opponent'}.`,
      color: '#fa6',
      pid,
    });
  }
}

// Drops a player from the queue and/or forfeits their live match (leave-path /
// disconnect handling, mirroring duelFor's forfeit-on-death shape).
export function leaveCardMinigameEntirely(ctx: SimContext, pid: number): void {
  leaveCardDuelQueue(ctx.cardDuelQueue, pid);
  const match = ctx.cardDuels.get(pid);
  if (!match) return;
  const otherPid = pid === match.a ? match.b : match.a;
  ctx.cardDuels.delete(match.a);
  ctx.cardDuels.delete(match.b);
  const otherMeta = ctx.players.get(otherPid);
  if (otherMeta) {
    ctx.emit({
      type: 'log',
      text: 'Your opponent left the Card Duel.',
      color: '#fa6',
      pid: otherPid,
    });
  }
}

export type { CardDuelQueue };
