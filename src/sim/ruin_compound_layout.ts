import type { HeightStamp } from './types';

// Shared layout constants for the Zone 2 (Mirefen Marsh) ruined temple
// compound (ZONE2_PROPS.ruinDecor placement in content/zone2.ts, the terrain
// flatten below, and the tree/rock/grass exclusion in world.ts + foliage.ts),
// so the "clear, level courtyard" reading never drifts out of sync across
// the three systems that each independently touch this patch of ground.
export const RUIN_COMPOUND_CENTER = { x: 100, z: 435 };
export const RUIN_COMPOUND_CLEAR_RADIUS = 24;
// Matches the natural terrain height sampled at the compound center before
// this flatten existed (tests/fixes.test.ts pins it).
export const RUIN_COMPOUND_FLOOR_HEIGHT = -2.1;

export function isInRuinCompoundClearing(x: number, z: number): boolean {
  const dx = x - RUIN_COMPOUND_CENTER.x;
  const dz = z - RUIN_COMPOUND_CENTER.z;
  return dx * dx + dz * dz < RUIN_COMPOUND_CLEAR_RADIUS * RUIN_COMPOUND_CLEAR_RADIUS;
}

export const RUIN_COMPOUND_TERRAIN_EDIT: HeightStamp = {
  x: RUIN_COMPOUND_CENTER.x,
  z: RUIN_COMPOUND_CENTER.z,
  radius: RUIN_COMPOUND_CLEAR_RADIUS,
  delta: RUIN_COMPOUND_FLOOR_HEIGHT,
  falloff: 'smooth',
  mode: 'level',
};
