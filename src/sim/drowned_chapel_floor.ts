// Bespoke per-player "chapelFloor" local-area state for the Drowned Chapel
// ONLY (content/drowned_chapel.ts). colliders.ts (and the rest of the sim) is
// column-based: one height/collider set per (x,z), so true stacked floors at
// the identical footprint can't be represented by a single height field. This
// is deliberately NOT a generic multi-level engine: one small pure function
// plus a matching collider-set picker, both scoped to the chapel's fixed
// footprint, following the existing door-trigger precedent in
// instances/dungeons.ts (proximity check during the per-player tick loop)
// but flipping a floor flag instead of teleporting.
import { CHAPEL_STAIRS } from './content/drowned_chapel';
import { isInsideChapelFootprint } from './drowned_chapel_building';

/** 0 = outside the chapel (or never entered); 1 = ground sanctum; 2 = the
 * upper floor. */
export type ChapelActiveFloor = 0 | 1 | 2;

/** chapelFloor plus which landing (index into CHAPEL_STAIRS, or -1) the
 * player is currently standing inside, so a landing transitions EXACTLY ONCE
 * per approach (edge-triggered): without the lock, standing still on the
 * landing would satisfy `floor === toFloor` every tick and immediately step
 * back down, then back up, forever. The player must leave the landing's
 * radius before it can fire again in either direction. */
export interface ChapelState {
  floor: ChapelActiveFloor;
  landingLock: number;
}

export const CHAPEL_STATE_OUTSIDE: ChapelState = { floor: 0, landingLock: -1 };

function landingIndexAt(x: number, z: number): number {
  for (let i = 0; i < CHAPEL_STAIRS.length; i++) {
    const s = CHAPEL_STAIRS[i];
    const dx = x - s.x;
    const dz = z - s.z;
    if (dx * dx + dz * dz <= s.r * s.r) return i;
  }
  return -1;
}

/**
 * Pure state-transition function: given the player's previous chapel state
 * and their current (x,z), returns the next chapel state. Called once per
 * player per tick (see sim.ts's per-player loop), same spirit as the dungeon-
 * door proximity check.
 */
export function nextChapelState(prev: ChapelState, x: number, z: number): ChapelState {
  if (!isInsideChapelFootprint(x, z)) return CHAPEL_STATE_OUTSIDE;
  if (prev.floor === 0) return { floor: 1, landingLock: -1 };

  const landingIdx = landingIndexAt(x, z);
  if (landingIdx === -1) return { floor: prev.floor, landingLock: -1 };
  if (landingIdx === prev.landingLock) return prev; // still on the landing that just fired

  const s = CHAPEL_STAIRS[landingIdx];
  if (prev.floor === s.fromFloor)
    return { floor: s.toFloor as ChapelActiveFloor, landingLock: landingIdx };
  if (prev.floor === s.toFloor)
    return { floor: s.fromFloor as ChapelActiveFloor, landingLock: landingIdx };
  return { floor: prev.floor, landingLock: landingIdx };
}
