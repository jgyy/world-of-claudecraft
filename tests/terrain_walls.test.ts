import { describe, expect, it } from 'vitest';
import {
  CAMPS,
  GLIMMERVEIN_WAYPOINTS,
  NPCS,
  ROADS,
  WORLD_MAX_X,
  WORLD_MAX_Z,
  WORLD_MIN_Z,
  ZONES,
} from '../src/sim/data';
import { PLAYER_MAX_CLIMB_SLOPE } from '../src/sim/pathfind';
import { terrainSteepness } from '../src/sim/world';

// The mountain walls of the world (the inter-zone ridges and the outer rim) are
// meant to be impassable: every crossing outside the road pass must somewhere be
// steeper than the movement climb limit (MAX_CLIMB_SLOPE = 1.5 rise/run) so the
// slope gates in sim.ts actually stop the player. This file pins that terrain
// contract; tests/climb_slope.test.ts pins the movement gates themselves.

const WORLD_SEED = 20061; // the fixed production seed (src/main.ts, server/game.ts)
const CLIMB_LIMIT = 1.5;
const WALL_MARGIN = 1.7; // walls must beat the limit with headroom, not by a hair
const PASS_HALF_WIDTH = 10;
// Glimmervein Cavern (see GLIMMERVEIN_* in src/sim/data.ts): a winding
// sunken trench on the west side of both zones, built from overlapping
// 'smooth'-falloff HeightStamps with no separate wall geometry (the concave
// bowl shape IS the wall, same as a lake basin). Its waypoint nearest the
// zone1/zone2 ridge crest sits around x=-100 with a wide radius (34) so the
// stamp fully suppresses the ridge's own steep natural rise there.
const GLIMMERVEIN_RIDGE_Z = 180;
const GLIMMERVEIN_RIDGE_X = -100;
const GLIMMERVEIN_RIDGE_EXCLUDE = 38; // past the ridge waypoint's own 34 radius

// Max steepness met along a straight crossing path.
function pathMaxSteepness(
  seed: number,
  from: { x: number; z: number },
  to: { x: number; z: number },
): number {
  const steps = Math.ceil(Math.hypot(to.x - from.x, to.z - from.z) / 0.5);
  let max = 0;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const s = terrainSteepness(from.x + (to.x - from.x) * t, from.z + (to.z - from.z) * t, seed);
    if (s > max) max = s;
  }
  return max;
}

const RIDGE_ZS = ZONES.slice(0, -1).map((zone) => zone.zMax);

