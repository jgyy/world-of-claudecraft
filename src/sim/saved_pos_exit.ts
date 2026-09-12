// Where a durable character save resolves on rejoin, BEFORE the sim's
// collision migration (findSafePos) runs. Pure and host-agnostic: the sim's
// addPlayer applies it to place the character, and the server's character
// list applies it to label each roster row with the zone the character will
// stand in on login (a character saved inside an instance is at that
// instance's door, not "inside" a dungeon nobody can rejoin).
import {
  DELVE_LIST,
  DUNGEON_LIST,
  DUNGEON_X_THRESHOLD,
  delveAt,
  dungeonAt,
  isBgPos,
  isDelvePos,
  migrateLegacyInstancePos,
  zoneAt,
} from './data';

export interface SavedPos {
  x: number;
  z: number;
}

export interface SavedPosExit {
  /** The rejoin position, or null when the save resumes at the world start. */
  pos: SavedPos | null;
  /** True when `pos` is an authored instance door (delve, dungeon, or a legacy
   *  instance-plane save resolved to its door): the collision migration must not
   *  walk it off the door the content author placed. */
  instanceExit: boolean;
}

/**
 * Characters saved inside a dungeon instance rejoin at its entrance: their old
 * instance is gone (or belongs to someone else) by now.
 *
 * Delve must be checked BEFORE the dungeon branch: dungeonAt() returns null for
 * any x >= ARENA_X_MIN (which includes the delve band), so the dungeon branch's
 * `?? DUNGEON_LIST[0]` fallback would otherwise swallow a delve position and
 * eject the player to a dungeon door instead of the board door (FR-1.6). The
 * two bands are disjoint, so `else if` keeps dungeon handling intact.
 *
 * Saves from before the instance plane moved east (see data.ts) resolve all
 * the way to their door first, so they ARE an instance exit and take the same
 * exemption the two band branches do.
 */
export function resolveSavedPosExit(saved: SavedPos | null | undefined): SavedPosExit {
  let pos: SavedPos | null = saved ? { x: saved.x, z: saved.z } : null;
  let instanceExit = false;
  if (pos) {
    const migrated = migrateLegacyInstancePos(pos);
    if (migrated) {
      pos = migrated;
      instanceExit = true;
    }
  }
  if (pos && isBgPos(pos.x)) {
    // A save inside the Thornhollow Fields band (a crash mid-match) has no match
    // to rejoin: resume at the world start (dungeonAt() knows nothing about this
    // band, so the dungeon-door fallback below must never see it).
    return { pos: null, instanceExit: false };
  }
  if (pos && isDelvePos(pos.x)) {
    const delve = delveAt(pos.x) ?? DELVE_LIST[0];
    return { pos: { x: delve.doorPos.x, z: delve.doorPos.z - 4 }, instanceExit: true };
  }
  if (pos && pos.x > DUNGEON_X_THRESHOLD) {
    const dungeon = dungeonAt(pos.x) ?? DUNGEON_LIST[0];
    return { pos: { x: dungeon.doorPos.x, z: dungeon.doorPos.z - 4 }, instanceExit: true };
  }
  return { pos, instanceExit };
}

/**
 * The id of the zone a saved character stands in on login (the rejoin
 * position above, resolved through zoneAt), or null when the save resumes at
 * the world start (a mid-match battleground save) or has no position yet.
 * Character select labels each roster row with this, so the account owner can
 * see where every character is without logging each one in.
 */
export function savedZoneId(saved: SavedPos | null | undefined): string | null {
  const exit = resolveSavedPosExit(saved);
  return exit.pos ? zoneAt(exit.pos.x, exit.pos.z).id : null;
}
