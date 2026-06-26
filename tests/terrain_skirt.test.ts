import { describe, it, expect } from 'vitest';
import { ZONES } from '../src/sim/data';
import { terrainHeight } from '../src/sim/world';
import {
  chordSag,
  skirtDrop,
  MIN_SKIRT_DROP,
  MAX_SKIRT_DROP,
} from '../src/render/terrain_skirt';

// Far-band LOD spacings from terrain.ts LOD_BANDS (the coarsest a neighbour
// chunk can use, so the worst case a skirt must hide).
const FAR_SPACING_HIGH = 3.5;
const FAR_SPACING_LOW = 6.5;

const sampler = (seed: number) => (x: number, z: number) => terrainHeight(x, z, seed);

/** Scan a zone-boundary mountain ridge for the point of greatest chord sag. */
function worstRidgeSag(seed: number, span: number): { x: number; z: number; sag: number } {
  const sample = sampler(seed);
  const ridgeZ = ZONES[0].zMax; // a convex mountain wall runs along this latitude
  let best = { x: 0, z: ridgeZ, sag: 0 };
  // away from the central pass (x ~ 0), sweep both flanks of the wall
  for (let x = 20; x <= 160; x += 1) {
    for (let dz = -24; dz <= 24; dz += 1) {
      const z = ridgeZ + dz;
      const sag = chordSag(terrainHeight(x, z, seed), x, z, span, sample);
      if (sag > best.sag) best = { x, z, sag };
    }
  }
  return best;
}

describe('chordSag', () => {
  it('is zero on a planar slope however steep (no crack to hide)', () => {
    const plane: (x: number, z: number) => number = (x, z) => 3 * x + 7 * z;
    expect(chordSag(plane(10, 10), 10, 10, 5, plane)).toBeCloseTo(0, 6);
  });

  it('is positive on a convex hump and zero in a concave bowl', () => {
    const hump: (x: number, z: number) => number = (x, z) => -(x * x + z * z) * 0.1;
    const bowl: (x: number, z: number) => number = (x, z) => (x * x + z * z) * 0.1;
    expect(chordSag(hump(0, 0), 0, 0, 4, hump)).toBeGreaterThan(0);
    expect(chordSag(bowl(0, 0), 0, 0, 4, bowl)).toBe(0);
  });
});

describe('skirtDrop', () => {
  it('keeps the shallow legacy skirt where there is no sag', () => {
    expect(skirtDrop(0)).toBe(MIN_SKIRT_DROP);
  });

  it('deepens with sag and is monotonic', () => {
    expect(skirtDrop(1.5)).toBeGreaterThan(MIN_SKIRT_DROP);
    expect(skirtDrop(3)).toBeGreaterThan(skirtDrop(1));
  });

  it('caps at MAX_SKIRT_DROP', () => {
    expect(skirtDrop(1000)).toBe(MAX_SKIRT_DROP);
  });

  it('is pure/deterministic', () => {
    expect(skirtDrop(0.73)).toBe(skirtDrop(0.73));
  });
});

describe('terrain LOD seam (regression)', () => {
  // Reproduces the bug: the real zone-boundary ridge is convex enough that a
  // coarse neighbour chunk's chord sags below the fine edge by far more than the
  // old fixed 0.3u skirt could hide, so the gap showed the background through it
  // as a thin bright line running the width of the map at that latitude.
  const seed = 1;

  it('the convex ridge sags more than the old fixed 0.3u skirt', () => {
    expect(worstRidgeSag(seed, FAR_SPACING_HIGH).sag).toBeGreaterThan(MIN_SKIRT_DROP);
    expect(worstRidgeSag(seed, FAR_SPACING_LOW).sag).toBeGreaterThan(MIN_SKIRT_DROP);
  });

  it('the adaptive skirt closes the gap at the worst ridge point', () => {
    for (const spacing of [FAR_SPACING_HIGH, FAR_SPACING_LOW]) {
      const worst = worstRidgeSag(seed, spacing);
      expect(skirtDrop(worst.sag)).toBeGreaterThanOrEqual(worst.sag);
      expect(skirtDrop(worst.sag)).toBeLessThanOrEqual(MAX_SKIRT_DROP);
    }
  });

  it('is deterministic for a fixed seed', () => {
    expect(worstRidgeSag(seed, FAR_SPACING_HIGH)).toEqual(worstRidgeSag(seed, FAR_SPACING_HIGH));
  });
});
