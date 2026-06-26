// Adaptive terrain skirt depth.
//
// Terrain chunks are meshed at distance-based LOD (coarser vertex spacing far
// from the zone hubs) and edged with a downward "skirt" ring of vertices that
// hides the cracks where a fine chunk abuts a coarse one. Along a shared edge
// the fine chunk's extra vertices ride the true (curved) surface while the
// coarse chunk spans the same stretch with a single straight chord. Where the
// surface is convex (a ridge crest), the true surface bulges ABOVE that chord,
// so the fine edge floats over the coarse chord and the gap between them shows
// the background through it (a classic LOD T-junction crack).
//
// The depth of that gap is the chord's SAG, set by the terrain's curvature over
// one coarse span, NOT by its slope: a perfectly planar slope, however steep,
// has zero sag and no crack. The zone-boundary mountain ridges (src/sim/world.ts)
// are convex and run the width of the map at a fixed latitude, so a chunk seam
// crossing a crest opened a sag far deeper than the old fixed 0.3u skirt and
// read as a thin bright line spanning the map (mirrored on both sides of the
// central pass). Sizing each skirt vertex to its local sag closes the crack on
// crests while staying shallow on flats and planar slopes, where a tall skirt
// would otherwise show as a wall at grazing camera angles.
//
// Host-agnostic (no Three.js, no DOM): the math is pure so it is unit tested
// directly; the chunk builder in terrain.ts is a thin consumer.

/** A terrain height sampler: world (x, z) -> surface height. */
export type HeightSampler = (x: number, z: number) => number;

/** Minimum skirt depth (world units): the old fixed value, kept for flats. */
export const MIN_SKIRT_DROP = 0.3;
/** Cap so a pathological crest cannot spawn an absurdly deep skirt wall. */
export const MAX_SKIRT_DROP = 8;
// A small constant added so the skirt clears the chord rather than only meeting
// it (covers sub-span curvature the two-sided estimate misses).
const MARGIN = 0.25;

/**
 * Worst-case chord sag a coarse neighbour can open at an edge vertex: how far
 * the true surface bulges above the straight chord a neighbour at `span`
 * spacing would draw through this point. Measured on both axes (a chunk edge
 * can run along either) and floored at 0 (concave regions never see through).
 *
 * @param height  true surface height at (x, z)
 * @param x,z     vertex world position
 * @param span    coarsest neighbour vertex spacing (world units)
 * @param sample  terrain height sampler
 */
export function chordSag(
  height: number,
  x: number,
  z: number,
  span: number,
  sample: HeightSampler,
): number {
  const alongX = height - 0.5 * (sample(x - span, z) + sample(x + span, z));
  const alongZ = height - 0.5 * (sample(x, z - span) + sample(x, z + span));
  return Math.max(0, alongX, alongZ);
}

/**
 * Skirt depth for an edge vertex given the chord sag it must hide, clamped to
 * [MIN_SKIRT_DROP, MAX_SKIRT_DROP].
 */
export function skirtDrop(sag: number): number {
  const drop = sag + MARGIN;
  if (drop < MIN_SKIRT_DROP) return MIN_SKIRT_DROP;
  if (drop > MAX_SKIRT_DROP) return MAX_SKIRT_DROP;
  return drop;
}
