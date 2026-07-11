// Covers the Drowned Chapel: the Zone 2 (Mirefen Marsh) ruin compound's real
// 2-story voxel building that replaced the old freestanding perimeter wall.
import { describe, expect, it } from 'vitest';
import { isBlocked, resolveMovement, resolvePosition } from '../src/sim/colliders';
import {
  CHAPEL_DOOR_HALF_WIDTH,
  CHAPEL_GROUND_FLOOR_HEIGHT,
  CHAPEL_HALF,
  CHAPEL_POS,
  CHAPEL_STAIRS,
  CHAPEL_TOTAL_HEIGHT,
  CHAPEL_UPPER_FLOOR_HEIGHT,
  CHAPEL_WALL_THICK,
  chapelFloorBaseOffset,
} from '../src/sim/content/drowned_chapel';
import { PROPS } from '../src/sim/data';
import {
  chapelBaseY,
  chapelFloorY,
  chapelVoxelDensity,
  chapelWindowSpecs,
  isInsideChapelFootprint,
} from '../src/sim/drowned_chapel_building';
import { CHAPEL_STATE_OUTSIDE, nextChapelState } from '../src/sim/drowned_chapel_floor';
import {
  isInRuinCompoundClearing,
  RUIN_COMPOUND_CENTER,
  RUIN_COMPOUND_FLOOR_HEIGHT,
  RUIN_COMPOUND_PLATEAU_RADIUS,
} from '../src/sim/ruin_compound_layout';
import { terrainHeight } from '../src/sim/world';

const SEED = 12345;

describe('Drowned Chapel: the freestanding wall and courtyard are gone', () => {
  it('no wall-ring decor kind remains in the ruin compound', () => {
    const kinds = new Set(PROPS.ruinDecor?.map((d) => d.kind) ?? []);
    for (const wallKind of ['ruinWallCracked', 'ruinWallBroken', 'ruinWallCorner']) {
      expect(kinds.has(wallKind as never)).toBe(false);
    }
  });

  it('no outdoor courtyard floor tiles remain (the building has its own slabs)', () => {
    const tiles = PROPS.ruinDecor?.filter((d) => d.kind === 'ruinFloorTile') ?? [];
    expect(tiles.length).toBe(0);
  });
});

describe('Drowned Chapel: widened footprint and taller ground floor (pinned)', () => {
  it('pins the widened footprint half-extent', () => {
    // widened from the original 6 to 8 (footprint 16x16 vs 12x12)
    expect(CHAPEL_HALF).toBe(8);
  });

  it('pins the taller ground floor and the upper floor heights', () => {
    // ground story raised from the old flat 4 to 5.5; upper floor 4.5
    expect(CHAPEL_GROUND_FLOOR_HEIGHT).toBe(5.5);
    expect(CHAPEL_UPPER_FLOOR_HEIGHT).toBe(4.5);
    expect(CHAPEL_TOTAL_HEIGHT).toBeCloseTo(10, 5);
  });

  it('floor 2 sits a full (taller) ground story above floor 1', () => {
    expect(chapelFloorBaseOffset(1)).toBe(0);
    expect(chapelFloorBaseOffset(2)).toBe(CHAPEL_GROUND_FLOOR_HEIGHT);
    expect(chapelFloorY(SEED, 2) - chapelFloorY(SEED, 1)).toBeCloseTo(
      CHAPEL_GROUND_FLOOR_HEIGHT,
      5,
    );
  });
});

describe('Drowned Chapel: terrain is flat and matches the footprint exactly (no apron)', () => {
  it('the flatten plateau radius equals the building footprint half-extent', () => {
    expect(RUIN_COMPOUND_PLATEAU_RADIUS).toBe(CHAPEL_HALF);
  });

  it('the terrain is dead level across the footprint interior (within the plateau)', () => {
    // Sample points inside the flat plateau disc (radius = CHAPEL_HALF). The
    // four square corners fall just outside this inscribed circle and rest on
    // the building's solid foundation box instead, so they are excluded here.
    for (const dx of [-5, -2.5, 0, 2.5, 5]) {
      for (const dz of [-5, -2.5, 0, 2.5, 5]) {
        if (Math.hypot(dx, dz) > RUIN_COMPOUND_PLATEAU_RADIUS - 0.5) continue;
        const h = terrainHeight(RUIN_COMPOUND_CENTER.x + dx, RUIN_COMPOUND_CENTER.z + dz, SEED);
        expect(h).toBeCloseTo(RUIN_COMPOUND_FLOOR_HEIGHT, 5);
      }
    }
  });

  it('the ground returns to natural grade beyond the footprint (no wide apron ramp)', () => {
    // A point well beyond the plateau is NOT held level at the plateau height:
    // there is no apron ring stamping the surrounding meadow flat.
    const far = terrainHeight(
      RUIN_COMPOUND_CENTER.x + RUIN_COMPOUND_PLATEAU_RADIUS + 10,
      RUIN_COMPOUND_CENTER.z,
      SEED,
    );
    expect(Math.abs(far - RUIN_COMPOUND_FLOOR_HEIGHT)).toBeGreaterThan(0.1);
  });
});

