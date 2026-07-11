// Voxel geometry for the Drowned Chapel (content/drowned_chapel.ts): a real
// open-world, 2-story building at ONE fixed (x,z), replacing the freestanding
// perimeter wall the Zone 2 ruin compound used to have. Pure functions of
// world space (x, y, z, seed), meshed with the existing seam-free chunked
// mesher (voxel_mesh.ts), same pattern as voxel.ts's tunnel carving. Sibling
// of voxel.ts, not a change to it: this is hand-authored building geometry,
// not a terrain carve.
//
// Convention matches voxel.ts: density negative = solid, positive = air, a
// CONTINUOUS signed-distance-like field (not a binary step), built from
// standard SDF box primitives combined with min (union) / max-with-negation
// (subtraction).
import {
  CHAPEL_DOOR_HALF_WIDTH,
  CHAPEL_DOOR_HEIGHT,
  CHAPEL_FLOORS,
  CHAPEL_HALF,
  CHAPEL_POS,
  CHAPEL_SLAB_THICK,
  CHAPEL_STAIR_FLIGHT_RUN,
  CHAPEL_STAIR_WIDTH,
  CHAPEL_STAIRS,
  CHAPEL_TOTAL_HEIGHT,
  CHAPEL_WALL_THICK,
  CHAPEL_WINDOW_HALF_WIDTH,
  CHAPEL_WINDOW_HEIGHT,
  CHAPEL_WINDOW_OFFSET,
  CHAPEL_WINDOW_SILL,
  chapelFloorBaseOffset,
  chapelSlabOffset,
} from './content/drowned_chapel';
import { terrainHeight } from './world';

export {
  CHAPEL_FLOORS,
  CHAPEL_HALF,
  CHAPEL_POS,
  CHAPEL_TOTAL_HEIGHT,
  chapelFloorBaseOffset,
  chapelSlabOffset,
};

/** Is (x,z) within the chapel's exterior footprint (plus a small pad for the
 * mesher's chunk padding requirement)? */
export function isInsideChapelFootprint(x: number, z: number, pad = 0): boolean {
  return (
    Math.abs(x - CHAPEL_POS.x) <= CHAPEL_HALF + pad &&
    Math.abs(z - CHAPEL_POS.z) <= CHAPEL_HALF + pad
  );
}

/** World-space Y the chapel's ground floor sits on (flush with the terrain at
 * the building's origin: the ruin compound flatten already levels this patch,
 * so `terrainHeight` stays the single source of truth). */
export function chapelBaseY(seed: number): number {
  return terrainHeight(CHAPEL_POS.x, CHAPEL_POS.z, seed);
}

/** World-space Y of the walkable surface of a given floor (1..CHAPEL_FLOORS). */
export function chapelFloorY(seed: number, floor: number): number {
  return chapelBaseY(seed) + chapelFloorBaseOffset(floor);
}

// Axis-aligned box SDF, centered at (cx,cy,cz), half-extents (hx,hy,hz):
// negative inside, positive outside, continuous everywhere.
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

function union(a: number, b: number): number {
  return Math.min(a, b);
}

function subtract(a: number, cut: number): number {
  return Math.max(a, -cut);
}

// Ceiling cutout for one stair flight: an oriented box spanning the FULL
// flight footprint (landing back to the bottom-most step), not just a small
// disc at the landing. Sized to the same STAIR_WIDTH as the visible stepped
// mesh (render/drowned_chapel_stairs.ts) plus a small margin so the opening
// always fully clears the flight, whatever the flight's run length (which is
// itself derived from the floor-to-floor rise, see content/drowned_chapel.ts).
function stairCutoutAt(lx: number, ly: number, lz: number, betweenFloor: number): number {
  let best = Infinity;
  for (const s of CHAPEL_STAIRS) {
    if (s.fromFloor !== betweenFloor) continue;
    const sLx = s.x - CHAPEL_POS.x;
    const sLz = s.z - CHAPEL_POS.z;
    const halfAlong = CHAPEL_STAIR_FLIGHT_RUN / 2 + 0.4;
    const halfAcross = CHAPEL_STAIR_WIDTH / 2 + 0.4;
    // The flight runs from the landing back along -dir on `axis`; the
    // cutout box is centered on the flight's midpoint.
    const midAlong = -s.dir * (CHAPEL_STAIR_FLIGHT_RUN / 2);
    const cx = s.axis === 'x' ? sLx + midAlong : sLx;
    const cz = s.axis === 'z' ? sLz + midAlong : sLz;
    const hx = s.axis === 'x' ? halfAlong : halfAcross;
    const hz = s.axis === 'z' ? halfAlong : halfAcross;
    const d = sdBox(lx, ly, lz, cx, 0, cz, hx, 20, hz);
    if (d < best) best = d;
  }
  return best;
}

/** Pure density for the chapel's exterior shell: walls at every floor, the
 * ground-floor door gap, real window openings, and interior floor
 * slabs/roof (with a stairwell cutout). Only meaningful within
 * `isInsideChapelFootprint`; callers outside should fall back to the plain
 * terrain density. */
