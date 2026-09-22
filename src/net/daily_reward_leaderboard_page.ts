// The daily-reward leaderboard page's response normalization: the empty page
// a failed or malformed fetch resolves to, and the field-by-field fill of a
// server body (every field defaulted, so a partial body still renders). Pure,
// extracted from the ClientWorld fetcher so the shape is testable without a
// network.
import type { DailyRewardLeaderboardPage } from '../world_api/daily_rewards';

export function emptyDailyRewardLeaderboardPage(pageSize: number): DailyRewardLeaderboardPage {
  return { day: '', leaders: [], page: 0, pageCount: 1, total: 0, pageSize };
}

export function dailyRewardLeaderboardPageFrom(
  data: Partial<DailyRewardLeaderboardPage> | null | undefined,
  page: number,
  pageSize: number,
): DailyRewardLeaderboardPage {
  return {
    day: data?.day ?? '',
    leaders: data?.leaders ?? [],
    page: data?.page ?? page,
    pageCount: data?.pageCount ?? 1,
    total: data?.total ?? data?.leaders?.length ?? 0,
    pageSize: data?.pageSize ?? pageSize,
  };
}