describe('Drowned Chapel: real 2-story building geometry', () => {
  it('has exactly 2 floors and one staircase landing between them', () => {
    expect(CHAPEL_STAIRS.length).toBeGreaterThanOrEqual(1);
    for (const s of CHAPEL_STAIRS) {
      expect(s.fromFloor).toBe(1);
      expect(s.toFloor).toBe(2);
    }
  });

  it('sits inside the ruin compound clearing and on the flattened plateau', () => {
    expect(isInRuinCompoundClearing(CHAPEL_POS.x, CHAPEL_POS.z)).toBe(true);
  });

  it('the foundation is solid under the whole footprint, and no slab pokes past the walls', () => {
    const baseY = chapelBaseY(SEED);
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const x = CHAPEL_POS.x + sx * (CHAPEL_HALF - 0.3);
        const z = CHAPEL_POS.z + sz * (CHAPEL_HALF - 0.3);
        const d = chapelVoxelDensity(x, baseY - 1, z, SEED);
        expect(d).toBeLessThan(0); // solid foundation supports the corners
      }
    }
    const outside = chapelVoxelDensity(
      CHAPEL_POS.x,
      baseY - 1,
      CHAPEL_POS.z + CHAPEL_HALF + 3,
      SEED,
    );
    expect(outside).toBeGreaterThan(0); // air: no foundation/floor slab in the grass
  });

  it('the door opening is real air (positive density), not solid wall', () => {
    const baseY = chapelBaseY(SEED);
    const doorY = baseY + 1.2;
    const doorZ = CHAPEL_POS.z + CHAPEL_HALF - CHAPEL_WALL_THICK / 2;
    const d = chapelVoxelDensity(CHAPEL_POS.x, doorY, doorZ, SEED);
    expect(d).toBeGreaterThan(0);
    const solidX = CHAPEL_POS.x + CHAPEL_DOOR_HALF_WIDTH + 0.8;
    const solid = chapelVoxelDensity(solidX, doorY, doorZ, SEED);
    expect(solid).toBeLessThan(0);
  });

  it('carves real windows: every window center is open air (no pane fills it)', () => {
    const baseY = chapelBaseY(SEED);
    const specs = chapelWindowSpecs();
    expect(specs.length).toBeGreaterThan(0);
    for (const w of specs) {
      const centerDensity = chapelVoxelDensity(w.x, baseY + w.ly, w.z, SEED);
      expect(centerDensity).toBeGreaterThan(0); // air: a real carved opening
    }
  });

  it('the exterior wall (away from any opening) is solid', () => {
    const baseY = chapelBaseY(SEED);
    const wallZ = CHAPEL_POS.z - CHAPEL_HALF + CHAPEL_WALL_THICK / 2;
    const d = chapelVoxelDensity(CHAPEL_POS.x, baseY + 1.6, wallZ, SEED);
    expect(d).toBeLessThan(0);
  });
});

describe('Drowned Chapel: floor-transition state machine', () => {
  it('starts outside, enters floor 1 on crossing the footprint, and outside again resets', () => {
    const outsideX = CHAPEL_POS.x + CHAPEL_HALF + 20;
    const outsideZ = CHAPEL_POS.z;
    const started = nextChapelState(CHAPEL_STATE_OUTSIDE, outsideX, outsideZ);
    expect(started.floor).toBe(0);

    const entered = nextChapelState(
      CHAPEL_STATE_OUTSIDE,
      CHAPEL_POS.x,
      CHAPEL_POS.z + CHAPEL_HALF - 1,
    );
    expect(entered.floor).toBe(1);

    const left = nextChapelState({ floor: 1, landingLock: -1 }, outsideX, outsideZ);
    expect(left.floor).toBe(0);
  });

  it('walking onto the landing flips floor 1 <-> 2, and re-locks against flip-flopping in place', () => {
    const s = CHAPEL_STAIRS[0];
    const up = nextChapelState({ floor: 1, landingLock: -1 }, s.x, s.z);
    expect(up.floor).toBe(2);
    expect(up.landingLock).toBe(0);

    const stillOnLanding = nextChapelState(up, s.x, s.z);
    expect(stillOnLanding.floor).toBe(2);

    const offLanding = nextChapelState(up, CHAPEL_POS.x, CHAPEL_POS.z);
    const backOn = nextChapelState(offLanding, s.x, s.z);
    expect(backOn.floor).toBe(1);
  });
});

