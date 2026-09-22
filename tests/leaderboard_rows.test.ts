// The offline lifetime-XP leaderboard rows (src/sim/leaderboard_rows.ts),
// extracted from the Sim.leaderboard facade: the sort (lifetime XP, then
// level, then name), the row shape, the derived virtual level, the guild tag
// omitted rather than empty, and players whose entity is gone left out.
import { describe, expect, it } from 'vitest';
import { offlineLeaderboardRows } from '../src/sim/leaderboard_rows';
import type { PlayerMeta } from '../src/sim/sim';
import { type Entity, virtualLevel, xpToReachLevel } from '../src/sim/types';

function meta(entityId: number, name: string, lifetimeXp: number, extra: Partial<PlayerMeta> = {}) {
  return { entityId, name, cls: 'warrior', lifetimeXp, prestigeRank: 0, ...extra } as PlayerMeta;
}

function entity(level: number, guild?: string): Entity {
  return { level, ...(guild ? { guild } : {}) } as Entity;
}

describe('offlineLeaderboardRows', () => {
  it('ranks by lifetime XP, then level, then name, in the shared row shape', () => {
    const entities = new Map<number, Entity>([
      [1, entity(20, 'Ember')],
      [2, entity(20)],
      [3, entity(19)],
      [4, entity(20)],
    ]);
    const rows = offlineLeaderboardRows(
      [
        meta(1, 'Ada', xpToReachLevel(25), { prestigeRank: 2, activeTitle: 'veteran' }),
        meta(2, 'Zed', xpToReachLevel(25)),
        meta(3, 'Kim', xpToReachLevel(25)),
        meta(4, 'Bo', xpToReachLevel(22)),
        meta(5, 'Ghost', xpToReachLevel(30)),
      ],
      (id) => entities.get(id),
    );
    expect(rows.map((r) => [r.rank, r.name])).toEqual([
      [1, 'Ada'],
      [2, 'Zed'],
      [3, 'Kim'],
      [4, 'Bo'],
    ]);
    expect(rows[0]).toEqual({
      rank: 1,
      name: 'Ada',
      cls: 'warrior',
      level: 20,
      virtualLevel: virtualLevel(xpToReachLevel(25)),
      lifetimeXp: xpToReachLevel(25),
      prestigeRank: 2,
      title: 'veteran',
      guild: 'Ember',
    });
    expect('guild' in rows[1]).toBe(false);
  });

  it('answers an empty roster with no rows', () => {
    expect(offlineLeaderboardRows([], () => undefined)).toEqual([]);
  });
});
