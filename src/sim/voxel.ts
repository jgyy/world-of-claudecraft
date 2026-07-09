import { TUNNELS } from './content/tunnels';
import { terrainHeight } from './world';

// A true 3D voxel density field, layered on top of the existing (x,z)->y
// heightfield (world.ts). `voxelDensity` is a pure function of (x, y, z, seed):
// negative = solid ground, positive = open air. Outdoors, away from any
// authored tunnel, it is exactly `y - terrainHeight(x, z, seed)`, so the
// voxel field's surface is byte-identical to the existing heightfield and
// every existing (x,z)-only consumer (colliders, pathfind, mob locomotion)
// keeps working unchanged. Tunnels are hand-authored capsule paths (see
// content/tunnels.ts) subtracted from the solid terrain: the ONLY way caves
// get carved, matching the "terrain is a pure function of seed" invariant in
// world.ts (no procedural cave noise).
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

// Additive solid contribution of one entrance mound (TunnelWaypoint.mound):
// positive "how solid" inside a dome of rock anchored to the ambient ground
// level at the mound's own (x, z) - not the sampled point's local terrain,
// so the dome stays a fixed, well-formed shape regardless of the point being
// sampled. Only ever adds material ABOVE that ground level (a real
// protruding knoll the tunnel mouth is cut into), never below it, where the
// ordinary terrain density already applies.
function moundSolidAmount(
  x: number,
  y: number,
  z: number,
  w: { x: number; z: number; radius: number; moundRadius?: number; moundHeight?: number },
  seed: number,
): number {
  const moundRadius = w.moundRadius ?? w.radius + 4;
  const moundHeight = w.moundHeight ?? 8;
  const base = terrainHeight(w.x, w.z, seed);
  const dy = y - base;
  if (dy < 0) return -Infinity;
  const qx = (x - w.x) / moundRadius;
  const qy = dy / moundHeight;
  const qz = (z - w.z) / moundRadius;
  const qlen = Math.sqrt(qx * qx + qy * qy + qz * qz);
  return moundHeight * (1 - qlen);
}

// True 3D voxel density at a world point: negative = solid, positive = air,
// zero at the surface. Pure function of (x, y, z, seed) plus the fixed,
// hand-authored TUNNELS content.
export function voxelDensity(x: number, y: number, z: number, seed: number): number {
  let density = y - terrainHeight(x, z, seed);
  for (const tunnel of TUNNELS) {
    for (const w of tunnel.waypoints) {
      if (!w.mound) continue;
      const solid = moundSolidAmount(x, y, z, w, seed);
      if (solid > 0) density = Math.min(density, -solid);
    }
  }
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
    const lateral = Math.max(w.radius, moundRadius);
    minX = Math.min(minX, w.x - lateral);
    minY = Math.min(minY, w.y - w.radius * floorScale);
    minZ = Math.min(minZ, w.z - lateral);
    maxX = Math.max(maxX, w.x + lateral);
    maxY = Math.max(maxY, w.y + w.radius * archScale, w.y + moundHeight);
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