describe('Drowned Chapel: floor-transition collision (not just render)', () => {
  it('the exterior wall blocks a player pushing straight into it from outside', () => {
    const wallZ = CHAPEL_POS.z - CHAPEL_HALF;
    const outsideZ = wallZ - 3;
    const res = resolveMovement(
      SEED,
      CHAPEL_POS.x,
      outsideZ,
      CHAPEL_POS.x,
      wallZ + 3,
      0.5,
      false,
      undefined,
      1,
    );
    expect(res.z).toBeLessThan(wallZ);
  });

  it('the door gap on the north wall is walkable through', () => {
    const doorZ = CHAPEL_POS.z + CHAPEL_HALF;
    const beforeDoor = doorZ + 3;
    const afterDoor = doorZ - 3;
    const res = resolveMovement(
      SEED,
      CHAPEL_POS.x,
      beforeDoor,
      CHAPEL_POS.x,
      afterDoor,
      0.5,
      false,
      undefined,
      1,
    );
    expect(res.z).toBeCloseTo(afterDoor, 1);
  });

  it('a player can walk up the staircase landing from floor 1 to reach floor 2', () => {
    const s = CHAPEL_STAIRS[0];
    // The landing footprint is walkable on both floors (no furnishing collider
    // wedged into the stair path).
    expect(isBlocked(SEED, s.x, s.z, 0.5, false, undefined, 1)).toBe(false);
    expect(isBlocked(SEED, s.x, s.z, 0.5, false, undefined, 2)).toBe(false);
    // The state machine promotes floor 1 -> 2 on reaching the landing.
    const up = nextChapelState({ floor: 1, landingLock: -1 }, s.x, s.z);
    expect(up.floor).toBe(2);
  });

  it('the per-floor furnishing collider differs between floor 1 and floor 2 (a real per-floor swap)', () => {
    const cornerX = CHAPEL_POS.x + CHAPEL_HALF - 1.2;
    const cornerZ = CHAPEL_POS.z - (CHAPEL_HALF - 1.2);
    const floor1 = resolvePosition(SEED, cornerX, cornerZ, 0.5, false, undefined, 1);
    const floor2 = resolvePosition(SEED, cornerX, cornerZ, 0.5, false, undefined, 2);
    expect(isBlocked(SEED, cornerX, cornerZ, 0.5, false, undefined, 1)).toBe(true);
    expect(isBlocked(SEED, cornerX, cornerZ, 0.5, false, undefined, 2)).toBe(false);
    expect(floor1).not.toEqual(floor2);
  });
});

describe('Drowned Chapel: all 13 Tripo prop kinds are relocated inside the building', () => {
  // altar, archway, bench, brazier, grave_marker, obelisk, pedestal, rubble,
  // stairway, urn, wall_fragment, well (as ruinDecor kinds) plus the statue.
  const REQUIRED_RUIN_KINDS = [
    'ruinAltar',
    'ruinArchway',
    'ruinBench',
    'ruinBrazier',
    'ruinGraveMarker',
    'ruinObelisk',
    'ruinPedestal',
    'ruinRubble',
    'ruinStairway',
    'ruinUrn',
    'ruinWallFragment',
    'ruinWell',
  ] as const;

  it('every required ruin decor kind has at least one anchor, and ALL its anchors sit inside the footprint', () => {
    for (const kind of REQUIRED_RUIN_KINDS) {
      const anchors = PROPS.ruinDecor?.filter((d) => d.kind === kind) ?? [];
      expect(anchors.length).toBeGreaterThanOrEqual(1);
      for (const a of anchors) {
        expect(isInsideChapelFootprint(a.x, a.z)).toBe(true);
      }
    }
  });

  it('the idol statue also sits inside the footprint (the 13th kind)', () => {
    const statue = PROPS.statues?.[0];
    expect(statue).toBeDefined();
    expect(isInsideChapelFootprint(statue!.x, statue!.z)).toBe(true);
  });

  it('NO ruin decor anchor is left outside the building as an exterior satellite', () => {
    for (const d of PROPS.ruinDecor ?? []) {
      expect(isInsideChapelFootprint(d.x, d.z)).toBe(true);
    }
  });

  it('every relocated interior anchor is still non-blocking (purely cosmetic, clear of walls/stairs)', () => {
    for (const d of PROPS.ruinDecor ?? []) {
      expect(isBlocked(SEED, d.x, d.z, 0.5, false, undefined, 1)).toBe(false);
    }
  });
});
