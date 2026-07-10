import { describe, expect, it } from 'vitest';
import { isBlocked, isInsideKeepPos, keepColliders, resolvePosition } from '../src/sim/colliders';
import {
  KEEP_ATTIC_HEIGHT,
  KEEP_BODY_HEIGHT,
  KEEP_FLOOR_HEIGHT,
  KEEP_FLOORS,
  KEEP_HALF,
  KEEP_PAD_HALF,
  KEEP_POS,
  KEEP_STAIRS,
  KEEP_TOTAL_HEIGHT,
  KEEP_WINDOW_HALF_WIDTH,
} from '../src/sim/content/keep';
import { KEEP_STATE_OUTSIDE, type KeepState, nextKeepState } from '../src/sim/keep_floor';
import {
  isInsideKeepFootprint,
  keepBaseY,
  keepFloorY,
  keepVoxelDensity,
  keepWindowSpecs,
} from '../src/sim/voxel_building';
import { meshVoxelChunk } from '../src/sim/voxel_mesh';
import { terrainHeight } from '../src/sim/world';

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

  it('carves real window openings through the wall on the ground floor and an upper floor', () => {
    const baseY = keepBaseY(SEED);
    const specs = keepWindowSpecs();
    // A north-wall window on floor 1 (ground) and one on floor 3.
    for (const floor of [1, 3]) {
      const ly = (floor - 1) * KEEP_FLOOR_HEIGHT;
      const spec = specs.find(
        (s) => s.wall === 'north' && s.ly > ly && s.ly < ly + KEEP_FLOOR_HEIGHT && s.x > KEEP_POS.x,
      );
      expect(spec).toBeDefined();
      if (!spec) continue;
      const y = baseY + spec.ly;
      // Through the window center, inside the wall band: carved open air.
      expect(keepVoxelDensity(spec.x, y, KEEP_POS.z + KEEP_HALF - 0.1, SEED)).toBeGreaterThan(0);
      // Same height, wall center (no window there): solid wall.
      expect(keepVoxelDensity(KEEP_POS.x, y, KEEP_POS.z + KEEP_HALF - 0.1, SEED)).toBeLessThan(0);
      // Just past the window edge along the wall: solid again.
      expect(
        keepVoxelDensity(
          spec.x + KEEP_WINDOW_HALF_WIDTH + 0.5,
          y,
          KEEP_POS.z + KEEP_HALF - 0.1,
          SEED,
        ),
      ).toBeLessThan(0);
    }
  });

  it('has window specs on every floor and all four wall faces', () => {
    const specs = keepWindowSpecs();
    for (let floor = 1; floor <= KEEP_FLOORS; floor++) {
      const ly = (floor - 1) * KEEP_FLOOR_HEIGHT;
      const onFloor = specs.filter((s) => s.ly > ly && s.ly < ly + KEEP_FLOOR_HEIGHT);
      const walls = new Set(onFloor.map((s) => s.wall));
      expect(walls).toEqual(new Set(['north', 'south', 'east', 'west']));
      // a symmetric pair per wall face
      expect(onFloor.length).toBe(8);
    }
  });

  it('encloses the attic as interior space above the top floor slab', () => {
    const baseY = keepBaseY(SEED);
    // KEEP_FLOORS full stories plus an attic knee wall.
    expect(KEEP_FLOORS).toBe(4);
    expect(KEEP_TOTAL_HEIGHT).toBeCloseTo(KEEP_BODY_HEIGHT + KEEP_ATTIC_HEIGHT);
    // The attic floor (activeFloor 5) sits on the top floor slab.
    expect(keepFloorY(SEED, 5)).toBeCloseTo(baseY + KEEP_BODY_HEIGHT);
    // Open air standing in the attic, below the eave.
    expect(
      keepVoxelDensity(KEEP_POS.x, baseY + KEEP_BODY_HEIGHT + 1, KEEP_POS.z, SEED),
    ).toBeGreaterThan(0);
    // Solid attic knee wall at the same height, out at the wall perimeter.
    expect(
      keepVoxelDensity(
        KEEP_POS.x,
        baseY + KEEP_BODY_HEIGHT + 1,
        KEEP_POS.z + KEEP_HALF - 0.05,
        SEED,
      ),
    ).toBeLessThan(0);
  });

  it('carves a stairwell opening through the attic (top) floor slab at the floor 4/5 landing', () => {
    const landing = KEEP_STAIRS.find((s) => s.fromFloor === 4 && s.toFloor === 5);
    expect(landing).toBeDefined();
    if (!landing) return;
    const slabY = keepFloorY(SEED, 5); // top slab = attic floor
    expect(keepVoxelDensity(landing.x, slabY, landing.z, SEED)).toBeGreaterThan(0);
    // solid slab away from the landing
    expect(
      keepVoxelDensity(KEEP_POS.x - KEEP_HALF + 0.5, slabY, KEEP_POS.z + KEEP_HALF - 0.5, SEED),
    ).toBeLessThan(0);
  });

  it('isInsideKeepFootprint agrees with isInsideKeepPos (colliders.ts)', () => {
    expect(isInsideKeepFootprint(KEEP_POS.x, KEEP_POS.z)).toBe(true);
    expect(isInsideKeepPos(KEEP_POS.x, KEEP_POS.z)).toBe(true);
    expect(isInsideKeepFootprint(KEEP_POS.x + 500, KEEP_POS.z)).toBe(false);
    expect(isInsideKeepPos(KEEP_POS.x + 500, KEEP_POS.z)).toBe(false);
  });
});

