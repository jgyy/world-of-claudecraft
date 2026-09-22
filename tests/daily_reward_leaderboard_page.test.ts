// The daily-reward leaderboard page normalization
// (src/net/daily_reward_leaderboard_page.ts), extracted from the ClientWorld
// fetcher: the empty page a failed fetch resolves to, and the per-field
// defaults a partial body is filled with.
import { describe, expect, it } from 'vitest';
import {
  dailyRewardLeaderboardPageFrom,
  emptyDailyRewardLeaderboardPage,
} from '../src/net/daily_reward_leaderboard_page';

describe('daily reward leaderboard page', () => {
  it('the empty page keeps the requested page size and one empty page', () => {
    expect(emptyDailyRewardLeaderboardPage(25)).toEqual({
      day: '',
      leaders: [],
      page: 0,
      pageCount: 1,
      total: 0,
      pageSize: 25,
    });
  });

  it('fills every missing field from the request, and total from the leaders when absent', () => {
    const leaders = [{ rank: 1, name: 'Ada', points: 9, me: false }];
    expect(dailyRewardLeaderboardPageFrom({ leaders }, 2, 10)).toEqual({
      day: '',
      leaders,
      page: 2,
      pageCount: 1,
      total: 1,
      pageSize: 10,
    });
    expect(dailyRewardLeaderboardPageFrom(null, 0, 10)).toEqual(
      emptyDailyRewardLeaderboardPage(10),
    );
  });

  it('keeps every field a full body carries', () => {
    const body = { day: '2026-09-22', leaders: [], page: 3, pageCount: 4, total: 31, pageSize: 8 };
    expect(dailyRewardLeaderboardPageFrom(body, 0, 10)).toEqual(body);
  });
});
