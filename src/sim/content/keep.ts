// Placement + dimensions for the Eastbrook Vale keep: a real open-world,
// multi-floor building at ONE FIXED (x,z) in zone1, same coordinate space as
// every other prop. No doorPos/entry/instance-origin split: the player walks
// in through a door opening modeled directly in the voxel geometry
// (see ../voxel_building.ts) and up staircases that flip a per-player
// "activeFloor" local-area state (see ../keep_floor.ts). Declarative data,
// no RNG: same spirit as content/tunnels.ts.
//
// Placement chosen clear of the hub (radius 26 around 0,0), clear of every
// ZONE1_PROPS building/prop/camp footprint, clear of every fixed coordinate
// the parity golden-trace scenarios teleport to (tests/parity/scenarios.ts
// stays within +/-100 on both axes), AND on flat ground: terrainHeight only
// varies ~1.5 yd across the whole footprint here (checked via
// scripts/probe_terrain.mjs), unlike most of the world's rolling hills, so
// the voxel shell sits flush with the ground on every side instead of
// clipping into a slope.
export const KEEP_POS = { x: -120, z: -30 };

// Exterior footprint is a square KEEP_HALF*2 on a side, centered on KEEP_POS.
export const KEEP_HALF = 7;
export const KEEP_WALL_THICK = 0.5;
export const KEEP_FLOOR_HEIGHT = 4;
export const KEEP_FLOORS = 3;
export const KEEP_SLAB_THICK = 0.4;
export const KEEP_ROOF_THICK = 0.5;

// The door opening is centered on the south wall (local z = -KEEP_HALF),
// spans ground-floor height, and is the ONLY way in: normal open-world
// movement, no teleport.
export const KEEP_DOOR_HALF_WIDTH = 1.2;
export const KEEP_DOOR_HEIGHT = 3.2;

// Staircase landing trigger volumes (local building coordinates, added to
// KEEP_POS for world space). Walking within `r` of a landing while on
// `fromFloor` flips the player's activeFloor to `toFloor` (see keep_floor.ts).
// Also used by voxel_building.ts to carve a matching stairwell opening in the
// floor slab between the two floors, so the visible stairs and the floor
// transition trigger line up.
export interface KeepStairLanding {
  fromFloor: 1 | 2;
  toFloor: 2 | 3;
  x: number;
  z: number;
  r: number;
}

export const KEEP_STAIRS: KeepStairLanding[] = [
  { fromFloor: 1, toFloor: 2, x: KEEP_POS.x + 4, z: KEEP_POS.z + 3, r: 1.6 },
  { fromFloor: 2, toFloor: 3, x: KEEP_POS.x - 4, z: KEEP_POS.z + 3, r: 1.6 },
];

export const KEEP_TOTAL_HEIGHT = KEEP_FLOORS * KEEP_FLOOR_HEIGHT + KEEP_ROOF_THICK;