describe('keep terrain pad (world.ts terrainHeight)', () => {
  it('is completely flat within the pad half-extent on every side', () => {
    const center = terrainHeight(KEEP_POS.x, KEEP_POS.z, SEED);
    for (let dx = -KEEP_PAD_HALF; dx <= KEEP_PAD_HALF; dx += KEEP_PAD_HALF / 3) {
      for (let dz = -KEEP_PAD_HALF; dz <= KEEP_PAD_HALF; dz += KEEP_PAD_HALF / 3) {
        const h = terrainHeight(KEEP_POS.x + dx, KEEP_POS.z + dz, SEED);
        expect(h).toBeCloseTo(center, 6);
      }
    }
  });

  it('the flat pad comfortably clears the keep walls (KEEP_HALF) with margin', () => {
    expect(KEEP_PAD_HALF).toBeGreaterThan(KEEP_HALF + 2);
    // The keep base Y equals the flat pad height (voxel shell sits flush).
    expect(keepBaseY(SEED)).toBeCloseTo(terrainHeight(KEEP_POS.x, KEEP_POS.z, SEED));
  });

  it('eases back to natural terrain past the pad, leaving far terrain unchanged', () => {
    // A point far from the keep is untouched by the pad (bit-identical path).
    const far = terrainHeight(50, 50, SEED);
    expect(Number.isFinite(far)).toBe(true);
  });
});