describe('impassable terrain walls', () => {
  // CLIMB_LIMIT is deliberately a literal (an independent pin, not a
  // self-comparison); this keeps it from silently desyncing from the source.
  it('the pinned climb limit matches the movement constant', () => {
    expect(PLAYER_MAX_CLIMB_SLOPE).toBe(CLIMB_LIMIT);
  });

  it('every non-pass crossing of each zone ridge is steeper than the climb limit', () => {
    for (const rz of RIDGE_ZS) {
      for (let x = -172; x <= 172; x += 4) {
        if (Math.abs(x) < PASS_HALF_WIDTH + 26) continue; // the road pass corridor
        // Glimmervein Cavern's trench only pierces the eastbrook_vale/
        // mirefen_marsh ridge; every other ridge has no second opening.
        if (
          rz === GLIMMERVEIN_RIDGE_Z &&
          Math.abs(x - GLIMMERVEIN_RIDGE_X) < GLIMMERVEIN_RIDGE_EXCLUDE
        ) {
          continue;
        }
        const max = pathMaxSteepness(WORLD_SEED, { x, z: rz - 50 }, { x, z: rz + 50 });
        expect(max, `ridge z=${rz} crossing at x=${x}`).toBeGreaterThan(WALL_MARGIN);
      }
    }
  });

  it('the pass shoulder band is already a real wall', () => {
    // The wall ramps from the flat pass opening (|x| < 10) to full height by
    // |x| = 34 (PASS_SHOULDER in src/sim/world.ts). The crossable zone must
    // stay contiguous with the road pass: by |x| = 16 every crossing already
    // beats the margin, so a terrain tweak cannot quietly widen the gap into
    // a cross-beside-the-pass hole.
    for (const rz of RIDGE_ZS) {
      for (let x = 16; x <= 34; x += 2) {
        for (const side of [-1, 1]) {
          const max = pathMaxSteepness(
            WORLD_SEED,
            { x: side * x, z: rz - 50 },
            { x: side * x, z: rz + 50 },
          );
          expect(max, `ridge z=${rz} shoulder at x=${side * x}`).toBeGreaterThan(WALL_MARGIN);
        }
      }
    }
  });

  it('Glimmervein Cavern is a real second opening in the ridge just past its excluded band', () => {
    // Confirms the exclusion band above is actually load-bearing: right past
    // it (still well short of the ridge waypoint's own 34 radius, which the
    // exclusion already covers), the ridge must be a real wall again, so the
    // trench cannot quietly widen into an open notch beyond its own bounds.
    for (const side of [-1, 1]) {
      const crossX = GLIMMERVEIN_RIDGE_X + side * (GLIMMERVEIN_RIDGE_EXCLUDE + 10);
      const max = pathMaxSteepness(
        WORLD_SEED,
        { x: crossX, z: GLIMMERVEIN_RIDGE_Z - 50 },
        { x: crossX, z: GLIMMERVEIN_RIDGE_Z + 50 },
      );
      expect(max, `ridge wall resumes at x=${crossX}`).toBeGreaterThan(WALL_MARGIN);
    }
  });

  it('Glimmervein Cavern is walkable along its whole winding centerline', () => {
    // No separate wall/ramp/body split: this is one chain of overlapping
    // smooth HeightStamps from the zone1 mouth to the zone2 mouth
    // (GLIMMERVEIN_WAYPOINTS), so walkability is checked segment by segment
    // along the actual curve, not a single straight line.
    for (let i = 0; i + 1 < GLIMMERVEIN_WAYPOINTS.length; i++) {
      const a = GLIMMERVEIN_WAYPOINTS[i];
      const b = GLIMMERVEIN_WAYPOINTS[i + 1];
      const max = pathMaxSteepness(WORLD_SEED, a, b);
      expect(max, `centerline segment ${i} (${a.x},${a.z})->(${b.x},${b.z})`).toBeLessThan(
        CLIMB_LIMIT,
      );
    }
  });

  it('Glimmervein Cavern is walkable off-centerline too, not just exactly on the curve', () => {
    // A real trench a player can walk through, not an infinitely thin line:
    // a short crossing centered on each waypoint must stay walkable.
    for (const w of GLIMMERVEIN_WAYPOINTS) {
      for (const dx of [-10, -5, 5, 10]) {
        const max = pathMaxSteepness(
          WORLD_SEED,
          { x: w.x + dx, z: w.z - 8 },
          { x: w.x + dx, z: w.z + 8 },
        );
        expect(max, `waypoint (${w.x},${w.z}) dx=${dx}`).toBeLessThan(CLIMB_LIMIT);
      }
    }
  });

  it('every crossing of the world rim is steeper than the climb limit', () => {
    for (let z = WORLD_MIN_Z + 40; z <= WORLD_MAX_Z - 40; z += 4) {
      for (const side of [-1, 1]) {
        const max = pathMaxSteepness(
          WORLD_SEED,
          { x: side * (WORLD_MAX_X - 36), z },
          { x: side * (WORLD_MAX_X + 4), z },
        );
        expect(max, `x-rim side=${side} at z=${z}`).toBeGreaterThan(WALL_MARGIN);
      }
    }
    for (let x = -144; x <= 144; x += 4) {
      const south = pathMaxSteepness(
        WORLD_SEED,
        { x, z: WORLD_MIN_Z + 36 },
        { x, z: WORLD_MIN_Z - 4 },
      );
      expect(south, `south rim at x=${x}`).toBeGreaterThan(WALL_MARGIN);
      const north = pathMaxSteepness(
        WORLD_SEED,
        { x, z: WORLD_MAX_Z - 36 },
        { x, z: WORLD_MAX_Z + 4 },
      );
      expect(north, `north rim at x=${x}`).toBeGreaterThan(WALL_MARGIN);
    }
  });

  it('the road pass through each ridge stays gently walkable', () => {
    for (const rz of RIDGE_ZS) {
      for (let x = -8; x <= 8; x += 2) {
        const max = pathMaxSteepness(WORLD_SEED, { x, z: rz - 50 }, { x, z: rz + 50 });
        expect(max, `pass across ridge z=${rz} at x=${x}`).toBeLessThan(1.0);
      }
    }
  });

  it('the overshoot plateau beyond the rim stays a flat staging ground', () => {
    // Terrain past the playable rectangle is never rendered and never
    // reachable in play, but dev teleports, /follow, and the chat tests park
    // entities out there (z = -1000 is tests/follow.test.ts's parade ground).
    // The mountain crest noise and terracing fade out past the rim
    // (OUTSIDE_FADE_END in src/sim/world.ts), so beyond the fade the plateau
    // must stay comfortably walkable at any seed in use (20061 is the
    // production seed, 42 the test-suite seed). OUTS samples both just past
    // the fade (parity scenarios stage mobs ~20yd out) and the deep plateau.
    // Deliberately NOT sampled: the fade transition band itself (2..10yd
    // out), a crag-to-berm cliff that is steeper than the climb limit in
    // places; nothing may stage there. The 12yd samples double as a tripwire:
    // if OUTSIDE_FADE_END ever grows past 10, they land inside the band and
    // this test fails loudly instead of the staging contract eroding quietly.
    // Tightest observed sample is ~0.93 at one corner (192, 936, seed 42),
    // pre-existing base geometry rather than anything fade-controlled, so a
    // failure just under 1.0 there points at a base-noise tweak, not the fade.
    const OUTS = [12, 70, 400];
    for (const seed of [WORLD_SEED, 42]) {
      for (let x = -176; x <= 176; x += 4) {
        for (const out of OUTS) {
          for (const z of [WORLD_MIN_Z - out, WORLD_MAX_Z + out]) {
            expect(
              terrainSteepness(x, z, seed),
              `z-overshoot plateau at (${x},${z}) seed=${seed}`,
            ).toBeLessThan(1.0);
          }
        }
        expect(
          terrainSteepness(x, -1000, seed),
          `follow parade ground at (${x},-1000) seed=${seed}`,
        ).toBeLessThan(1.0);
      }
      // The x-side overshoot, skipping the bands where a zone ridge's smooth
      // gaussian ramp (impassable by design, faded or not) runs off the edge.
      for (const side of [-1, 1]) {
        for (const out of OUTS) {
          const x = side * (WORLD_MAX_X + out);
          for (let z = WORLD_MIN_Z - 40; z <= WORLD_MAX_Z + 40; z += 4) {
            if (RIDGE_ZS.some((rz) => Math.abs(z - rz) < 40)) continue;
            expect(
              terrainSteepness(x, z, seed),
              `x-overshoot plateau at (${x},${z}) seed=${seed}`,
            ).toBeLessThan(1.0);
          }
        }
      }
    }
  });

  it('camps, npcs, hubs, and road vertices all sit on walkable ground', () => {
    for (const camp of CAMPS) {
      expect(
        terrainSteepness(camp.center.x, camp.center.z, WORLD_SEED),
        `camp at (${camp.center.x},${camp.center.z})`,
      ).toBeLessThanOrEqual(CLIMB_LIMIT);
    }
    for (const [id, npc] of Object.entries(NPCS)) {
      const pos = (npc as { pos?: { x: number; z: number } }).pos;
      if (!pos) continue;
      expect(
        terrainSteepness(pos.x, pos.z, WORLD_SEED),
        `npc ${id} at (${pos.x},${pos.z})`,
      ).toBeLessThanOrEqual(CLIMB_LIMIT);
    }
    for (const zone of ZONES) {
      expect(
        terrainSteepness(zone.hub.x, zone.hub.z, WORLD_SEED),
        `hub of ${zone.name}`,
      ).toBeLessThanOrEqual(CLIMB_LIMIT);
    }
    for (const road of ROADS) {
      for (const p of road) {
        expect(
          terrainSteepness(p.x, p.z, WORLD_SEED),
          `road vertex (${p.x},${p.z})`,
        ).toBeLessThanOrEqual(CLIMB_LIMIT);
      }
    }
  });
});
