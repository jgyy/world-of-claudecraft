// The raid-boss "living target" resolver shared by the scripted encounters
// (Ignivar, Varkhul). Pure leaf: no host imports, no randomness.
//
// The generic hate-table pass (mob/targeting.ts updateMobTarget) runs first and
// may leave the boss aimed at something the encounter script cannot use: a pet
// (the scripts only ever cycle players), a tank knocked outside the instance
// claim by a knockback, or nothing at all after the target died with an empty
// visible table. The script then needs a living in-room player. That fallback
// used to be "the first player by entity id", which re-seated aggro on an
// arbitrary raider with no relation to the threat meter (reported as a
// low-threat Wolf Form druid pulling Ignivar). It now honors the hate table:
// the living in-room player with the most threat on the boss wins, and only a
// table with no in-room entries at all falls through to the id order the
// callers already sort by (deterministic, so replays stay identical).

import type { Entity } from '../types';

/** Keep the boss on its current aggro target when that target is a living
 * member of `players`; otherwise re-seat it on the highest-threat living
 * member (ties and a threat-less table resolve in `players` order). Writes
 * the choice back to `boss.aggroTargetId` and returns it, or null when nobody
 * in `players` is alive. */
export function resolveLivingTarget(boss: Entity, players: readonly Entity[]): Entity | null {
  const current =
    boss.aggroTargetId === null
      ? null
      : (players.find((player) => player.id === boss.aggroTargetId && !player.dead) ?? null);
  const target = current ?? highestThreatLivingPlayer(boss, players);
  boss.aggroTargetId = target?.id ?? null;
  return target;
}

function highestThreatLivingPlayer(boss: Entity, players: readonly Entity[]): Entity | null {
  let best: Entity | null = null;
  let bestThreat = Number.NEGATIVE_INFINITY;
  for (const player of players) {
    if (player.dead) continue;
    const threat = boss.threat.get(player.id) ?? 0;
    if (threat > bestThreat) {
      best = player;
      bestThreat = threat;
    }
  }
  return best;
}