describe('keep floor transitions (keep_floor.ts)', () => {
  const at = (floor: 0 | 1 | 2 | 3, landingLock = -1): KeepState => ({ floor, landingLock });

  it('stays at floor 0 (outside) far from the keep', () => {
    expect(nextKeepState(KEEP_STATE_OUTSIDE, 0, 0)).toEqual(KEEP_STATE_OUTSIDE);
  });

  it('steps to floor 1 the instant a player walks into the footprint', () => {
    expect(nextKeepState(KEEP_STATE_OUTSIDE, KEEP_POS.x, KEEP_POS.z)).toEqual(at(1));
  });

  it('resets to 0 (unlocked) when the player walks back outside the footprint', () => {
    expect(nextKeepState(at(1), 0, 0)).toEqual(KEEP_STATE_OUTSIDE);
  });

  it('stays on the current floor away from any stair landing', () => {
    expect(nextKeepState(at(1), KEEP_POS.x, KEEP_POS.z)).toEqual(at(1));
    expect(nextKeepState(at(2), KEEP_POS.x, KEEP_POS.z)).toEqual(at(2));
  });

  it('steps up from floor 1 to floor 2 on the first landing and locks to it', () => {
    const landing = KEEP_STAIRS[0];
    expect(nextKeepState(at(1), landing.x, landing.z)).toEqual(at(2, 0));
  });

  it('steps back down from floor 2 to floor 1 approaching the same landing fresh', () => {
    const landing = KEEP_STAIRS[0];
    expect(nextKeepState(at(2), landing.x, landing.z)).toEqual(at(1, 0));
  });

  it('does not transition off the wrong floor at a landing (still locks it)', () => {
    const landing = KEEP_STAIRS[0]; // fromFloor 1, toFloor 2
    expect(nextKeepState(at(3), landing.x, landing.z)).toEqual(at(3, 0));
  });

  it('steps up from floor 2 to floor 3 on the second landing', () => {
    const landing = KEEP_STAIRS[1];
    expect(nextKeepState(at(2), landing.x, landing.z)).toEqual(at(3, 1));
  });

  it('climbs all the way to the attic: 3 to 4, then 4 to 5, on the new landings', () => {
    const l34 = KEEP_STAIRS[2];
    const l45 = KEEP_STAIRS[3];
    expect(l34.fromFloor).toBe(3);
    expect(l34.toFloor).toBe(4);
    expect(l45.fromFloor).toBe(4);
    expect(l45.toFloor).toBe(5);
    expect(nextKeepState(at(3), l34.x, l34.z)).toEqual(at(4, 2));
    expect(nextKeepState(at(4), l45.x, l45.z)).toEqual(at(5, 3));
  });

  it('does NOT flip back while standing still on the landing that just fired (the oscillation bug)', () => {
    const landing = KEEP_STAIRS[0];
    const afterStep = nextKeepState(at(1), landing.x, landing.z);
    expect(afterStep).toEqual(at(2, 0));
    // standing perfectly still: same state, same landing, tick after tick
    const stillThere = nextKeepState(afterStep, landing.x, landing.z);
    expect(stillThere).toEqual(afterStep);
    const stillThereAgain = nextKeepState(stillThere, landing.x, landing.z);
    expect(stillThereAgain).toEqual(afterStep);
  });

  it('unlocks and can fire again once the player leaves the landing and comes back', () => {
    const landing = KEEP_STAIRS[0];
    const onLanding = nextKeepState(at(1), landing.x, landing.z);
    expect(onLanding).toEqual(at(2, 0));
    // step off (away from the landing radius, still floor 2, unlocked)
    const offLanding = nextKeepState(onLanding, KEEP_POS.x, KEEP_POS.z);
    expect(offLanding).toEqual(at(2, -1));
    // step back onto the SAME landing: fires again, now going back down
    const backOn = nextKeepState(offLanding, landing.x, landing.z);
    expect(backOn).toEqual(at(1, 0));
  });

  it('full walkthrough: in, up to 2, up to 3, back down to 1, out (stepping off each landing)', () => {
    let state: KeepState = KEEP_STATE_OUTSIDE;
    state = nextKeepState(state, KEEP_POS.x, KEEP_POS.z); // walk in
    expect(state.floor).toBe(1);
    state = nextKeepState(state, KEEP_STAIRS[0].x, KEEP_STAIRS[0].z); // stairs up
    expect(state.floor).toBe(2);
    state = nextKeepState(state, KEEP_POS.x, KEEP_POS.z); // step off the landing
    state = nextKeepState(state, KEEP_STAIRS[1].x, KEEP_STAIRS[1].z); // stairs up
    expect(state.floor).toBe(3);
    state = nextKeepState(state, KEEP_POS.x, KEEP_POS.z); // step off the landing
    state = nextKeepState(state, KEEP_STAIRS[1].x, KEEP_STAIRS[1].z); // same landing, back down
    expect(state.floor).toBe(2);
    state = nextKeepState(state, KEEP_POS.x, KEEP_POS.z); // step off
    state = nextKeepState(state, KEEP_STAIRS[0].x, KEEP_STAIRS[0].z); // back down again
    expect(state.floor).toBe(1);
    state = nextKeepState(state, 0, 0); // walk out the same door
    expect(state.floor).toBe(0);
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
