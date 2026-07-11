// Placement + dimensions for the Drowned Chapel: a real, open-world 2-story
// ruined temple building at the Zone 2 (Mirefen Marsh) ruin compound (center
// 100, 435, see ../ruin_compound_layout.ts). Same technique as an open-world
// voxel building: the player walks in through a door opening modeled directly
// in the voxel geometry (see ../drowned_chapel_building.ts) and up one real
// staircase that flips a per-player "chapelFloor" local-area state (see
// ../drowned_chapel_floor.ts). Declarative data, no RNG.
//
// Deliberately smaller and squatter than a keep-scale building (ground
// sanctum + one upper floor, not four stories): this is a ruined temple, not
// a fortress. The ruin compound's terrain flatten (ruin_compound_layout.ts) is
// sized to EXACTLY this building's footprint (RUIN_COMPOUND_PLATEAU_RADIUS =
// CHAPEL_HALF), a single flat plateau with no apron ring; the building's own
// solid foundation box supports the square footprint's corners.
export const CHAPEL_POS = { x: 100, z: 435 };

// Exterior footprint is a square CHAPEL_HALF*2 on a side, centered on CHAPEL_POS.
// Widened from the original half of 6 to give the sanctum and upper landing
// noticeably more usable floor space (footprint 16x16 vs the old 12x12).
export const CHAPEL_HALF = 8;
export const CHAPEL_WALL_THICK = 0.5;
// Per-floor floor-to-floor heights. The ground sanctum is deliberately taller
// than the upper floor for a cathedral-like nave with real headroom (both
// floors used to share a single flat height of 4).
export const CHAPEL_GROUND_FLOOR_HEIGHT = 5.5;
export const CHAPEL_UPPER_FLOOR_HEIGHT = 4.5;
// Ground sanctum + one upper floor. No attic (a ruined temple, not a keep).
export const CHAPEL_FLOORS = 2;
export const CHAPEL_BODY_HEIGHT = CHAPEL_GROUND_FLOOR_HEIGHT + CHAPEL_UPPER_FLOOR_HEIGHT;
export const CHAPEL_TOTAL_HEIGHT = CHAPEL_BODY_HEIGHT;
export const CHAPEL_SLAB_THICK = 0.8;
export const CHAPEL_ROOF_THICK = 0.8;

// Base-relative height of the walkable surface of floor `floor` (1-based:
// floor 1 sits on the base, floor 2 one ground-story up).
export function chapelFloorBaseOffset(floor: number): number {
  if (floor <= 1) return 0;
  return CHAPEL_GROUND_FLOOR_HEIGHT + (floor - 2) * CHAPEL_UPPER_FLOOR_HEIGHT;
}

// Base-relative height of the ceiling/floor-slab immediately above floor
// `level` (its own floor-to-floor height stacked on its walkable surface).
export function chapelSlabOffset(level: number): number {
  const storyHeight = level <= 1 ? CHAPEL_GROUND_FLOOR_HEIGHT : CHAPEL_UPPER_FLOOR_HEIGHT;
  return chapelFloorBaseOffset(level) + storyHeight;
}

// The door opening faces the archway/processional axis (north, +z, toward
// the compound's entrance at z=445): the only way in, normal open-world
// movement, no teleport.
export const CHAPEL_DOOR_HALF_WIDTH = 1.1;
export const CHAPEL_DOOR_HEIGHT = 3.0;

// Real carved-through window openings, one symmetric pair per wall face per
// floor (see ../drowned_chapel_building.ts, same sdBox-subtract technique).
export const CHAPEL_WINDOW_HALF_WIDTH = 0.6;
export const CHAPEL_WINDOW_HEIGHT = 1.4;
export const CHAPEL_WINDOW_SILL = 1.2;
export const CHAPEL_WINDOW_OFFSET = 2.6;

// One real staircase landing (local building coordinates, added to CHAPEL_POS
// for world space): walking within `r` of it while on `fromFloor` flips the
// player's chapelFloor to `toFloor`. Also used to carve a matching stairwell
// opening in the floor slab, and to draw the real stepped flight
// (../render/drowned_chapel_stairs.ts).
export interface ChapelStairLanding {
  fromFloor: 1;
  toFloor: 2;
  x: number;
  z: number;
  r: number;
  axis: 'x' | 'z';
  dir: 1 | -1;
}

export const CHAPEL_STAIRS: ChapelStairLanding[] = [
  {
    fromFloor: 1,
    toFloor: 2,
    x: CHAPEL_POS.x - 3.5,
    z: CHAPEL_POS.z + 2.6,
    r: 1.4,
    axis: 'z',
    dir: 1,
  },
];

// Shared stair-flight geometry: one place that both the sim (stairwell
// cutout + the player's ground-height ramp) and the renderer (the visible
// stepped mesh) read from, so they can never drift apart. A shallow real
// staircase (30-35 degree pitch, classic building-code max) instead of the
// old ~53 degree "ladder": the total horizontal run is derived from the
// floor-to-floor rise and a target pitch near the middle of that range, not
// hardcoded.
export const CHAPEL_STAIR_STEPS_PER_FLIGHT = 12;
export const CHAPEL_STAIR_WIDTH = 1.8;
const CHAPEL_STAIR_TARGET_PITCH_DEG = 32.5;
export const CHAPEL_STAIR_RISE_PER_STEP =
  CHAPEL_GROUND_FLOOR_HEIGHT / CHAPEL_STAIR_STEPS_PER_FLIGHT;
export const CHAPEL_STAIR_RUN_PER_STEP =
  CHAPEL_STAIR_RISE_PER_STEP / Math.tan((CHAPEL_STAIR_TARGET_PITCH_DEG * Math.PI) / 180);
export const CHAPEL_STAIR_PITCH_RAD = Math.atan(
  CHAPEL_STAIR_RISE_PER_STEP / CHAPEL_STAIR_RUN_PER_STEP,
);
// Full flight footprint length (landing to the bottom-most step), used to
// size the stairwell ceiling cutout so it matches the visible flight exactly.
export const CHAPEL_STAIR_FLIGHT_RUN =
  CHAPEL_STAIR_RUN_PER_STEP * (CHAPEL_STAIR_STEPS_PER_FLIGHT - 1);
