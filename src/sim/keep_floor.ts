// Bespoke per-player "activeFloor" local-area state for the Eastbrook Vale
// keep ONLY (content/keep.ts). colliders.ts (and the rest of the sim) is
// column-based: one height/collider set per (x,z), so true stacked floors at
// the identical footprint can't be represented by a single height field. This
// is deliberately NOT a generic multi-level engine: it is one small pure
// function plus a matching collider-set picker, both scoped to the keep's
// fixed footprint, following the existing door-trigger precedent in
// instances/dungeons.ts (proximity check during the per-player tick loop)
// but flipping a floor flag instead of teleporting.

import { KEEP_STAIRS } from './content/keep';
import { isInsideKeepFootprint } from './voxel_building';

/** 0 = outside the keep (or never entered); 1..3 = the floor the player is
 * currently standing on inside the keep. */
export type ActiveFloor = 0 | 1 | 2 | 3;

// Walking within a landing's radius while on its `fromFloor` steps you up to
// `toFloor`; walking within it while on `toFloor` steps you back down. This
// makes each landing a two-way staircase, matching "walk up, walk back down
// the same door" (no separate exit-portal concept).
function landingTransition(floor: ActiveFloor, x: number, z: number): ActiveFloor | null {
  for (const s of KEEP_STAIRS) {
    const dx = x - s.x;
    const dz = z - s.z;
    if (dx * dx + dz * dz > s.r * s.r) continue;
    if (floor === s.fromFloor) return s.toFloor;
    if (floor === s.toFloor) return s.fromFloor;
  }
  return null;
}

/**
 * Pure state-transition function: given the player's previous activeFloor
 * and their current (x,z), returns the next activeFloor. Called once per
 * player per tick (see sim.ts's per-player loop), same spirit as the
 * dungeon-door proximity check.
 *
 * - Outside the footprint: always 0 (walking away resets it, ready to walk
 *   back in the same door; there is no exit-portal concept).
 * - Just walked in (was 0, now inside): floor 1 (the ground floor the door
 *   opens onto).
 * - Already inside: stays on the current floor unless standing on a stair
 *   landing trigger, which steps one floor up or down.
 */
export function nextActiveFloor(prevFloor: ActiveFloor, x: number, z: number): ActiveFloor {
  if (!isInsideKeepFootprint(x, z)) return 0;
  if (prevFloor === 0) return 1;
  const landed = landingTransition(prevFloor, x, z);
  return landed ?? prevFloor;
}
