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
//
// Known split: the offline browser Sim and the headless RL env have no real
// wall clock, so their default raidResetMs is `now + 24h` measured against
// sim.time, which restarts at 0 every session. dailyResetDayIndex is then a
// constant `1` for the whole session (0 to <24h of sim time) and the daily set
// never rotates within an offline/headless run. This is intentional, not a
// bug to hide: those hosts have no calendar-day boundary to key off, so
// "daily" degenerates to "rolled once per session" there. Only the
// authoritative server's real 3 AM realm-local boundary gives dailies an
// actual daily rotation.
//
// DST caveat: raidResetMs (server/raid_reset.ts) already resolves the realm-local
// 3 AM boundary through the DST-aware spring-forward/fall-back handling raid
// lockouts use, so the boundary INSTANT itself is correct across a transition.
// What is still a proxy here is flooring that instant to UTC-day granularity: on
// the handful of days a year the local reset lands within one DAY_MS of a UTC day
// boundary shifted by the transition, the floored index can, in principle, repeat
// or skip a day rather than advancing by exactly one. This has no live report
// against it and is lower priority than the durability/cap fixes above; if it is
// ever worth closing precisely, key `day` on the reset instant's realm-local
// calendar date (via the same Intl machinery raid_reset.ts uses) instead of a
// flat UTC floor.
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

/** The subset of PlayerMeta this module reads/writes; kept narrow so this stays
 * a leaf with no dependency on sim.ts's PlayerMeta shape beyond these fields. */
export interface DailyQuestMeta {
  characterId?: string | number;
  entityId: number;
  dailyQuests?: { day: number; questIds: string[] };
  dailyQuestsMeta?: { day: number; consumedIds: string[]; rolledAtLevel: number };
  wireRev: number;
}

/**
 * Roll (or refresh) a player's daily quest set for the current server day, if the
 * NPC they are talking to offers any daily quests and the player has no roll yet,
 * a stale one (a new day boundary has passed), or a roll whose eligible pool has
 * since widened (the character levelled up mid-day past a daily's minLevel, so the
 * first, narrower roll should not stay sticky for the rest of the day). Mutates
 * meta.dailyQuests/dailyQuestsMeta in place and bumps wireRev on a change so the
 * server re-sends the mirrored field on the next snapshot.
 *
 * A re-roll preserves credit for anything already turned in today
 * (dailyQuestsMeta.consumedIds) rather than re-offering it, and caps the OFFERED
 * set at DAILY_QUEST_COUNT minus the already-consumed count (not just
 * DAILY_QUEST_COUNT) so a mid-day level-up re-roll cannot hand out more than
 * DAILY_QUEST_COUNT dailies total for the day.
 *
 * lockoutNowMs/raidResetMs are the same day boundary raid lockouts use
 * (SimContext.lockoutNowMs/SimContext.raidResetMs), taken as plain functions here
 * rather than the whole SimContext so this module stays a leaf.
 */
export function ensureDailyQuests(
  meta: DailyQuestMeta,
  playerLevel: number,
  npcOffersDaily: boolean,
  lockoutNowMs: () => number,
  raidResetMs: (nowMs: number) => number,
): void {
  if (!npcOffersDaily) return;
  const day = dailyResetDayIndex(lockoutNowMs(), raidResetMs);
  const storedMeta =
    meta.dailyQuestsMeta && meta.dailyQuestsMeta.day === day ? meta.dailyQuestsMeta : undefined;
  if (meta.dailyQuests && meta.dailyQuests.day === day) {
    const eligibleGrew = storedMeta
      ? eligibleDailyQuestIds(playerLevel).length >
        eligibleDailyQuestIds(storedMeta.rolledAtLevel).length
      : false;
    if (!eligibleGrew) return;
  }
  const characterId = String(meta.characterId ?? meta.entityId);
  const consumedIds = storedMeta ? storedMeta.consumedIds : [];
  const rolled = rollDailyQuestIds(characterId, day, playerLevel);
  const offered = rolled.filter((id) => !consumedIds.includes(id));
  const remainingSlots = Math.max(0, DAILY_QUEST_COUNT - consumedIds.length);
  meta.dailyQuests = { day, questIds: offered.slice(0, remainingSlots) };
  meta.dailyQuestsMeta = { day, consumedIds, rolledAtLevel: playerLevel };
  meta.wireRev++;
}
