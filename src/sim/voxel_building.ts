// Voxel geometry for the Eastbrook Vale keep (content/keep.ts): a real
// open-world, multi-floor building at ONE fixed (x,z), no doorPos/entry/
// instance-origin split. Pure functions of world space (x, y, z, seed),
// meshed with the existing seam-free chunked mesher (voxel_mesh.ts), same
// pattern as voxel.ts's tunnel carving. Sibling of voxel.ts, not a change to
// it: the keep is hand-authored building geometry, not a terrain carve.
//
// Convention matches voxel.ts: density negative = solid, positive = air.
// Local building coordinates: lx/lz relative to KEEP_POS, ly relative to the
// building's base Y (terrainHeight at KEEP_POS, so the keep sits flush with
// the ground it was placed on).
import {
  KEEP_DOOR_HALF_WIDTH,
  KEEP_DOOR_HEIGHT,
  KEEP_FLOOR_HEIGHT,
  KEEP_FLOORS,
  KEEP_HALF,
  KEEP_POS,
  KEEP_ROOF_THICK,
  KEEP_SLAB_THICK,
  KEEP_STAIRS,
  KEEP_TOTAL_HEIGHT,
  KEEP_WALL_THICK,
} from './content/keep';
import { terrainHeight } from './world';

export { KEEP_FLOORS, KEEP_HALF, KEEP_POS, KEEP_TOTAL_HEIGHT };

/** Is (x,z) within the keep's exterior footprint (plus a small pad for the
 * mesher's chunk padding requirement)? */
export function isInsideKeepFootprint(x: number, z: number, pad = 0): boolean {
  return Math.abs(x - KEEP_POS.x) <= KEEP_HALF + pad && Math.abs(z - KEEP_POS.z) <= KEEP_HALF + pad;
}

/** World-space Y the keep's ground floor sits on (flush with the terrain at
 * the building's origin, so `terrainHeight` stays the single source of truth
 * for outdoor ground level). */
export function keepBaseY(seed: number): number {
  return terrainHeight(KEEP_POS.x, KEEP_POS.z, seed);
}

/** World-space Y of the walkable surface of a given floor (1..KEEP_FLOORS). */
export function keepFloorY(seed: number, floor: number): number {
  return keepBaseY(seed) + Math.max(0, floor - 1) * KEEP_FLOOR_HEIGHT;
}

function stairOpeningAt(lx: number, lz: number, betweenFloor: number): boolean {
  for (const s of KEEP_STAIRS) {
    if (s.fromFloor !== betweenFloor) continue;
    const dx = lx - (s.x - KEEP_POS.x);
    const dz = lz - (s.z - KEEP_POS.z);
    if (dx * dx + dz * dz <= s.r * s.r) return true;
  }
  return false;
}

function isDoorGap(lx: number, lz: number, ly: number): boolean {
  return (
    lz <= -KEEP_HALF + KEEP_WALL_THICK + 1e-6 &&
    Math.abs(lx) < KEEP_DOOR_HALF_WIDTH &&
    ly >= 0 &&
    ly <= KEEP_DOOR_HEIGHT
  );
}

function isWallSolid(lx: number, lz: number, ly: number): boolean {
  if (ly < 0 || ly > KEEP_FLOORS * KEEP_FLOOR_HEIGHT) return false;
  const onPerimeter =
    Math.abs(lx) >= KEEP_HALF - KEEP_WALL_THICK || Math.abs(lz) >= KEEP_HALF - KEEP_WALL_THICK;
  if (!onPerimeter) return false;
  if (isDoorGap(lx, lz, ly)) return false;
  return true;
}

function isSlabSolid(lx: number, lz: number, ly: number): boolean {
  // Interior floor/ceiling slabs at each floor boundary (excluding ground,
  // which rests on the terrain, and including the roof).
  for (let level = 1; level <= KEEP_FLOORS; level++) {
    const slabY = level * KEEP_FLOOR_HEIGHT;
    const thick = level === KEEP_FLOORS ? KEEP_ROOF_THICK : KEEP_SLAB_THICK;
    if (ly < slabY - thick / 2 || ly > slabY + thick / 2) continue;
    if (level < KEEP_FLOORS && stairOpeningAt(lx, lz, level)) continue; // stairwell hole
    return true;
  }
  return false;
}

/** Pure density for the keep's exterior shell: walls at every floor, the
 * ground-floor door gap, and interior floor slabs/roof (with stairwell
 * cutouts). Only meaningful within `isInsideKeepFootprint`; callers outside
 * the footprint should fall back to the plain terrain density (voxel.ts). */
export function keepVoxelDensity(x: number, y: number, z: number, seed: number): number {
  const lx = x - KEEP_POS.x;
  const lz = z - KEEP_POS.z;
  const baseY = keepBaseY(seed);
  const ly = y - baseY;

  if (ly < -0.05) return -1; // foundation: solid below the ground floor
  if (isWallSolid(lx, lz, ly)) return -1;
  if (isSlabSolid(lx, lz, ly)) return -1;
  return 1; // open interior / exterior air
}

export { KEEP_STAIRS };
