import { CHAPEL_HALF } from './content/drowned_chapel';
import type { HeightStamp } from './types';

// Shared layout constants for the Zone 2 (Mirefen Marsh) ruined temple
// compound (ZONE2_PROPS.ruinDecor placement in content/zone2.ts, the terrain
// flatten below, and the tree/rock/grass exclusion in world.ts + foliage.ts),
// so the "clear, level courtyard" reading never drifts out of sync across
// the three systems that each independently touch this patch of ground.
export const RUIN_COMPOUND_CENTER = { x: 100, z: 435 };
// Foliage exclusion radius: trees/rocks/grass/dressing are kept off the
// building and a small collar around it (world.ts, foliage.ts), so nothing
// grows up through the walls. Sized just past the footprint corners
// (CHAPEL_HALF * sqrt(2) is about 11.3), not a wide courtyard.
export const RUIN_COMPOUND_CLEAR_RADIUS = 14;
// The terrain flatten now matches the Drowned Chapel's footprint EXACTLY: a
// single hard-edged flat plateau (falloff 'flat', so the whole footprint sits
// dead level) sized to the building's half-extent, with NO wider apron/ramp
// ring extending outward. The building's own solid foundation box
// (drowned_chapel_building.ts) covers the square footprint down past the
// terrain, so the four corners (which fall just outside this inscribed flat
// disc) still rest on solid foundation, not floating terrain. Just outside
// the walls the ground returns immediately to natural grade: no apron.
export const RUIN_COMPOUND_PLATEAU_RADIUS = CHAPEL_HALF;
// Raised above the natural grade sampled at the compound center before this
// flatten existed (-2.1), so the sanctum floor reads as a built plinth rather
// than a patch flush with the surrounding marsh meadow.
export const RUIN_COMPOUND_FLOOR_HEIGHT = -0.9;

export function isInRuinCompoundClearing(x: number, z: number): boolean {
  const dx = x - RUIN_COMPOUND_CENTER.x;
  const dz = z - RUIN_COMPOUND_CENTER.z;
  return dx * dx + dz * dz < RUIN_COMPOUND_CLEAR_RADIUS * RUIN_COMPOUND_CLEAR_RADIUS;
}

// A single flat 'level' stamp sized to the building footprint: the whole
// plateau sits dead level at the target height and the terrain returns to
// natural grade right at the plateau edge (no apron/ramp ring).
export const RUIN_COMPOUND_TERRAIN_EDITS: HeightStamp[] = [
  {
    x: RUIN_COMPOUND_CENTER.x,
    z: RUIN_COMPOUND_CENTER.z,
    radius: RUIN_COMPOUND_PLATEAU_RADIUS,
    delta: RUIN_COMPOUND_FLOOR_HEIGHT,
    falloff: 'flat',
    mode: 'level',
  },
];
