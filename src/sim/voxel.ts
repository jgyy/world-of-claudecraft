import { TUNNELS } from './content/tunnels';
import { terrainHeight } from './world';

// A true 3D voxel density field, layered on top of the existing (x,z)->y
// heightfield (world.ts). `voxelDensity` is a pure function of (x, y, z, seed):
// negative = solid ground, positive = open air. Outdoors, away from any
// authored tunnel or entrance mound, it is exactly `y - terrainHeight(x, z,
// seed)`, so the voxel field's surface is byte-identical to the existing
// heightfield and every existing (x,z)-only consumer (colliders, pathfind,
// mob locomotion) keeps working unchanged. Tunnels are hand-authored capsule
// paths (see content/tunnels.ts) subtracted from the solid terrain: the ONLY
// way caves get carved, matching the "terrain is a pure function of seed"
// invariant in world.ts (no procedural cave noise). A tunnel's entrance
// mound is an ADDITIVE Gaussian height bump on that same heightfield (see
// groundHeightWithMounds below) - the identical technique world.ts's own
// mountain ridge walls use - so the knoll the doorway is cut into is
// provably continuous with the surrounding terrain, never a separate solid
// object with its own hard edge.
//
// This module is the first slice of the voxel migration: the engine only
// (density field + the seam-free chunked mesher in voxel_mesh.ts), proven by
// tests, not yet wired into the renderer or any live content. content/tunnels.ts
// today holds one fixture tunnel that exercises the carving math; it is not
// rendered in-game. Wiring real tunnel content into the renderer, and 3D
// collision/pathfinding through it (today's colliders.ts/pathfind.ts are still
// column-based, one height per x,z), are deliberate follow-up phases.

