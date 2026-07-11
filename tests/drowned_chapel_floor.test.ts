// Covers the Drowned Chapel stair climb: the player's resolved standing
// height must actually rise/fall while walking the stair flight, the flight
// must sit at a real, climbable pitch (30-35 degrees, not the old ~53 degree
// "ladder"), and the stairwell ceiling cutout must clear the full flight
// footprint so the flight never clips solid ceiling.
import { describe, expect, it } from 'vitest';
import {
  CHAPEL_HALF,
  CHAPEL_POS,
  CHAPEL_STAIR_FLIGHT_RUN,
  CHAPEL_STAIR_PITCH_RAD,
  CHAPEL_STAIR_WIDTH,
  CHAPEL_STAIRS,
} from '../src/sim/content/drowned_chapel';
import {
  chapelFloorY,
  chapelVoxelDensity,
  isInsideChapelFootprint,
} from '../src/sim/drowned_chapel_building';
import { chapelStandHeight } from '../src/sim/drowned_chapel_floor';
import { RUIN_COMPOUND_CLEAR_RADIUS } from '../src/sim/ruin_compound_layout';
import { groundHeight } from '../src/sim/world';

const SEED = 12345;

describe('Drowned Chapel: the stair flight is a real, climbable staircase', () => {
  const s = CHAPEL_STAIRS[0];

  it('pitches between 30 and 35 degrees (was ~53 degrees pre-fix)', () => {
    const deg = (CHAPEL_STAIR_PITCH_RAD * 180) / Math.PI;
    expect(deg).toBeGreaterThanOrEqual(30);
    expect(deg).toBeLessThanOrEqual(35);
  });

  it('walking from the bottom of the flight to the landing raises standing height continuously to floor 2', () => {
    const steps = 20;
    let prevY = -Infinity;
    let sawRise = false;
    for (let i = 0; i <= steps; i++) {
      const f = i / steps; // 0 = bottom, 1 = landing (top)
      const dAlong = -s.dir * CHAPEL_STAIR_FLIGHT_RUN * (1 - f);
      const x = s.axis === 'z' ? s.x : s.x + dAlong;
      const z = s.axis === 'z' ? s.z + dAlong : s.z;
      const y = chapelStandHeight(x, z, SEED, 1);
      expect(y).toBeGreaterThanOrEqual(prevY - 1e-6);
      if (y > prevY + 1e-6) sawRise = true;
      prevY = y;
    }
    expect(sawRise).toBe(true);
    // Bottom of the flight rests near floor 1, the landing at floor 2.
    const bottomX = s.axis === 'z' ? s.x : s.x - s.dir * CHAPEL_STAIR_FLIGHT_RUN;
    const bottomZ = s.axis === 'z' ? s.z - s.dir * CHAPEL_STAIR_FLIGHT_RUN : s.z;
    expect(chapelStandHeight(bottomX, bottomZ, SEED, 1)).toBeCloseTo(chapelFloorY(SEED, 1), 1);
    expect(chapelStandHeight(s.x, s.z, SEED, 2)).toBeCloseTo(chapelFloorY(SEED, 2), 5);
  });

  it('descending the flight from floor 2 lowers standing height back to floor 1, symmetrically', () => {
    const topY = chapelStandHeight(s.x, s.z, SEED, 2);
    const midDAlong = -s.dir * (CHAPEL_STAIR_FLIGHT_RUN / 2);
    const midX = s.axis === 'z' ? s.x : s.x + midDAlong;
    const midZ = s.axis === 'z' ? s.z + midDAlong : s.z;
    const midY = chapelStandHeight(midX, midZ, SEED, 2);
    expect(midY).toBeLessThan(topY);
    expect(midY).toBeGreaterThan(chapelFloorY(SEED, 1) - 1e-6);
  });

  it('off the stair footprint, standing height is the flat per-floor height', () => {
    // Southeast altar corner (floor 1 furniture landmark), well clear of the flight.
    const x = CHAPEL_POS.x + (CHAPEL_HALF - 1.2);
    const z = CHAPEL_POS.z - (CHAPEL_HALF - 1.2);
    expect(chapelStandHeight(x, z, SEED, 1)).toBeCloseTo(chapelFloorY(SEED, 1), 6);
  });

  it('outside the footprint, standing height is exactly plain ground height', () => {
    const x = 0,
      z = 0;
    expect(isInsideChapelFootprint(x, z)).toBe(false);
    expect(chapelStandHeight(x, z, SEED, 1)).toBe(groundHeight(x, z, SEED));
  });

  it('the stairwell ceiling cutout clears the ENTIRE visible flight footprint (no ceiling clip)', () => {
    const upperFloorY = chapelFloorY(SEED, 2);
    const baseY = chapelFloorY(SEED, 1);
    const stepsToCheck = 24;
    for (let i = 0; i <= stepsToCheck; i++) {
      const f = i / stepsToCheck;
      const dAlong = -s.dir * CHAPEL_STAIR_FLIGHT_RUN * (1 - f);
      const x = s.axis === 'z' ? s.x : s.x + dAlong;
      const z = s.axis === 'z' ? s.z + dAlong : s.z;
      // Sample just above head height for someone standing on the ramp at
      // this point in the flight: density must read as air (positive),
      // never solid slab (negative), just below the floor-2 slab.
      const rampY = baseY + f * (upperFloorY - baseY);
      const headY = rampY + 1.8;
      const density = chapelVoxelDensity(x, headY, z, SEED);
      expect(density).toBeGreaterThan(0);
    }
  });
});

describe('Drowned Chapel: bigger footprint stays clear of foliage', () => {
  it('RUIN_COMPOUND_CLEAR_RADIUS comfortably exceeds the footprint half-diagonal', () => {
    const halfDiagonal = CHAPEL_HALF * Math.SQRT2;
    expect(RUIN_COMPOUND_CLEAR_RADIUS).toBeGreaterThan(halfDiagonal + 1);
  });

  it('the stair flight footprint stays within the building half-extent (no wall clip)', () => {
    const s = CHAPEL_STAIRS[0];
    // Landing (top) and bottom-most step, in local (relative to CHAPEL_POS) coords.
    const landingLocal = s.axis === 'z' ? s.z - CHAPEL_POS.z : s.x - CHAPEL_POS.x;
    const bottomLocal = landingLocal - s.dir * CHAPEL_STAIR_FLIGHT_RUN;
    const interiorLimit = CHAPEL_HALF - CHAPEL_STAIR_WIDTH / 2;
    expect(Math.abs(landingLocal)).toBeLessThan(interiorLimit);
    expect(Math.abs(bottomLocal)).toBeLessThan(interiorLimit);
  });
});
