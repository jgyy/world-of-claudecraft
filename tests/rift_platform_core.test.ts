// Pins for the pure rift sanctum-deck planner (src/render/rift_platform_core.ts).
// The sim lifts a walker across the FULL room width (riftPlatformLift is a
// function of z only), so every rendered slab must reach the wall face at its
// z, or players float over a bare strip and see the lower floor beneath them
// (the War Abyss boss-floor report: the deck was hard-capped at half-width 22
// while boss rooms generate half-widths up to ~39).
import { describe, expect, it } from 'vitest';
import {
  RIFT_PLATFORM_WALL_INSET,
  type RiftPlatformShell,
  riftPlatformHalfWidthAt,
  riftPlatformSlabs,
} from '../src/render/rift_platform_core';
import { polygonXAtZ } from '../src/sim/geometry2d';
import { RIFT_RANK_BASE_LEVEL } from '../src/sim/rift/ranks';
import { generateRiftFloor, riftFloorCount } from '../src/sim/rift/rift_gen';

const platform = { rampZ0: 60, rampZ1: 72, height: 3.2 };

describe('riftPlatformSlabs', () => {
  it('spans a wide rectangular boss room to the wall face, not a fixed cap', () => {
    const shell: RiftPlatformShell = { zMax: 90, wallX: 39 };
    const slabs = riftPlatformSlabs(shell, platform);
    expect(slabs.length).toBeGreaterThan(5);
    for (const s of slabs) {
      expect(s.halfW).toBeCloseTo(39 - RIFT_PLATFORM_WALL_INSET, 5);
    }
    // A constant-width shell keeps the rear deck as ONE slab (no gratuitous bands).
    const deck = slabs.filter((s) => s.z >= platform.rampZ1);
    expect(deck).toHaveLength(1);
    expect(deck[0].depth).toBeCloseTo(shell.zMax - platform.rampZ1 + 0.05, 5);
  });

  it('hugs a polygon shell: never past the wall, never more than a step inside it', () => {
    // A room that narrows toward the dais (a "taper" archetype): half-width 36 at
    // z=40 down to 28 at z=90.
    const shellPolygon = [
      { x: 36, z: 40 },
      { x: 28, z: 90 },
      { x: -28, z: 90 },
      { x: -36, z: 40 },
    ];
    const shell: RiftPlatformShell = { zMax: 90, wallX: 38, shellPolygon };
    const slabs = riftPlatformSlabs(shell, platform);
    for (const s of slabs) {
      const z0 = s.z - s.depth / 2;
      const z1 = s.z + s.depth / 2;
      const wallAt = (z: number) => polygonXAtZ(shellPolygon, z, 1) ?? 38;
      const widest = Math.max(wallAt(z0), wallAt(z1));
      const narrowest = Math.min(wallAt(z0), wallAt(z1));
      // Never short of the wall anywhere in the band (that is the floating strip),
      // never past the band's widest crossing (tucks under the panel at most). The
      // 0.05 slack is the slabs' z-overlap pad against hairline seams.
      expect(s.halfW).toBeGreaterThanOrEqual(narrowest - RIFT_PLATFORM_WALL_INSET - 0.05);
      expect(s.halfW).toBeLessThanOrEqual(widest - RIFT_PLATFORM_WALL_INSET + 0.05);
      expect(s.halfW).toBeGreaterThan(22); // the old cap would have left a bare strip
    }
    // The taper actually produces bands: more than one deck slab here.
    expect(slabs.filter((s) => s.z >= platform.rampZ1).length).toBeGreaterThan(1);
  });

  it('rises from the ramp foot to the deck and covers the deck through zMax', () => {
    const shell: RiftPlatformShell = { zMax: 90, wallX: 30 };
    const slabs = riftPlatformSlabs(shell, platform);
    const steps = slabs.filter((s) => s.z < platform.rampZ1);
    const deck = slabs.filter((s) => s.z >= platform.rampZ1);
    expect(steps.length).toBeGreaterThanOrEqual(5);
    for (let i = 1; i < steps.length; i++) expect(steps[i].top).toBeGreaterThan(steps[i - 1].top);
    expect(steps[steps.length - 1].top).toBeCloseTo(platform.height, 5);
    for (const d of deck) expect(d.top).toBeCloseTo(platform.height, 5);
    const deckEnd = Math.max(...deck.map((d) => d.z + d.depth / 2));
    expect(deckEnd).toBeGreaterThanOrEqual(shell.zMax);
    const deckStart = Math.min(...deck.map((d) => d.z - d.depth / 2));
    // slabs carry a 0.05 z-overlap pad against hairline seams
    expect(deckStart).toBeCloseTo(platform.rampZ1, 1);
  });

  it('covers every generated boss sanctum out to its own room wall', () => {
    // Drive the real generator: find boss floors with a platform and a room wider
    // than the old cap, and assert the planned slabs reach that room's wall.
    let checked = 0;
    for (let seed = 1; seed < 400 && checked < 6; seed++) {
      const count = riftFloorCount(seed, RIFT_RANK_BASE_LEVEL.S);
      const floor = generateRiftFloor(seed, RIFT_RANK_BASE_LEVEL.S, count - 1);
      const wallX = floor.layout.wallX ?? 0;
      if (!floor.platform || wallX <= 24 || floor.authored) continue;
      checked++;
      const slabs = riftPlatformSlabs(floor.layout, floor.platform);
      const poly = floor.layout.shellPolygon;
      for (const s of slabs) {
        const ends = [s.z - s.depth / 2, s.z + s.depth / 2].map((z) =>
          poly ? (polygonXAtZ(poly, z, 1) ?? wallX) : wallX,
        );
        const narrowest = Math.min(...ends);
        const widest = Math.max(...ends);
        expect(s.halfW, `seed ${seed} z ${s.z}`).toBeGreaterThanOrEqual(
          narrowest - RIFT_PLATFORM_WALL_INSET - 0.05,
        );
        expect(s.halfW, `seed ${seed} z ${s.z}`).toBeLessThanOrEqual(
          Math.min(wallX, widest) - RIFT_PLATFORM_WALL_INSET + 0.05,
        );
      }
    }
    expect(checked).toBeGreaterThan(0);
  });

  it('riftPlatformHalfWidthAt guards: wallX fallback, tiny polygon, off-band z, clamp', () => {
    // No wallX and no polygon: the historical `layout.wallX ?? 18` default survives.
    expect(riftPlatformHalfWidthAt({ zMax: 50 }, 10, 12)).toBeCloseTo(
      18 - RIFT_PLATFORM_WALL_INSET,
      5,
    );
    // A degenerate polygon (fewer than 3 points) is ignored in favour of wallX.
    expect(
      riftPlatformHalfWidthAt({ zMax: 50, wallX: 30, shellPolygon: [{ x: 5, z: 0 }] }, 10, 12),
    ).toBeCloseTo(30 - RIFT_PLATFORM_WALL_INSET, 5);
    // A band entirely outside the polygon's z span falls back to wallX.
    const poly = [
      { x: 10, z: 0 },
      { x: 10, z: 20 },
      { x: -10, z: 20 },
      { x: -10, z: 0 },
    ];
    expect(
      riftPlatformHalfWidthAt({ zMax: 50, wallX: 30, shellPolygon: poly }, 40, 42),
    ).toBeCloseTo(30 - RIFT_PLATFORM_WALL_INSET, 5);
    // Inside the span the polygon wins over a wider wallX.
    expect(riftPlatformHalfWidthAt({ zMax: 50, wallX: 30, shellPolygon: poly }, 5, 7)).toBeCloseTo(
      10 - RIFT_PLATFORM_WALL_INSET,
      5,
    );
    // A pinhole shell never plans a slab thinner than 1 yd half-width.
    expect(riftPlatformHalfWidthAt({ zMax: 50, wallX: 0.2 }, 10, 12)).toBe(1);
  });
});