function clamp01(t: number): number {
  return t < 0 ? 0 : t > 1 ? 1 : t;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

// Signed "carve" contribution of one capsule segment at a point: positive
// inside the capsule (this much open air), negative-ish falloff outside.
// Radius (and the optional archScale/floorScale cross-section shape, see
// TunnelWaypoint in content/tunnels.ts) is linearly interpolated along the
// segment between its two waypoints, so a tunnel can taper.
//
// The cross-section is an ellipsoid, not a sphere: the horizontal (x/z)
// half-extent is always `radius`, but the vertical half-extent is
// `radius * archScale` above the segment's local centerline and
// `radius * floorScale` below it. Both default to 1, which collapses back
// to the original sphere exactly (vale_kobold_warren keeps that shape).
// archScale > 1 domes the ceiling taller than it is wide, reading as a real
// arch; floorScale < 1 flattens the floor in close underfoot instead of
// curving away into a hemisphere.
function segmentCarve(
  px: number,
  py: number,
  pz: number,
  a: { x: number; y: number; z: number; radius: number; archScale?: number; floorScale?: number },
  b: { x: number; y: number; z: number; radius: number; archScale?: number; floorScale?: number },
): number {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const abz = b.z - a.z;
  const len2 = abx * abx + aby * aby + abz * abz;
  const apx = px - a.x;
  const apy = py - a.y;
  const apz = pz - a.z;
  const t = len2 > 1e-9 ? clamp01((apx * abx + apy * aby + apz * abz) / len2) : 0;
  const cx = a.x + abx * t;
  const cy = a.y + aby * t;
  const cz = a.z + abz * t;
  const dx = px - cx;
  const dy = py - cy;
  const dz = pz - cz;
  const radius = lerp(a.radius, b.radius, t);
  const archScale = lerp(a.archScale ?? 1, b.archScale ?? 1, t);
  const floorScale = lerp(a.floorScale ?? 1, b.floorScale ?? 1, t);
  const vScale = dy >= 0 ? archScale : floorScale;
  const qx = dx / radius;
  const qy = dy / (radius * vScale);
  const qz = dz / radius;
  const qlen = Math.sqrt(qx * qx + qy * qy + qz * qz);
  return radius * (1 - qlen); // positive inside the ellipsoid
}

// Deterministic, hand-authored angular "irregularity" applied to a mound's
// height and radius: a fixed sum of a few sine lobes around the mound's own
// (x, z) center, NOT randomness (no Rng, no seed dependence) - just a
// shaped, always-the-same silhouette so the entrance mound reads as an
// organic, irregular knoll (per the cave-entrance reference photo) instead
// of a perfectly circular hill. The tunnel's own carved doorway
// (segmentCarve) is untouched by this, so the opening itself always stays a
// clean walkable passage; only the surrounding rock/grass knoll gets the
// lumpy silhouette.
function moundIrregularity(angle: number): number {
  return (
    1 +
    0.16 * Math.sin(angle * 3 + 0.6) +
    0.09 * Math.cos(angle * 5 + 2.1) +
    0.05 * Math.sin(angle * 7 + 4.4)
  );
}

// Round 10: an entrance mound (TunnelWaypoint.mound) is now an ADDITIVE
// height bump on top of the ordinary heightfield - the exact same technique
// world.ts's own mountain ridge walls and world rim use (a Gaussian profile
// added straight onto terrainHeight, see RIDGE_HEIGHT/RIDGE_SIGMA in
// world.ts) - rather than a separate solid dome carved out with its own hard
// edge. A hard-edged dome has a near-discontinuous jump from flat ambient
// ground to full mound height over a thin ring at its boundary, which reads
// as a boulder or igloo dropped onto the grass, not a rise in the land
// itself. A Gaussian bump has NO edge: it decays continuously and
// gradually from full height at the center to (rounding to) zero far out,
// exactly like every other hill in this world, so the entrance knoll is
// provably the same terrain, not a second object standing on it.
// sigma (the Gaussian's width) is set so the bump has decayed to under 5% of
// its peak by moundRadius*2 - a wide, gentle skirt several times the visual
// "hill" size, matching how gradually the real ridge walls rise.
function moundHeightBump(
  x: number,
  z: number,
  w: { x: number; z: number; moundRadius?: number; moundHeight?: number; radius: number },
): number {
  const moundRadius = w.moundRadius ?? w.radius + 4;
  const moundHeight = w.moundHeight ?? 8;
  const dx = x - w.x;
  const dz = z - w.z;
  const dist2 = dx * dx + dz * dz;
  const sigma = moundRadius * 0.75;
  const angle = Math.atan2(dz, dx);
  const irregular = moundIrregularity(angle);
  return moundHeight * irregular * Math.exp(-dist2 / (2 * sigma * sigma));
}

// The real, walkable ground surface at (x, z): the ordinary heightfield plus
// every mound's additive bump (see moundHeightBump above). Every consumer
// that needs "where does the player actually stand outdoors here" - the
// tunnel_overlay shader's rock/grass blend, decoration/grass placement
// clearance, the mound's own reported bounds - reads this instead of the
// plain terrainHeight, so a mound's grassy exterior is never mistaken for
// "underground" or left floating relative to its own raised ground.
export function groundHeightWithMounds(x: number, z: number, seed: number): number {
  let h = terrainHeight(x, z, seed);
  for (const tunnel of TUNNELS) {
    for (const w of tunnel.waypoints) {
      if (w.mound) h += moundHeightBump(x, z, w);
    }
  }
  return h;
}

// Pure 0..1 "how deep inside a carved tunnel passage" factor at a world
// point, used by the renderer (tunnel_overlay.ts) to force the interior
// floor/walls/ceiling to always read as bare rock, never grass: the
// existing shader's grass/rock blend keys purely on surface normal slope,
// which is wrong for the tunnel's flattened, upward-facing floor
// (floorScale makes it face up like ordinary ground even though it is
// buried underground). Two conditions both have to hold: the point must sit
// meaningfully BELOW the ambient outdoor terrain height (so a mound's own
// grassy exterior, which sits AT or ABOVE ambient ground level, is never
// affected), and it must be close to some tunnel segment's own carved
// capsule (so open-air pockets far from any tunnel are not incorrectly
// forced to rock). Ramps in over a few yards on each axis rather than a
// hard cutoff, so the shader blend it feeds stays smooth.
export function tunnelInteriorFactor(x: number, y: number, z: number, seed: number): number {
  const ambient = groundHeightWithMounds(x, z, seed);
  const depthBelowAmbient = ambient - y;
  if (depthBelowAmbient <= 0) return 0;
  const depthT = clamp01(depthBelowAmbient / 3);
  let bestCarve = -Infinity;
  for (const tunnel of TUNNELS) {
    for (let i = 0; i + 1 < tunnel.waypoints.length; i++) {
      const carve = segmentCarve(x, y, z, tunnel.waypoints[i], tunnel.waypoints[i + 1]);
      if (carve > bestCarve) bestCarve = carve;
    }
  }
  const PROXIMITY_MARGIN = 6; // yd of falloff beyond the carved radius still counted as "near the passage"
  const proximityT = clamp01((bestCarve + PROXIMITY_MARGIN) / PROXIMITY_MARGIN);
  return clamp01(Math.min(depthT, proximityT));
}

// True 3D voxel density at a world point: negative = solid, positive = air,
// zero at the surface. Pure function of (x, y, z, seed) plus the fixed,
// hand-authored TUNNELS content.
export function voxelDensity(x: number, y: number, z: number, seed: number): number {
  let density = y - groundHeightWithMounds(x, z, seed);
  for (const tunnel of TUNNELS) {
    for (let i = 0; i + 1 < tunnel.waypoints.length; i++) {
      const carve = segmentCarve(x, y, z, tunnel.waypoints[i], tunnel.waypoints[i + 1]);
      if (carve > density) density = carve;
    }
  }
  return density;
}

export function isSolidVoxel(x: number, y: number, z: number, seed: number): boolean {
  return voxelDensity(x, y, z, seed) <= 0;
}

// Axis-aligned world-space bounding box a tunnel's geometry can possibly
// touch (waypoint sphere bounds + radius), used by the renderer/mesher to
// decide which chunks need tunnel meshing at all instead of sampling the
// whole world.
export function tunnelBounds(tunnel: (typeof TUNNELS)[number]): {
  minX: number;
  minY: number;
  minZ: number;
  maxX: number;
  maxY: number;
  maxZ: number;
} {
  let minX = Infinity;
  let minY = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxZ = -Infinity;
  for (const w of tunnel.waypoints) {
    const archScale = w.archScale ?? 1;
    const floorScale = w.floorScale ?? 1;
    const moundRadius = w.mound ? (w.moundRadius ?? w.radius + 4) : 0;
    const moundHeight = w.mound ? (w.moundHeight ?? 8) : 0;
    // The mound's Gaussian bump (moundHeightBump, sigma = moundRadius*0.75)
    // has a wide, gradual tail rather than a hard edge, so its practically-
    // visible footprint reaches further than moundRadius itself - pad by 2x
    // (about 2.7 sigma, under 5% of peak height) to keep the chunk exclusion
    // and mesh height band covering the whole visible rise.
    const lateral = Math.max(w.radius, moundRadius * 2);
    minX = Math.min(minX, w.x - lateral);
    minY = Math.min(minY, w.y - w.radius * floorScale);
    minZ = Math.min(minZ, w.z - lateral);
    maxX = Math.max(maxX, w.x + lateral);
    maxY = Math.max(maxY, w.y + w.radius * archScale, w.y + moundHeight * 1.3);
    maxZ = Math.max(maxZ, w.z + lateral);
  }
  return { minX, minY, minZ, maxX, maxY, maxZ };
}

// True when an axis-aligned world-space box [x0, x0+sizeX) x [z0, z0+sizeZ)
// (an XZ footprint only, e.g. one terrain chunk) comes within `margin` of any
// authored tunnel's own bounding box. Used by terrain.ts to leave a hole
// where a tunnel's combined terrain+cave patch (render/tunnel_overlay.ts)
// replaces the classic heightfield outright, instead of layering a second
// mesh over it (which used to z-fight the real terrain).
export function chunkNearAnyTunnel(
  x0: number,
  z0: number,
  sizeX: number,
  sizeZ: number,
  margin: number,
): boolean {
  for (const tunnel of TUNNELS) {
    const b = tunnelBounds(tunnel);
    if (x0 > b.maxX + margin || x0 + sizeX < b.minX - margin) continue;
    if (z0 > b.maxZ + margin || z0 + sizeZ < b.minZ - margin) continue;
    return true;
  }
  return false;
}

export type { TunnelVolume, TunnelWaypoint } from './content/tunnels';
export { TUNNELS };
