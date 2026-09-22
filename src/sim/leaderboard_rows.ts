// The offline lifetime-XP leaderboard rows (Max-Level XP Overflow): rank the
// players a local sim knows about by lifetime XP, then level, then name, in
// the LeaderboardEntry shape the server fill also produces, so both worlds
// page through the same helper and render alike. A pure function of the
// player roster, extracted from the Sim.leaderboard facade delegate (which
// now only pages these rows) so the sort and the row shape are testable
// without a Sim. `virtualLevel` is derived here exactly as the server does.
import type { LeaderboardEntry } from '../world_api/progression_xp';
import type { PlayerMeta } from './sim';
import { type Entity, virtualLevel } from './types';

export function offlineLeaderboardRows(
  players: Iterable<PlayerMeta>,
  entityOf: (entityId: number) => Entity | undefined,
): LeaderboardEntry[] {
  return [...players]
    .map((m) => {
      const e = entityOf(m.entityId);
      return e ? { meta: m, e } : null;
    })
    .filter((x): x is { meta: PlayerMeta; e: Entity } => x !== null)
    .sort(
      (a, b) =>
        b.meta.lifetimeXp - a.meta.lifetimeXp ||
        b.e.level - a.e.level ||
        a.meta.name.localeCompare(b.meta.name),
    )
    .map(({ meta, e }, i) => ({
      rank: i + 1,
      name: meta.name,
      cls: meta.cls,
      level: e.level,
      virtualLevel: virtualLevel(meta.lifetimeXp),
      lifetimeXp: meta.lifetimeXp,
      prestigeRank: meta.prestigeRank,
      // the selected Book of Deeds title (a deed id), like the server fill
      title: meta.activeTitle,
      // The guild tag beside the name, read off the passive display field the
      // host stamps (setPlayerGuild). Omitted rather than empty, like the server
      // fill; offline that is always the case, since guilds are server-only.
      ...(e.guild ? { guild: e.guild } : {}),
    }));
}
