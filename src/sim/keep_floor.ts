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

/** 0 = outside the keep (or never entered); 1..4 = the four full stories the
 * player is currently standing on inside the keep; 5 = the attic. */
export type ActiveFloor = 0 | 1 | 2 | 3 | 4 | 5;

/** activeFloor plus which landing (index into KEEP_STAIRS, or -1) the
 * player is currently standing inside, so a landing transitions EXACTLY
 * ONCE per approach (edge-triggered) instead of flipping every tick a
 * stationary player spends on the trigger: without the lock, standing still
 * on a landing would satisfy `floor === toFloor` every tick and immediately
 * step back down, then back up, forever. The player must leave the landing's
 * radius before it can fire again in either direction. */
export interface KeepState {
  floor: ActiveFloor;
  landingLock: number;
}

export const KEEP_STATE_OUTSIDE: KeepState = { floor: 0, landingLock: -1 };

function landingIndexAt(x: number, z: number): number {
  for (let i = 0; i < KEEP_STAIRS.length; i++) {
    const s = KEEP_STAIRS[i];
    const dx = x - s.x;
    const dz = z - s.z;
    if (dx * dx + dz * dz <= s.r * s.r) return i;
  }
  return -1;
}

/**
 * Pure state-transition function: given the player's previous keep state and
 * their current (x,z), returns the next keep state. Called once per player
 * per tick (see sim.ts's per-player loop), same spirit as the dungeon-door
 * proximity check.
 *
 * - Outside the footprint: always floor 0, unlocked (walking away resets it,
 *   ready to walk back in the same door; there is no exit-portal concept).
 * - Just walked in (was 0, now inside): floor 1 (the ground floor the door
 *   opens onto).
 * - Already inside, not on a landing: stays on the current floor, unlocked.
 * - Already inside, on a landing NOT currently locked: steps one floor up or
 *   down (whichever end of that landing the player isn't already on) and
 *   locks to that landing.
 * - Already inside, on the SAME landing that is already locked: no-op (the
 *   player is still standing where they just transitioned; wait for them to
 *   step off before it can fire again).
 */
export function nextKeepState(prev: KeepState, x: number, z: number): KeepState {
  if (!isInsideKeepFootprint(x, z)) return KEEP_STATE_OUTSIDE;
  if (prev.floor === 0) return { floor: 1, landingLock: -1 };

  const landingIdx = landingIndexAt(x, z);
  if (landingIdx === -1) return { floor: prev.floor, landingLock: -1 };
  if (landingIdx === prev.landingLock) return prev; // still on the landing that just fired

  const s = KEEP_STAIRS[landingIdx];
  // fromFloor/toFloor are authored 1..5 in KEEP_STAIRS (content/keep.ts), so
  // they are valid ActiveFloor values; the data type widens them to number.
  if (prev.floor === s.fromFloor)
    return { floor: s.toFloor as ActiveFloor, landingLock: landingIdx };
  if (prev.floor === s.toFloor)
    return { floor: s.fromFloor as ActiveFloor, landingLock: landingIdx };
  return { floor: prev.floor, landingLock: landingIdx }; // on an unrelated landing, just lock it
}
