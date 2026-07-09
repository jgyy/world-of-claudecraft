// Voxel geometry for the Eastbrook Vale keep (content/keep.ts): a real
// open-world, multi-floor building at ONE fixed (x,z), no doorPos/entry/
// instance-origin split. Pure functions of world space (x, y, z, seed),
// meshed with the existing seam-free chunked mesher (voxel_mesh.ts), same
// pattern as voxel.ts's tunnel carving. Sibling of voxel.ts, not a change to
// it: the keep is hand-authored building geometry, not a terrain carve.
//
// Convention matches voxel.ts: density negative = solid, positive = air, a
// CONTINUOUS signed-distance-like field (not a binary +-1 step): the mesher's
// gradientNormal (voxel_mesh.ts) estimates the surface normal from a finite
// difference of this function, which needs an actual gradient to work with,
// not a flat step that is zero almost everywhere. Built from standard SDF
// box primitives combined with min (union of solids) / max-with-negation
// (subtraction, i.e. carving air out of a solid), the same combinators
// voxel.ts's tunnel carving uses in spirit (there: max of the terrain
// density and each capsule's carve amount).
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

// Axis-aligned box SDF, centered at (cx,cy,cz), half-extents (hx,hy,hz):
// negative inside, positive outside, continuous everywhere (the standard
// "exact" box distance field).
function sdBox(
  px: number,
  py: number,
  pz: number,
  cx: number,
  cy: number,
  cz: number,
  hx: number,
  hy: number,
  hz: number,
): number {
  const qx = Math.abs(px - cx) - hx;
  const qy = Math.abs(py - cy) - hy;
  const qz = Math.abs(pz - cz) - hz;
  const ox = Math.max(qx, 0);
  const oy = Math.max(qy, 0);
  const oz = Math.max(qz, 0);
  const outside = Math.hypot(ox, oy, oz);
  const inside = Math.min(Math.max(qx, Math.max(qy, qz)), 0);
  return outside + inside;
}

// A vertical cylinder SDF (infinite in y within [cy-hy,cy+hy]), used for the
// stairwell cutouts.
function sdCylinderY(
  px: number,
  py: number,
  pz: number,
  cx: number,
  cy: number,
  cz: number,
  r: number,
  hy: number,
): number {
  const dr = Math.hypot(px - cx, pz - cz) - r;
  const dy = Math.abs(py - cy) - hy;
  const ox = Math.max(dr, 0);
  const oy = Math.max(dy, 0);
  const outside = Math.hypot(ox, oy);
  const inside = Math.min(Math.max(dr, dy), 0);
  return outside + inside;
}

function union(a: number, b: number): number {
  return Math.min(a, b);
}

function subtract(a: number, cut: number): number {
  return Math.max(a, -cut);
}

function stairCutoutAt(lx: number, ly: number, lz: number, betweenFloor: number): number {
  let best = Infinity;
  for (const s of KEEP_STAIRS) {
    if (s.fromFloor !== betweenFloor) continue;
    const d = sdCylinderY(lx, ly, lz, s.x - KEEP_POS.x, 0, s.z - KEEP_POS.z, s.r, 10);
    if (d < best) best = d;
  }
  return best;
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

  const totalH = KEEP_FLOORS * KEEP_FLOOR_HEIGHT;
  const half = KEEP_HALF;
  const t = KEEP_WALL_THICK;

  // Foundation: an infinitely deep solid slab below the ground floor, so the
  // building never floats or shows a gap against the terrain it sits on.
  const foundation = sdBox(x, y, z, KEEP_POS.x, baseY - 50, KEEP_POS.z, half, 50, half);

  // Exterior walls: a solid box shell for the whole building height, hollowed
  // out by a slightly-taller/narrower interior box.
  const outerBox = sdBox(
    x,
    y,
    z,
    KEEP_POS.x,
    baseY + totalH / 2,
    KEEP_POS.z,
    half,
    totalH / 2 + 1,
    half,
  );
  const innerBox = sdBox(
    x,
    y,
    z,
    KEEP_POS.x,
    baseY + totalH / 2,
    KEEP_POS.z,
    half - t,
    totalH / 2 + 2,
    half - t,
  );
  let shell = subtract(outerBox, innerBox);

  // Door gap: carve a box through the south wall at ground-floor height.
  const doorCut = sdBox(
    x,
    y,
    z,
    KEEP_POS.x,
    baseY + KEEP_DOOR_HEIGHT / 2,
    KEEP_POS.z - half,
    KEEP_DOOR_HALF_WIDTH,
    KEEP_DOOR_HEIGHT / 2,
    t + 0.5,
  );
  shell = subtract(shell, doorCut);

  // Floor slabs (levels 1..KEEP_FLOORS-1 as interior floor/ceilings, plus the
  // roof at KEEP_FLOORS), each with a stairwell hole where a landing starts.
  let slabs = Infinity;
  for (let level = 1; level <= KEEP_FLOORS; level++) {
    const slabY = level * KEEP_FLOOR_HEIGHT;
    const thick = level === KEEP_FLOORS ? KEEP_ROOF_THICK : KEEP_SLAB_THICK;
    let slab = sdBox(x, y, z, KEEP_POS.x, baseY + slabY, KEEP_POS.z, half, thick / 2, half);
    if (level < KEEP_FLOORS) {
      const hole = stairCutoutAt(lx, ly, lz, level);
      slab = subtract(slab, hole);
    }
    slabs = union(slabs, slab);
  }

  return union(foundation, union(shell, slabs));
}

export { KEEP_STAIRS };
