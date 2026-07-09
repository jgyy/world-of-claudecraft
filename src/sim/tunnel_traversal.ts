// Tunnel-aware ground height: the missing link between the hand-authored
// TunnelVolume content (content/tunnels.ts), the 3D voxel density field
// (voxel.ts), and the column-based (one height per x,z) collision/pathfind
// model everywhere else in the sim. voxel.ts's own header flags this wiring
// as a deliberate follow-up; this module is that follow-up, scoped to
// exactly what makes a TunnelVolume genuinely walkable: a vertical floor
// override for player_motion.ts and a path-height override for pathfind.ts.
// Lateral collision against a tunnel's own rock walls is out of scope here
// (the same "not yet wired" 3D-collision gap voxel.ts already documents);
// within a tunnel's footprint a mover can range freely inside the carved
// capsule, same as walking on open ground.
//
// Pure function of (x, y, z, seed) plus the fixed TUNNELS content: no RNG,
// no host state. `src/sim`-pure per the architecture invariant.

import { TUNNELS } from './content/tunnels';
import { tunnelBounds, voxelDensity } from './voxel';

// Column scan resolution: the authored waypoint radii are all >= 2.6yd, so a
// few dozen samples across a tunnel's y-span comfortably bracket the
// floor/ceiling crossing before the bisection refines it far past gameplay
// precision.
const SCAN_STEPS = 64;
const BISECT_ITERS = 22;

function isSolid(x: number, y: number, z: number, seed: number): boolean {
  return voxelDensity(x, y, z, seed) <= 0;
}

// Refine a solid<->air crossing known to lie in (y0, y1) down to sub-mm
// precision via bisection (voxelDensity is continuous, so this always
// converges).
function bisectCrossing(
  x: number,
  z: number,
  seed: number,
  y0: number,
  y1: number,
  solidAtY0: boolean,
): number {
  let a = y0;
  let b = y1;
  for (let i = 0; i < BISECT_ITERS; i++) {
    const mid = (a + b) / 2;
    if (isSolid(x, mid, z, seed) === solidAtY0) a = mid;
    else b = mid;
  }
  return (a + b) / 2;
}

export interface TunnelColumn {
  tunnelId: string;
  floorY: number;
  // Infinity when the interior is open straight through to the sky (i.e. this
  // column sits at/near a mouth, with no rock ceiling above the interior).
  ceilingY: number;
}

// The tunnel's own local floor/ceiling at (x,z), independent of any mover's
// current y: the first solid-to-air-to-solid (or -to-sky) band scanning
// upward from just below the tunnel's bounding box. Returns null when (x,z)
// isn't inside any tunnel's footprint at all, or the footprint's bounding
// box happens not to carve anything open at this exact column (e.g. a
// column between waypoints on the box's corner, outside the capsule radius).
export function tunnelColumnAt(x: number, z: number, seed: number): TunnelColumn | null {
  for (const tunnel of TUNNELS) {
    const b = tunnelBounds(tunnel);
    if (x < b.minX || x > b.maxX || z < b.minZ || z > b.maxZ) continue;

    const lo = b.minY - 2;
    const hi = b.maxY + 2;
    const dy = (hi - lo) / SCAN_STEPS;
    let prevY = lo;
    let prevSolid = isSolid(x, lo, z, seed);
    let floorY: number | null = null;
    let ceilingY: number | null = null;
    for (let i = 1; i <= SCAN_STEPS; i++) {
      const y = lo + i * dy;
      const solid = isSolid(x, y, z, seed);
      if (floorY === null) {
        if (prevSolid && !solid) floorY = bisectCrossing(x, z, seed, prevY, y, true);
      } else if (!prevSolid && solid) {
        ceilingY = bisectCrossing(x, z, seed, prevY, y, false);
        break;
      }
      prevY = y;
      prevSolid = solid;
    }
    if (floorY === null) continue;
    return { tunnelId: tunnel.id, floorY, ceilingY: ceilingY ?? Infinity };
  }
  return null;
}

// The floor a mover's body should ride at (x,z) if any authored tunnel
// carves an interior there, else null (ordinary terrain applies). Used by
// pathfind.ts, which reasons about (x,z) columns only and has no notion of
// "the mover's current y" to disambiguate a buried tunnel from the surface
// above it, so this always prefers the tunnel floor over the surface
// wherever one exists, treating the tunnel as a real lower alternate route.
export function tunnelFloorAt(x: number, z: number, seed: number): number | null {
  return tunnelColumnAt(x, z, seed)?.floorY ?? null;
}

// Is (x, y, z) actually inside a tunnel's carved interior right now (not
// just above its footprint on the surface)? Used by player_motion.ts to
// decide whether the mover is presently underground and traveling the
// tunnel, versus merely standing on the hillside above a buried stretch of
// it (where the ordinary surface rules should keep applying undisturbed).
// The floor's lower slack is generous (not a tight epsilon): the floor
// itself can rise a bit tick to tick as a mover approaches a mouth (the
// capsule narrowing back toward the surface), and last tick's y (snapped to
// last tick's floor) can already sit further than a hair below THIS tick's
// slightly-higher floor. A mover can never actually get below the true floor
// (it's solid rock), so this slack only has to outrun one tick's worth of
// floor movement, comfortably inside the tunnel's own radius.
const FLOOR_SLACK = 1.5;
const CEILING_SLACK = 0.5;

export function tunnelSpanAt(x: number, y: number, z: number, seed: number): TunnelColumn | null {
  const col = tunnelColumnAt(x, z, seed);
  if (!col) return null;
  return y >= col.floorY - FLOOR_SLACK && y <= col.ceilingY + CEILING_SLACK ? col : null;
}
