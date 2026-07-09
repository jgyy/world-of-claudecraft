import { describe, expect, it } from 'vitest';
import { isBlocked, isInsideKeepPos, keepColliders, resolvePosition } from '../src/sim/colliders';
import { KEEP_HALF, KEEP_POS, KEEP_STAIRS } from '../src/sim/content/keep';
import { nextActiveFloor } from '../src/sim/keep_floor';
import {
  isInsideKeepFootprint,
  keepBaseY,
  keepFloorY,
  keepVoxelDensity,
} from '../src/sim/voxel_building';
import { meshVoxelChunk } from '../src/sim/voxel_mesh';

const SEED = 1;

describe('keep voxel density (voxel_building.ts)', () => {
  it('is a pure function: same inputs always give the same density', () => {
    const a = keepVoxelDensity(KEEP_POS.x, keepBaseY(SEED) + 1, KEEP_POS.z, SEED);
    const b = keepVoxelDensity(KEEP_POS.x, keepBaseY(SEED) + 1, KEEP_POS.z, SEED);
    expect(a).toBe(b);
  });

  it('is solid below the ground floor (foundation)', () => {
    const baseY = keepBaseY(SEED);
    expect(keepVoxelDensity(KEEP_POS.x, baseY - 0.5, KEEP_POS.z, SEED)).toBeLessThan(0);
  });

  it('is open air in the middle of the ground floor interior', () => {
    const baseY = keepBaseY(SEED);
    expect(keepVoxelDensity(KEEP_POS.x, baseY + 1.5, KEEP_POS.z, SEED)).toBeGreaterThan(0);
  });

  it('is solid on the exterior wall perimeter, away from the door', () => {
    const baseY = keepBaseY(SEED);
    // north wall midpoint, ground-floor height: solid
    expect(
      keepVoxelDensity(KEEP_POS.x, baseY + 1.5, KEEP_POS.z + KEEP_HALF - 0.05, SEED),
    ).toBeLessThan(0);
  });

  it('is open air through the south-wall door gap at ground level', () => {
    const baseY = keepBaseY(SEED);
    expect(
      keepVoxelDensity(KEEP_POS.x, baseY + 1, KEEP_POS.z - KEEP_HALF + 0.05, SEED),
    ).toBeGreaterThan(0);
  });

  it('is solid on the south wall just past the door gap, same height', () => {
    const baseY = keepBaseY(SEED);
    expect(
      keepVoxelDensity(
        KEEP_POS.x + KEEP_HALF - 0.5,
        baseY + 1,
        KEEP_POS.z - KEEP_HALF + 0.05,
        SEED,
      ),
    ).toBeLessThan(0);
  });

  it('carves a stairwell opening through the floor 1/2 slab at the landing', () => {
    const landing = KEEP_STAIRS[0];
    const slabY = keepFloorY(SEED, 2);
    // at the landing center: open (the stairwell hole)
    expect(keepVoxelDensity(landing.x, slabY, landing.z, SEED)).toBeGreaterThan(0);
    // well away from the landing, same slab height: solid floor
    expect(
      keepVoxelDensity(KEEP_POS.x - KEEP_HALF + 0.5, slabY, KEEP_POS.z - KEEP_HALF + 0.5, SEED),
    ).toBeLessThan(0);
  });

  it('meshes into real triangles via the shared voxel mesher', () => {
    const density = (x: number, y: number, z: number) => keepVoxelDensity(x, y, z, SEED);
    const baseY = keepBaseY(SEED);
    const mesh = meshVoxelChunk(density, {
      x0: KEEP_POS.x - KEEP_HALF - 1,
      y0: baseY - 1,
      z0: KEEP_POS.z - KEEP_HALF - 1,
      size: KEEP_HALF * 2 + 2,
      resolution: 24,
    });
    expect(mesh.positions.length).toBeGreaterThan(0);
    expect(mesh.indices.length).toBeGreaterThan(0);
    expect(mesh.indices.length % 3).toBe(0);
  });

  it('isInsideKeepFootprint agrees with isInsideKeepPos (colliders.ts)', () => {
    expect(isInsideKeepFootprint(KEEP_POS.x, KEEP_POS.z)).toBe(true);
    expect(isInsideKeepPos(KEEP_POS.x, KEEP_POS.z)).toBe(true);
    expect(isInsideKeepFootprint(KEEP_POS.x + 500, KEEP_POS.z)).toBe(false);
    expect(isInsideKeepPos(KEEP_POS.x + 500, KEEP_POS.z)).toBe(false);
  });
});