export function chapelVoxelDensity(x: number, y: number, z: number, seed: number): number {
  const lx = x - CHAPEL_POS.x;
  const lz = z - CHAPEL_POS.z;
  const baseY = chapelBaseY(seed);
  const ly = y - baseY;

  const totalH = CHAPEL_TOTAL_HEIGHT;
  const half = CHAPEL_HALF;
  const t = CHAPEL_WALL_THICK;

  // Foundation: an infinitely deep solid slab below the ground floor.
  const foundation = sdBox(x, y, z, CHAPEL_POS.x, baseY - 50, CHAPEL_POS.z, half, 50, half);

  const outerBox = sdBox(
    x,
    y,
    z,
    CHAPEL_POS.x,
    baseY + totalH / 2,
    CHAPEL_POS.z,
    half,
    totalH / 2 + 1,
    half,
  );
  const innerBox = sdBox(
    x,
    y,
    z,
    CHAPEL_POS.x,
    baseY + totalH / 2,
    CHAPEL_POS.z,
    half - t,
    totalH / 2 + 2,
    half - t,
  );
  let shell = subtract(outerBox, innerBox);

  // Door gap: carve a box through the north wall (facing the archway/
  // processional axis) at ground-floor height.
  const doorCut = sdBox(
    x,
    y,
    z,
    CHAPEL_POS.x,
    baseY + CHAPEL_DOOR_HEIGHT / 2,
    CHAPEL_POS.z + half,
    CHAPEL_DOOR_HALF_WIDTH,
    CHAPEL_DOOR_HEIGHT / 2,
    t + 0.5,
  );
  shell = subtract(shell, doorCut);

  // Real window openings: a symmetric pair through each wall face, every floor.
  const winHalfH = CHAPEL_WINDOW_HEIGHT / 2;
  const winDepth = t + 0.5;
  for (const cut of chapelWindowCuts(baseY, winHalfH, winDepth, x, y, z)) {
    shell = subtract(shell, cut);
  }

  // Floor slabs: levels 1..CHAPEL_FLOORS, each with a stairwell hole where the
  // landing begins. stairCutoutAt returns Infinity when no landing begins on
  // that level, so the call is safe for every slab.
  let slabs = Infinity;
  for (let level = 1; level <= CHAPEL_FLOORS; level++) {
    const slabY = chapelSlabOffset(level);
    const slab = sdBox(
      x,
      y,
      z,
      CHAPEL_POS.x,
      baseY + slabY,
      CHAPEL_POS.z,
      half,
      CHAPEL_SLAB_THICK / 2,
      half,
    );
    const hole = stairCutoutAt(lx, ly, lz, level);
    slabs = union(slabs, subtract(slab, hole));
  }

  return union(foundation, union(shell, slabs));
}

export interface ChapelWindowSpec {
  x: number;
  z: number;
  ly: number;
  wall: 'north' | 'south' | 'east' | 'west';
}

/** Every window's world (x,z), base-relative center Y, and wall face. */
export function chapelWindowSpecs(): ChapelWindowSpec[] {
  const out: ChapelWindowSpec[] = [];
  const off = CHAPEL_WINDOW_OFFSET;
  for (let floor = 1; floor <= CHAPEL_FLOORS; floor++) {
    const ly = chapelFloorBaseOffset(floor) + CHAPEL_WINDOW_SILL + CHAPEL_WINDOW_HEIGHT / 2;
    for (const s of [-1, 1] as const) {
      out.push({ x: CHAPEL_POS.x + s * off, z: CHAPEL_POS.z + CHAPEL_HALF, ly, wall: 'north' });
      out.push({ x: CHAPEL_POS.x + s * off, z: CHAPEL_POS.z - CHAPEL_HALF, ly, wall: 'south' });
      out.push({ x: CHAPEL_POS.x + CHAPEL_HALF, z: CHAPEL_POS.z + s * off, ly, wall: 'east' });
      out.push({ x: CHAPEL_POS.x - CHAPEL_HALF, z: CHAPEL_POS.z + s * off, ly, wall: 'west' });
    }
  }
  return out;
}

function chapelWindowCuts(
  baseY: number,
  winHalfH: number,
  winDepth: number,
  x: number,
  y: number,
  z: number,
): number[] {
  const cuts: number[] = [];
  const hw = CHAPEL_WINDOW_HALF_WIDTH;
  for (const w of chapelWindowSpecs()) {
    const cy = baseY + w.ly;
    if (w.wall === 'north' || w.wall === 'south') {
      cuts.push(sdBox(x, y, z, w.x, cy, w.z, hw, winHalfH, winDepth));
    } else {
      cuts.push(sdBox(x, y, z, w.x, cy, w.z, winDepth, winHalfH, hw));
    }
  }
  return cuts;
}

export { CHAPEL_STAIRS };
