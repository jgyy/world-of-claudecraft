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
      const narrowest = Math.min(wallAt(z0), wallAt(z1));
      expect(s.halfW).toBeLessThanOrEqual(narrowest - RIFT_PLATFORM_WALL_INSET + 0.05);
      expect(s.halfW).toBeGreaterThan(narrowest - RIFT_PLATFORM_WALL_INSET - 0.5);
      expect(s.halfW).toBeGreaterThan(22); // the old cap would have left a bare strip
    }
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
        const wallAt = poly
          ? Math.min(
              polygonXAtZ(poly, s.z - s.depth / 2, 1) ?? wallX,
              polygonXAtZ(poly, s.z + s.depth / 2, 1) ?? wallX,
            )
          : wallX;
        expect(s.halfW, `seed ${seed} z ${s.z}`).toBeGreaterThan(
          wallAt - RIFT_PLATFORM_WALL_INSET - 0.5,
        );
        expect(s.halfW, `seed ${seed} z ${s.z}`).toBeLessThanOrEqual(
          wallAt - RIFT_PLATFORM_WALL_INSET + 0.05,
        );
      }
    }
    expect(checked).toBeGreaterThan(0);
  });
});
