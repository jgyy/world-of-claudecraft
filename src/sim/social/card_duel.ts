// Card Duel: the 1v1 Card Adept PvP match. Restricted to the Card Adept class and
// fought in a real arena slot (unlike an ordinary in-place duel), so it follows the
// arena's slot-allocation and return-teleport contract (see social/arena.ts):
// allocate a free slot, reserve it in arenaBusySlots, stash each fighter's
// pre-teleport position, place them via placeInArena (which sets prevFacing and
// rebuckets), and restore + release on end (endDuel reads DuelState.cardArena).
//
// The matchmaking FIFO itself is the pure leaf social/card_duel_queue.ts; this
// module is the SimContext-facing driver the coordinator calls from the tick.

import { arenaOrigin, DUNGEON_X_THRESHOLD } from '../data';
import { ARENA_SPAWN_A, ARENA_SPAWN_B } from '../dungeon_layout';
import type { DuelState } from '../sim';
import type { SimContext } from '../sim_context';
import { freeArenaSlot, placeInArena } from './arena';
import {
  isQueuedForCardDuel,
  joinCardDuelQueue,
  leaveCardDuelQueue,
  cardDuelQueueSize as queueSize,
  tryPairCardDuel,
} from './card_duel_queue';
import { DUEL_COUNTDOWN } from './duel';

// Join or leave the Card Adept 1v1 Card Duel queue. Only Card Adepts may join, and
// (mirroring arenaQueueJoin) a dead player, one already in an arena match or a duel,
// one mid-trade, or one inside an instance is refused, so a player can never be
// yanked out of instanced or committed content with no consent moment.
export function queueCardDuel(ctx: SimContext, join: boolean, pid?: number): void {
  const r = ctx.resolve(pid);
  if (!r) return;
  const { e, meta } = r;
  const id = meta.entityId;
  if (!join) {
    leaveCardDuelQueue(ctx.cardDuelQueue, id);
    return;
  }
  // Not a Card Adept and already-queued/in-duel are silent: the UI gates the button
  // to eligible players and reflects queue state via cardDuelInfo(). The remaining
  // gates emit, matching arenaQueueJoin, because they are states the UI cannot see.
  if (meta.cls !== 'card_adept') return;
  if (isQueuedForCardDuel(ctx.cardDuelQueue, id) || ctx.duels.has(id)) return;
  if (e.dead) {
    ctx.error(id, 'You cannot queue for a Card Duel while dead.');
    return;
  }
  if (ctx.arenaMatches.has(id)) {
    ctx.error(id, 'You are already in an arena match.');
    return;
  }
  if (ctx.trades.has(id)) {
    ctx.error(id, 'Finish your trade before queueing.');
    return;
  }
  if (e.pos.x > DUNGEON_X_THRESHOLD) {
    ctx.error(id, 'You cannot queue from inside an instance.');
    return;
  }
  joinCardDuelQueue(ctx.cardDuelQueue, id, true, false);
}

export function cardDuelQueued(ctx: SimContext, pid?: number): boolean {
  const r = ctx.resolve(pid);
  return r ? isQueuedForCardDuel(ctx.cardDuelQueue, r.meta.entityId) : false;
}

export function cardDuelQueueSize(ctx: SimContext): number {
  return queueSize(ctx.cardDuelQueue);
}

export function cardDuelInfo(
  ctx: SimContext,
  pid?: number,
): import('../../world_api').CardDuelInfo {
  return { queued: cardDuelQueued(ctx, pid), queueSize: cardDuelQueueSize(ctx) };
}

// Pairing phase: prune stale entrants, then match the two longest-waiting Card
// Adepts and start a bout per pair. Draws no rng and only touches the Card Duel
// queue, so a world with no queued Card Adepts is unaffected (parity-safe).
export function updateCardDuelQueue(ctx: SimContext): void {
  // Drop any stale entrant (logged out, already dueling, or now inside an instance
  // after queueing) before pairing, mirroring the queue-time gates.
  for (const qpid of [...ctx.cardDuelQueue]) {
    const e = ctx.entities.get(qpid);
    if (!e || ctx.duels.has(qpid) || e.pos.x > DUNGEON_X_THRESHOLD || e.dead) {
      leaveCardDuelQueue(ctx.cardDuelQueue, qpid);
    }
  }
  for (;;) {
    const pair = tryPairCardDuel(ctx.cardDuelQueue);
    if (!pair) break;
    startCardDuel(ctx, pair[0], pair[1]);
  }
}

// Start a Card Duel between two paired pids: allocate an arena slot, stash both
// return positions, teleport both fighters into the pit facing each other, and
// open the duel countdown. Skips (re-queuing neither) if no arena slot is free.
export function startCardDuel(ctx: SimContext, aPid: number, bPid: number): void {
  const ea = ctx.entities.get(aPid);
  const eb = ctx.entities.get(bPid);
  if (!ea || !eb) return;
  const slot = freeArenaSlot(ctx);
  if (slot === null) {
    // No free slot: put the longest-waiting pair back at the front of the FIFO so
    // they pair again next tick a slot frees, never silently dropped.
    ctx.cardDuelQueue.unshift(bPid);
    ctx.cardDuelQueue.unshift(aPid);
    return;
  }
  ctx.arenaBusySlots.add(slot);
  const returns = new Map<number, { x: number; z: number; facing: number }>();
  returns.set(aPid, { x: ea.pos.x, z: ea.pos.z, facing: ea.facing });
  returns.set(bPid, { x: eb.pos.x, z: eb.pos.z, facing: eb.facing });
  const origin = arenaOrigin(slot);
  placeInArena(ctx, ea, origin, ARENA_SPAWN_A);
  placeInArena(ctx, eb, origin, ARENA_SPAWN_B);
  const duel: DuelState = {
    a: aPid,
    b: bPid,
    state: 'countdown',
    timer: DUEL_COUNTDOWN,
    cardArena: { slot, returns },
  };
  ctx.duels.set(aPid, duel);
  ctx.duels.set(bPid, duel);
  for (const dPid of [aPid, bPid]) {
    ctx.emit({ type: 'duelCountdown', seconds: DUEL_COUNTDOWN, pid: dPid });
  }
}
