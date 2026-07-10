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
// stays within +/-100 on both axes), AND on flat ground: the terrain is
// pulled to a dead-level pad around KEEP_POS inside ../world.ts terrainHeight
// (see KEEP_PAD_HALF below), the same LEVEL-pull technique the camp/Sowfield
// flatten uses, so the voxel shell sits flush with the ground on every side
// instead of clipping into a slope.
export const KEEP_POS = { x: -120, z: -30 };

// Exterior footprint is a square KEEP_HALF*2 on a side, centered on KEEP_POS.
export const KEEP_HALF = 7;
export const KEEP_WALL_THICK = 0.5;
// Floor-to-floor height. Bumped from 4 to give the taller keep real headroom
// per story (the door, windows, furniture, and stair flights all read against
// this).
export const KEEP_FLOOR_HEIGHT = 4.5;
// Four full walkable stories (ground + 3 upper), plus a real attic above them
// (see KEEP_ATTIC_HEIGHT). The attic is walkable "floor 5" (keep_floor.ts's
// ActiveFloor), sitting on the KEEP_FLOORS-th floor slab.
export const KEEP_FLOORS = 4;
// Attic knee-wall height: how far the vertical voxel walls rise ABOVE the
// top-story ceiling (KEEP_BODY_HEIGHT) before the pitched roof takes over as
// the attic ceiling. Gives the attic real headroom at the eaves instead of the
// roof starting flush on the attic floor.
export const KEEP_ATTIC_HEIGHT = 2.4;
// Top of the top full story / the attic floor slab (base-relative).
export const KEEP_BODY_HEIGHT = KEEP_FLOORS * KEEP_FLOOR_HEIGHT;
// Thick enough to stay several voxels deep at the keep's mesh resolution
// (src/render/voxel_building.ts: 64 samples over a ~22yd chunk, so a voxel is
// ~0.35yd wide): a slab thinner than about one voxel produces a near-zero-
// thickness surface the marching-cubes mesher resolves as two almost
// coincident faces, which z-fights under the camera on the suspended upper
// slabs. Purely a mesh thickness: floor Y (keepFloorY) and collision
// (colliders.ts) don't depend on this constant.
export const KEEP_SLAB_THICK = 0.9;
export const KEEP_ROOF_THICK = 0.9;

// The door opening is centered on the south wall (local z = -KEEP_HALF),
// spans ground-floor height, and is the ONLY way in: normal open-world
// movement, no teleport.
export const KEEP_DOOR_HALF_WIDTH = 1.2;
export const KEEP_DOOR_HEIGHT = 3.2;

// Real carved-through window openings (../voxel_building.ts subtracts these
// from the shell with the same sdBox technique as the door). One pair per wall
// face per floor, including the ground floor. The render side (../render/
// voxel_building.ts buildDoorAndWindows) dresses each opening with a plank
// frame + a dark pane so it still reads as a shuttered window.
export const KEEP_WINDOW_HALF_WIDTH = 0.7;
export const KEEP_WINDOW_HEIGHT = 1.6;
// Sill height above each floor's walkable surface.
export const KEEP_WINDOW_SILL = 1.3;
// Tangential offset of each window from the wall center (a symmetric pair at
// +/- this along the wall). Clear of the south-wall door (half width 1.2).
export const KEEP_WINDOW_OFFSET = 3.4;

// Flat terrain pad around the keep, applied in ../world.ts terrainHeight as a
// LEVEL pull toward the ground height at KEEP_POS. KEEP_PAD_HALF is the fully
// flat half-extent (dead level everywhere the keep walls stand, with margin);
// KEEP_PAD_FALLOFF is how far past that the flatten eases back to natural
// terrain, so there is no hard step at the pad edge. The flat region must
// comfortably clear the KEEP_HALF (7) footprint on every side so no slope ever
// reaches the walls.
export const KEEP_PAD_HALF = 11;
export const KEEP_PAD_FALLOFF = 7;

// Staircase landing trigger volumes (local building coordinates, added to
// KEEP_POS for world space). Walking within `r` of a landing while on
// `fromFloor` flips the player's activeFloor to `toFloor` (see keep_floor.ts).
// Also used by voxel_building.ts to carve a matching stairwell opening in the
// floor slab between the two floors, so the visible stairs and the floor
// transition trigger line up. The render side (../render/keep_stairs.ts)
// builds the actual visible step geometry under each landing.
export interface KeepStairLanding {
  fromFloor: number;
  toFloor: number;
  x: number;
  z: number;
  r: number;
  // Which horizontal axis the visible stair flight runs along, and its sign:
  // the top of the flight sits at the landing, descending toward the previous
  // floor along this direction. Alternating axes keep successive flights from
  // stacking on the same footprint.
  axis: 'x' | 'z';
  dir: 1 | -1;
}

export const KEEP_STAIRS: KeepStairLanding[] = [
  { fromFloor: 1, toFloor: 2, x: KEEP_POS.x + 4, z: KEEP_POS.z + 3, r: 1.6, axis: 'z', dir: -1 },
  { fromFloor: 2, toFloor: 3, x: KEEP_POS.x - 4, z: KEEP_POS.z + 3, r: 1.6, axis: 'z', dir: -1 },
  { fromFloor: 3, toFloor: 4, x: KEEP_POS.x + 4, z: KEEP_POS.z - 3, r: 1.6, axis: 'z', dir: 1 },
  { fromFloor: 4, toFloor: 5, x: KEEP_POS.x - 4, z: KEEP_POS.z - 3, r: 1.6, axis: 'z', dir: 1 },
];

// Eave line (base-relative): the vertical walls (four stories + attic knee)
// rise to here, and the pitched roof starts here. The roof slab thickness is
// separate (KEEP_ROOF_THICK) and sits as render geometry above the eave.
export const KEEP_TOTAL_HEIGHT = KEEP_BODY_HEIGHT + KEEP_ATTIC_HEIGHT;
