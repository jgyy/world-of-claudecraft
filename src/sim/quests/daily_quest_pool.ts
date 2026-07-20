// Pure leaf: the daily-quest rotation math. No SimContext, no DOM, no shared
// Rng: it imports only the daily quest content records and computes with a
// small self-contained seeded PRNG, so a Vitest imports it directly and both
// hosts (offline Sim, authoritative server) roll the identical set.
//
// Determinism (root CLAUDE.md invariant, enforced by tests/architecture.test.ts):
// no Math.random / Date.now / performance.now. The per-character daily roll is a
// deterministic function of (characterId, day), where `day` is an integer that
// changes exactly when the host's raid-reset boundary rolls over.

import { DAILY_QUEST_ORDER, DAILY_QUESTS } from '../content/daily_quests';

/** The full pool of daily quest ids, in authored order. */
export const DAILY_QUEST_POOL: string[] = [...DAILY_QUEST_ORDER];

/** How many dailies a character is offered per day. */
export const DAILY_QUEST_COUNT = 3;

const DAY_MS = 24 * 60 * 60 * 1000;

// The integer server-day index the daily roll is keyed to. raidResetMs(now)
// returns the NEXT reset instant; on the authoritative server that is a step
// function (the realm-local 3 AM boundary), constant across a day and jumping at
// the boundary raid lockouts already use. Flooring it to day granularity yields
// consecutive per-day integers there, and keeps the index stable within a day
// for the offline/headless fallback (a flat now+24h boundary), so the dailies do
// not re-roll on every talk. The index changes exactly when the boundary rolls
// over.
export function dailyResetDayIndex(nowMs: number, raidResetMs: (nowMs: number) => number): number {
  return Math.floor(raidResetMs(nowMs) / DAY_MS);
}

// FNV-1a 32-bit string hash -> a numeric seed for mulberry32. Local + self
// contained on purpose (no dependency on the sim's shared Rng stream).
function fnv1a(str: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    // 32-bit FNV prime multiply via shifts to stay in 32-bit range.
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

// Tiny local mulberry32 PRNG. Returns a function yielding [0, 1).
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * The full set of daily quest ids a character at the given level qualifies for,
 * in pool order (before the per-day shuffle/cap). Exported so callers can detect
 * a level-up widening the eligible pool without re-deriving the roll itself.
 */
export function eligibleDailyQuestIds(playerLevel: number): string[] {
  return DAILY_QUEST_POOL.filter((id) => {
    const minLevel = DAILY_QUESTS[id]?.minLevel ?? 1;
    return playerLevel >= minLevel;
  });
}

/**
 * Deterministically pick up to DAILY_QUEST_COUNT daily quest ids for a character
 * on a given day, filtered to quests the character's level qualifies for. The
 * same (characterId, day) always yields the same set; different days may differ.
 * If fewer than DAILY_QUEST_COUNT quests are eligible, returns all eligible ones.
 */
export function rollDailyQuestIds(characterId: string, day: number, playerLevel: number): string[] {
  const eligible = eligibleDailyQuestIds(playerLevel);
  if (eligible.length <= DAILY_QUEST_COUNT) return eligible;
  const rand = mulberry32(fnv1a(`${characterId}:${day}`));
  // Fisher-Yates shuffle of a copy, then take the first N. Draws come only from
  // this local PRNG, never the sim's shared stream.
  const pool = [...eligible];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    const tmp = pool[i];
    pool[i] = pool[j];
    pool[j] = tmp;
  }
  return pool.slice(0, DAILY_QUEST_COUNT);
}
