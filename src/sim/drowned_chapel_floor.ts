// Bespoke per-player "chapelFloor" local-area state for the Drowned Chapel
// ONLY (content/drowned_chapel.ts). colliders.ts (and the rest of the sim) is
// column-based: one height/collider set per (x,z), so true stacked floors at
// the identical footprint can't be represented by a single height field. This
// is deliberately NOT a generic multi-level engine: one small pure function
// plus a matching collider-set picker, both scoped to the chapel's fixed
// footprint, following the existing door-trigger precedent in
// instances/dungeons.ts (proximity check during the per-player tick loop)
// but flipping a floor flag instead of teleporting.
import {
  CHAPEL_STAIR_FLIGHT_RUN,
  CHAPEL_STAIR_WIDTH,
  CHAPEL_STAIRS,
} from './content/drowned_chapel';
import { chapelFloorY, isInsideChapelFootprint } from './drowned_chapel_building';
import { groundHeight } from './world';

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

// Half-width of the walkable ramp strip perpendicular to a flight's axis: the
// same STAIR_WIDTH as the visible stepped mesh (render/drowned_chapel_stairs.ts)
// plus a small margin for the player's collision radius, so standing anywhere
// a player can actually walk on the stairs (not just the exact centerline)
// gets ramped height.
const STAIR_RAMP_HALF_WIDTH = CHAPEL_STAIR_WIDTH / 2 + 0.3;

/**
 * World-space standing height for a player at (x,z) inside (or outside) the
 * chapel. Outside the footprint this is just the normal ground height
 * (unchanged elsewhere in the world). Inside the footprint:
 *  - on a stair flight's footprint, height ramps continuously between the
 *    lower and upper floor heights based on how far along the flight the
 *    player is standing, regardless of the currently-latched `chapelFloor`
 *    (this ramp is what makes climbing physically feel like climbing);
 *  - off the stairs, height is the flat floor height for `chapelFloor`
 *    (defaulting to floor 1 for 0/unset).
 */
export function chapelStandHeight(x: number, z: number, seed: number, chapelFloor: number): number {
  if (!isInsideChapelFootprint(x, z)) return groundHeight(x, z, seed);

  for (const s of CHAPEL_STAIRS) {
    const dAlong = s.axis === 'z' ? z - s.z : x - s.x;
    const across = s.axis === 'z' ? x - s.x : z - s.z;
    if (Math.abs(across) > STAIR_RAMP_HALF_WIDTH) continue;
    // dAlong runs from 0 at the landing (top) to -dir*FLIGHT_RUN at the
    // bottom-most step; f is the fraction of the way DOWN the flight from
    // the landing (0 at the top, 1 at the bottom).
    const totalDrop = -s.dir * CHAPEL_STAIR_FLIGHT_RUN;
    const f = totalDrop === 0 ? 0 : dAlong / totalDrop;
    if (f < -0.05 || f > 1.05) continue;
    const fc = Math.min(1, Math.max(0, f));
    const topY = chapelFloorY(seed, s.toFloor);
    const bottomY = chapelFloorY(seed, s.fromFloor);
    return topY * (1 - fc) + bottomY * fc;
  }

  const floor = chapelFloor === 2 ? 2 : 1;
  return chapelFloorY(seed, floor);
}
