import type { HeightStamp } from './types';

// Shared layout constants for the Zone 2 (Mirefen Marsh) ruined temple
// compound (ZONE2_PROPS.ruinDecor placement in content/zone2.ts, the terrain
// flatten below, and the tree/rock/grass exclusion in world.ts + foliage.ts),
// so the "clear, level courtyard" reading never drifts out of sync across
// the three systems that each independently touch this patch of ground.
export const RUIN_COMPOUND_CENTER = { x: 100, z: 435 };
// Wider radius: trees/rocks/grass/dressing exclusion (world.ts, foliage.ts),
// so the swept ground extends a little past the walls to the satellite
// features (well, graveyard, benches).
export const RUIN_COMPOUND_CLEAR_RADIUS = 24;
// The actual raised plinth: a hard-edged plateau (falloff 'flat', so the
// whole interior sits at the SAME height, no gentle dome/slope) covering the
// floor-tile footprint plus the wall line, then a short smooth apron ring
// down to natural grade just outside it, so the wall reads as sitting on a
// real retaining edge rather than melting into the meadow.
export const RUIN_COMPOUND_PLATEAU_RADIUS = 11;
export const RUIN_COMPOUND_APRON_RADIUS = 16;
// Raised ~1.2 units above the natural grade sampled at the compound center
// before this flatten existed (-2.1), so the compound reads as a built
// plinth the player climbs onto (the stairway prop marks the ascent),
// not just a level patch flush with the surrounding meadow.
export const RUIN_COMPOUND_FLOOR_HEIGHT = -0.9;

export function isInRuinCompoundClearing(x: number, z: number): boolean {
  const dx = x - RUIN_COMPOUND_CENTER.x;
  const dz = z - RUIN_COMPOUND_CENTER.z;
  return dx * dx + dz * dz < RUIN_COMPOUND_CLEAR_RADIUS * RUIN_COMPOUND_CLEAR_RADIUS;
}

// Two stamps, applied in order: the flat plateau first (hard-edged, so the
// whole floor sits dead level), then a wider smooth 'level' ring toward the
// same height, which only affects the untouched ground between the plateau
// edge and the apron radius (a stamp already at the target height is a
// no-op under 'level'), producing the short ramp down to natural grade.
export const RUIN_COMPOUND_TERRAIN_EDITS: HeightStamp[] = [
  {
    x: RUIN_COMPOUND_CENTER.x,
    z: RUIN_COMPOUND_CENTER.z,
    radius: RUIN_COMPOUND_PLATEAU_RADIUS,
    delta: RUIN_COMPOUND_FLOOR_HEIGHT,
    falloff: 'flat',
    mode: 'level',
  },
  {
    x: RUIN_COMPOUND_CENTER.x,
    z: RUIN_COMPOUND_CENTER.z,
    radius: RUIN_COMPOUND_APRON_RADIUS,
    delta: RUIN_COMPOUND_FLOOR_HEIGHT,
    falloff: 'smooth',
    mode: 'level',
  },
];