describe('keep floor transitions (keep_floor.ts)', () => {
  it('stays at floor 0 (outside) far from the keep', () => {
    expect(nextActiveFloor(0, 0, 0)).toBe(0);
  });

  it('steps to floor 1 the instant a player walks into the footprint', () => {
    expect(nextActiveFloor(0, KEEP_POS.x, KEEP_POS.z)).toBe(1);
  });

  it('resets to 0 when the player walks back outside the footprint', () => {
    expect(nextActiveFloor(1, 0, 0)).toBe(0);
  });

  it('stays on the current floor away from any stair landing', () => {
    expect(nextActiveFloor(1, KEEP_POS.x, KEEP_POS.z)).toBe(1);
    expect(nextActiveFloor(2, KEEP_POS.x, KEEP_POS.z)).toBe(2);
  });

  it('steps up from floor 1 to floor 2 on the first landing', () => {
    const landing = KEEP_STAIRS[0];
    expect(nextActiveFloor(1, landing.x, landing.z)).toBe(2);
  });

  it('steps back down from floor 2 to floor 1 on the same landing', () => {
    const landing = KEEP_STAIRS[0];
    expect(nextActiveFloor(2, landing.x, landing.z)).toBe(1);
  });

  it('does not transition off the wrong floor at a landing', () => {
    const landing = KEEP_STAIRS[0]; // fromFloor 1, toFloor 2
    expect(nextActiveFloor(3, landing.x, landing.z)).toBe(3);
  });

  it('steps up from floor 2 to floor 3 on the second landing', () => {
    const landing = KEEP_STAIRS[1];
    expect(nextActiveFloor(2, landing.x, landing.z)).toBe(3);
  });

  it('full walkthrough: in, up to 2, up to 3, back down to 1, out', () => {
    let floor: 0 | 1 | 2 | 3 = 0;
    floor = nextActiveFloor(floor, KEEP_POS.x, KEEP_POS.z); // walk in
    expect(floor).toBe(1);
    floor = nextActiveFloor(floor, KEEP_STAIRS[0].x, KEEP_STAIRS[0].z); // stairs up
    expect(floor).toBe(2);
    floor = nextActiveFloor(floor, KEEP_STAIRS[1].x, KEEP_STAIRS[1].z); // stairs up
    expect(floor).toBe(3);
    floor = nextActiveFloor(floor, KEEP_STAIRS[1].x, KEEP_STAIRS[1].z); // same landing, back down
    expect(floor).toBe(2);
    floor = nextActiveFloor(floor, KEEP_STAIRS[0].x, KEEP_STAIRS[0].z); // back down again
    expect(floor).toBe(1);
    floor = nextActiveFloor(floor, 0, 0); // walk out the same door
    expect(floor).toBe(0);
  });
});

describe('keep collider swap by activeFloor (colliders.ts)', () => {
  it('resolvePosition routes keep-footprint points through keepColliders, not the open grid', () => {
    // Standing right on the exterior wall centerline should get pushed out,
    // proving the wall collider (not the plain open-world grid) is active.
    const wallX = KEEP_POS.x + KEEP_HALF - 0.05;
    const res = resolvePosition(SEED, wallX, KEEP_POS.z, 0.5, false, undefined, 1);
    expect(Math.abs(res.x - wallX)).toBeGreaterThan(0);
  });

  it('the door gap lets a player walk straight through on any floor', () => {
    const doorX = KEEP_POS.x;
    const doorZ = KEEP_POS.z - KEEP_HALF + 0.1;
    expect(isBlocked(SEED, doorX, doorZ, 0.4, false, undefined, 1)).toBe(false);
  });

  it('the per-floor furniture collider actually differs by floor (the swap)', () => {
    const floor1 = keepColliders(SEED, 1);
    const floor2 = keepColliders(SEED, 2);
    const furniture1 = floor1[floor1.length - 1];
    const furniture2 = floor2[floor2.length - 1];
    expect(furniture1).not.toEqual(furniture2);
  });

  it('a point blocked by floor 1s furniture collider is clear on floor 2', () => {
    const floor1 = keepColliders(SEED, 1);
    const marker = floor1[floor1.length - 1];
    expect(marker.type).toBe('circle');
    if (marker.type !== 'circle') return;
    const blockedOnFloor1 = isBlocked(SEED, marker.x, marker.z, 0.1, false, undefined, 1);
    expect(blockedOnFloor1).toBe(true);
    const blockedOnFloor2 = isBlocked(SEED, marker.x, marker.z, 0.1, false, undefined, 2);
    expect(blockedOnFloor2).toBe(false);
  });
});
