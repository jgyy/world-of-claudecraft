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
  KEEP_SLAB_THICK,
  KEEP_STAIRS,
  KEEP_TOTAL_HEIGHT,
  KEEP_WALL_THICK,
  KEEP_WINDOW_HALF_WIDTH,
  KEEP_WINDOW_HEIGHT,
  KEEP_WINDOW_OFFSET,
  KEEP_WINDOW_SILL,
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
    // hy tall enough to reach every floor slab (the building is now ~20yd of
    // vertical wall). The cylinder is only ever subtracted from an individual
    // thin slab, so an over-tall carve is harmless; it must simply reach the
    // slab's height (local ly up to KEEP_BODY_HEIGHT).
    const d = sdCylinderY(lx, ly, lz, s.x - KEEP_POS.x, 0, s.z - KEEP_POS.z, s.r, 30);
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

  // Total vertical wall height: four full stories plus the attic knee wall,
  // up to the eave line where the pitched roof (render geometry) takes over.
  const totalH = KEEP_TOTAL_HEIGHT;
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

  // Real window openings: carve a symmetric pair through each wall face on
  // every floor (ground included), the same sdBox-subtract technique as the
  // door. The render side dresses each opening as a shuttered window.
  const winHalfH = KEEP_WINDOW_HEIGHT / 2;
  const winDepth = t + 0.5;
  for (const cut of keepWindowCuts(baseY, winHalfH, winDepth, x, y, z)) {
    shell = subtract(shell, cut);
  }

  // Floor slabs: levels 1..KEEP_FLOORS as interior floor/ceilings (the
  // KEEP_FLOORS-th slab is the attic floor), each with a stairwell hole where a
  // landing starts. stairCutoutAt returns Infinity when no landing begins on
  // that level, and subtract(slab, Infinity) leaves the slab untouched, so the
  // call is safe to make for every slab.
  let slabs = Infinity;
  for (let level = 1; level <= KEEP_FLOORS; level++) {
    const slabY = level * KEEP_FLOOR_HEIGHT;
    const slab = sdBox(
      x,
      y,
      z,
      KEEP_POS.x,
      baseY + slabY,
      KEEP_POS.z,
      half,
      KEEP_SLAB_THICK / 2,
      half,
    );
    const hole = stairCutoutAt(lx, ly, lz, level);
    slabs = union(slabs, subtract(slab, hole));
  }

  return union(foundation, union(shell, slabs));
}

// The local (x,z) center + wall axis of each window opening: a symmetric pair
// on each of the four wall faces, on every floor. Shared by the sim carve and
// the render frame/pane dressing so they always line up.
export interface KeepWindowSpec {
  /** World x of the window center. */
  x: number;
  /** World z of the window center. */
  z: number;
  /** Base-relative Y of the window center. */
  ly: number;
  /** Which wall this window sits in ('north'/'south' face +/-z, 'east'/'west' face +/-x). */
  wall: 'north' | 'south' | 'east' | 'west';
}

/** Every window's world (x,z), base-relative center Y, and wall face. */
export function keepWindowSpecs(): KeepWindowSpec[] {
  const out: KeepWindowSpec[] = [];
  const off = KEEP_WINDOW_OFFSET;
  for (let floor = 1; floor <= KEEP_FLOORS; floor++) {
    const ly = (floor - 1) * KEEP_FLOOR_HEIGHT + KEEP_WINDOW_SILL + KEEP_WINDOW_HEIGHT / 2;
    for (const s of [-1, 1] as const) {
      out.push({ x: KEEP_POS.x + s * off, z: KEEP_POS.z + KEEP_HALF, ly, wall: 'north' });
      out.push({ x: KEEP_POS.x + s * off, z: KEEP_POS.z - KEEP_HALF, ly, wall: 'south' });
      out.push({ x: KEEP_POS.x + KEEP_HALF, z: KEEP_POS.z + s * off, ly, wall: 'east' });
      out.push({ x: KEEP_POS.x - KEEP_HALF, z: KEEP_POS.z + s * off, ly, wall: 'west' });
    }
  }
  return out;
}

// The subtracted density of every window opening at (x,y,z). A north/south
// window is thin in z (spans the wall in x); an east/west window is thin in x.
function keepWindowCuts(
  baseY: number,
  winHalfH: number,
  winDepth: number,
  x: number,
  y: number,
  z: number,
): number[] {
  const cuts: number[] = [];
  const hw = KEEP_WINDOW_HALF_WIDTH;
  for (const w of keepWindowSpecs()) {
    const cy = baseY + w.ly;
    if (w.wall === 'north' || w.wall === 'south') {
      cuts.push(sdBox(x, y, z, w.x, cy, w.z, hw, winHalfH, winDepth));
    } else {
      cuts.push(sdBox(x, y, z, w.x, cy, w.z, winDepth, winHalfH, hw));
    }
  }
  return cuts;
}

export { KEEP_STAIRS };
