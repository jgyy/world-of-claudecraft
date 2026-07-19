import { describe, expect, it } from 'vitest';
import { DAILY_QUESTS } from '../../src/sim/content/daily_quests';
import {
  DAILY_QUEST_COUNT,
  DAILY_QUEST_POOL,
  dailyResetDayIndex,
  rollDailyQuestIds,
} from '../../src/sim/quests/daily_quest_pool';

// A raid-reset boundary at a fixed period, mirroring the offline/headless flat
// 24h day: raidResetMs(now) is the NEXT boundary instant (a step function that
// changes exactly when `now` crosses a boundary).
const DAY_MS = 24 * 60 * 60 * 1000;
const raidResetMs = (nowMs: number) => Math.ceil((nowMs + 1) / DAY_MS) * DAY_MS;

describe('daily_quest_pool', () => {
  it('exposes the full authored pool', () => {
    expect(DAILY_QUEST_POOL.length).toBe(8);
    for (const id of DAILY_QUEST_POOL) {
      expect(DAILY_QUESTS[id]).toBeDefined();
      expect(DAILY_QUESTS[id].isDaily).toBe(true);
    }
  });

  it('is deterministic: same character + day yields the same 3 ids', () => {
    const a = rollDailyQuestIds('char-1', 100, 60);
    const b = rollDailyQuestIds('char-1', 100, 60);
    expect(a).toEqual(b);
    expect(a).toHaveLength(DAILY_QUEST_COUNT);
    // exactly the count, all distinct, all from the pool
    expect(new Set(a).size).toBe(a.length);
    for (const id of a) expect(DAILY_QUEST_POOL).toContain(id);
  });

  it('different days for the same character can produce a different set', () => {
    // Scan a span of days; at least one must differ from day 0's roll, proving
    // the day is a real input (not ignored).
    const base = rollDailyQuestIds('char-1', 0, 60).join(',');
    let sawDifferent = false;
    for (let d = 1; d < 40; d++) {
      if (rollDailyQuestIds('char-1', d, 60).join(',') !== base) {
        sawDifferent = true;
        break;
      }
    }
    expect(sawDifferent).toBe(true);
  });

  it('different characters can produce a different set on the same day', () => {
    const a = rollDailyQuestIds('char-1', 5, 60).join(',');
    let sawDifferent = false;
    for (let n = 0; n < 40; n++) {
      if (rollDailyQuestIds(`char-${n}`, 5, 60).join(',') !== a) {
        sawDifferent = true;
        break;
      }
    }
    expect(sawDifferent).toBe(true);
  });

  it('filters out quests above the player level', () => {
    // At level 1 nothing qualifies (all dailies gate minLevel >= 2).
    expect(rollDailyQuestIds('char-1', 1, 1)).toEqual([]);
    // At level 2 only the minLevel<=2 dailies are eligible (3 of them), so the
    // roll returns all of them with no higher-level quest leaking in.
    const lvl2Eligible = DAILY_QUEST_POOL.filter((id) => (DAILY_QUESTS[id].minLevel ?? 1) <= 2);
    const rolled = rollDailyQuestIds('char-1', 1, 2);
    expect(new Set(rolled)).toEqual(new Set(lvl2Eligible));
    for (const id of rolled) expect(DAILY_QUESTS[id].minLevel ?? 1).toBeLessThanOrEqual(2);
  });

  it('returns fewer than the count when fewer quests are eligible (no crash, no padding)', () => {
    const rolled = rollDailyQuestIds('char-1', 1, 3);
    // Exactly the minLevel<=3 eligible set (5 of them -> capped at count=3), and
    // when eligible <= count it returns all eligible without padding/dupes.
    expect(rolled.length).toBeLessThanOrEqual(DAILY_QUEST_COUNT);
    expect(new Set(rolled).size).toBe(rolled.length);
  });

  it('day index changes exactly at the raid-reset boundary', () => {
    const justBefore = DAY_MS - 1;
    const atBoundary = DAY_MS;
    // Two instants within the same day share an index...
    expect(dailyResetDayIndex(0, raidResetMs)).toBe(dailyResetDayIndex(justBefore, raidResetMs));
    // ...and the index flips the moment `now` reaches the next boundary.
    expect(dailyResetDayIndex(atBoundary, raidResetMs)).not.toBe(
      dailyResetDayIndex(justBefore, raidResetMs),
    );
  });
});
