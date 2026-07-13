// Card Duel: a dedicated 1v1 PvP queue restricted to the Card Adept class. Pure,
// deterministic matchmaking core (no SimContext, no rng): a FIFO of waiting pids
// and the pairing rule. The live Sim owns the queue state and drives pairing from
// the tick, starting a duel between each matched pair. Kept pure so a Vitest
// exercises the join/leave/pair rules directly.

export type CardDuelJoinResult =
  | { ok: true }
  | { ok: false; reason: 'not_card_adept' | 'already_queued' | 'in_duel' };

// A FIFO queue of pids waiting for a Card Duel match, oldest first.
export type CardDuelQueue = number[];

export function createCardDuelQueue(): CardDuelQueue {
  return [];
}

// Attempt to enqueue `pid`. Only Card Adepts may queue; a pid already queued or
// already in a duel is rejected without mutating the queue.
export function joinCardDuelQueue(
  queue: CardDuelQueue,
  pid: number,
  isCardAdept: boolean,
  inDuel: boolean,
): CardDuelJoinResult {
  if (!isCardAdept) return { ok: false, reason: 'not_card_adept' };
  if (inDuel) return { ok: false, reason: 'in_duel' };
  if (queue.includes(pid)) return { ok: false, reason: 'already_queued' };
  queue.push(pid);
  return { ok: true };
}

// Remove `pid` from the queue if present. Returns whether it was queued.
export function leaveCardDuelQueue(queue: CardDuelQueue, pid: number): boolean {
  const idx = queue.indexOf(pid);
  if (idx < 0) return false;
  queue.splice(idx, 1);
  return true;
}

export function isQueuedForCardDuel(queue: CardDuelQueue, pid: number): boolean {
  return queue.includes(pid);
}

export function cardDuelQueueSize(queue: CardDuelQueue): number {
  return queue.length;
}

// Pop the two oldest waiting pids as a match, or null if fewer than two wait.
// FIFO so the longest-waiting players pair first (fair, deterministic).
export function tryPairCardDuel(queue: CardDuelQueue): [number, number] | null {
  if (queue.length < 2) return null;
  const a = queue.shift() as number;
  const b = queue.shift() as number;
  return [a, b];
}
