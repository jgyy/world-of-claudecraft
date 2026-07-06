import { describe, expect, it } from 'vitest';
import { SUNKEN_ROAD_FLOOR_Y, SUNKEN_ROAD_WAYPOINTS } from '../src/sim/data';
import { PLAYER_SWIM_DEPTH } from '../src/sim/pathfind';
import { isInWaterBody, terrainHeight, waterLevelAt } from '../src/sim/world';

// The Sunken Road: a deep tunnel connecting Eastbrook Vale to Mirefen Marsh,
// carved via HeightStamp terrainEdits (see src/sim/content/sunken_road.ts).
// Terrain-aware water (#1518) means this stays dry and walkable at a depth
// (SUNKEN_ROAD_FLOOR_Y = -14) that would have flooded/blocked under the old
// flat WATER_LEVEL model.

const SEED = 20061; // the fixed production seed (src/main.ts, server/game.ts)

describe('the Sunken Road tunnel', () => {
  it('is not inside any declared water body, at any waypoint', () => {
    for (const wp of SUNKEN_ROAD_WAYPOINTS) {
      expect(isInWaterBody(wp.x, wp.z), `waypoint (${wp.x},${wp.z})`).toBe(false);
      expect(waterLevelAt(wp.x, wp.z), `waypoint (${wp.x},${wp.z})`).toBe(-Infinity);
    }
  });

  it('every waypoint carves down to (near) the tunnel floor depth', () => {
    for (const wp of SUNKEN_ROAD_WAYPOINTS) {
      const h = terrainHeight(wp.x, wp.z, SEED);
      expect(h, `waypoint (${wp.x},${wp.z})`).toBeLessThan(SUNKEN_ROAD_FLOOR_Y + 1);
    }
  });

  it('stays walkable (non-swim) along the whole winding centerline', () => {
    for (let i = 0; i + 1 < SUNKEN_ROAD_WAYPOINTS.length; i++) {
      const a = SUNKEN_ROAD_WAYPOINTS[i];
      const b = SUNKEN_ROAD_WAYPOINTS[i + 1];
      const steps = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 2));
      for (let s = 0; s <= steps; s++) {
        const t = s / steps;
        const x = a.x + (b.x - a.x) * t;
        const z = a.z + (b.z - a.z) * t;
        const h = terrainHeight(x, z, SEED);
        const floor = waterLevelAt(x, z) - PLAYER_SWIM_DEPTH;
        expect(h, `centerline point (${x.toFixed(1)},${z.toFixed(1)})`).toBeGreaterThanOrEqual(
          floor,
        );
      }
    }
  });
});
