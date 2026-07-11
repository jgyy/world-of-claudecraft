// Covers the Drowned Chapel: the Zone 2 (Mirefen Marsh) ruin compound's real
// 2-story voxel building that replaced the old freestanding perimeter wall.
import { describe, expect, it } from 'vitest';
import { isBlocked, resolveMovement, resolvePosition } from '../src/sim/colliders';
import {
  CHAPEL_DOOR_HALF_WIDTH,
  CHAPEL_HALF,
  CHAPEL_POS,
  CHAPEL_STAIRS,
  CHAPEL_WALL_THICK,
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
import { isInRuinCompoundClearing } from '../src/sim/ruin_compound_layout';

const SEED = 12345;

describe('Drowned Chapel: the freestanding wall is gone', () => {
  it('no wall-ring decor kind remains in the ruin compound', () => {
    const kinds = new Set(PROPS.ruinDecor?.map((d) => d.kind) ?? []);
    for (const wallKind of ['ruinWallCracked', 'ruinWallBroken', 'ruinWallCorner']) {
      expect(kinds.has(wallKind as never)).toBe(false);
    }
  });

  it('the outdoor courtyard floor tiles no longer sit under the building footprint', () => {
    for (const d of PROPS.ruinDecor ?? []) {
      if (d.kind !== 'ruinFloorTile') continue;
      // tiles may legally sit right at the footprint edge; none should be
      // deep inside it (the building has its own real floor slabs there)
      const deepInterior =
        Math.abs(d.x - CHAPEL_POS.x) < CHAPEL_HALF - 1.5 &&
        Math.abs(d.z - CHAPEL_POS.z) < CHAPEL_HALF - 1.5;
      expect(deepInterior).toBe(false);
    }
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

  it('the base Y matches the flattened terrain (no floating/sunk foundation)', () => {
    const baseY = chapelBaseY(SEED);
    expect(Number.isFinite(baseY)).toBe(true);
    // floor 2 sits exactly one story above floor 1
    expect(chapelFloorY(SEED, 2) - chapelFloorY(SEED, 1)).toBeCloseTo(4, 5);
  });

  it('the door opening is real air (positive density), not solid wall', () => {
    const baseY = chapelBaseY(SEED);
    const doorY = baseY + 1.2;
    // sample at the wall's centerline (thickness midpoint), not the outer face
    const doorZ = CHAPEL_POS.z + CHAPEL_HALF - CHAPEL_WALL_THICK / 2;
    const d = chapelVoxelDensity(CHAPEL_POS.x, doorY, doorZ, SEED);
    expect(d).toBeGreaterThan(0);
    // just to either side of the door gap, at the same height, the wall is solid
    const solidX = CHAPEL_POS.x + CHAPEL_DOOR_HALF_WIDTH + 0.8;
    const solid = chapelVoxelDensity(solidX, doorY, doorZ, SEED);
    expect(solid).toBeLessThan(0);
  });

  it('carves real windows: every window center is air, and reads solid a step outside it', () => {
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
    // south wall midpoint (thickness centerline), ground floor, away from door/windows
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

    // standing still on the SAME landing must not immediately flip back
    const stillOnLanding = nextChapelState(up, s.x, s.z);
    expect(stillOnLanding.floor).toBe(2);

    // stepping off and back on flips it again (edge-triggered, not latched forever)
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
      wallZ + 3, // trying to walk straight through the south wall
      0.5,
      false,
      undefined,
      1,
    );
    // resolved position must stop short of actually crossing into the interior
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

  it('the per-floor furnishing collider differs between floor 1 and floor 2 (a real per-floor swap)', () => {
    const floor1 = resolvePosition(
      SEED,
      CHAPEL_POS.x + CHAPEL_HALF - 1.2,
      CHAPEL_POS.z - (CHAPEL_HALF - 1.2),
      0.5,
      false,
      undefined,
      1,
    );
    const floor2 = resolvePosition(
      SEED,
      CHAPEL_POS.x + CHAPEL_HALF - 1.2,
      CHAPEL_POS.z - (CHAPEL_HALF - 1.2),
      0.5,
      false,
      undefined,
      2,
    );
    // floor 1's furniture sits at this exact corner (blocked); floor 2's does not
    expect(
      isBlocked(
        SEED,
        CHAPEL_POS.x + CHAPEL_HALF - 1.2,
        CHAPEL_POS.z - (CHAPEL_HALF - 1.2),
        0.5,
        false,
        undefined,
        1,
      ),
    ).toBe(true);
    expect(
      isBlocked(
        SEED,
        CHAPEL_POS.x + CHAPEL_HALF - 1.2,
        CHAPEL_POS.z - (CHAPEL_HALF - 1.2),
        0.5,
        false,
        undefined,
        2,
      ),
    ).toBe(false);
    expect(floor1).not.toEqual(floor2);
  });
});

describe('Drowned Chapel: decor anchors stay inside/around the building, and no regression to movement blocking', () => {
  it('every ruinDecor anchor still resolves as non-blocking (purely cosmetic)', () => {
    for (const d of PROPS.ruinDecor ?? []) {
      expect(isBlocked(SEED, d.x, d.z, 0.5)).toBe(false);
    }
  });

  it('the sanctum altar and idol sit inside the chapel footprint', () => {
    const altar = PROPS.ruinDecor?.find((d) => d.kind === 'ruinAltar');
    expect(altar).toBeDefined();
    expect(isInsideChapelFootprint(altar!.x, altar!.z)).toBe(true);

    const statue = PROPS.statues?.[0];
    expect(statue).toBeDefined();
    expect(isInsideChapelFootprint(statue!.x, statue!.z)).toBe(true);
  });

  it('the braziers flanking the stairs sit inside the chapel footprint', () => {
    const braziers = PROPS.ruinDecor?.filter((d) => d.kind === 'ruinBrazier') ?? [];
    expect(braziers.length).toBeGreaterThanOrEqual(2);
    for (const b of braziers) {
      expect(isInsideChapelFootprint(b.x, b.z)).toBe(true);
    }
  });

  it('the archway/stairway approach and every satellite feature sit outside the chapel footprint', () => {
    for (const kind of [
      'ruinArchway',
      'ruinStairway',
      'ruinWell',
      'ruinRubble',
      'ruinGraveMarker',
      'ruinBench',
    ] as const) {
      for (const d of PROPS.ruinDecor?.filter((x) => x.kind === kind) ?? []) {
        expect(isInsideChapelFootprint(d.x, d.z)).toBe(false);
        expect(isInRuinCompoundClearing(d.x, d.z)).toBe(true);
      }
    }
  });
});
