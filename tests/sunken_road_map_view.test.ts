// Tests for the Sunken Road underground map schematic's pure core
// (sunken_road_map_view.ts): isInSunkenRoad (the mapWindowMode discriminator's
// backing check) and buildSunkenRoadMapModel's geometry.
import { describe, expect, it } from 'vitest';
import { SUNKEN_ROAD_CENTERLINE, SUNKEN_ROAD_WAYPOINTS, WORLD_MAX_X } from '../src/sim/data';
import { mapWindowMode } from '../src/ui/map_window_view';
import { buildSunkenRoadMapModel, isInSunkenRoad } from '../src/ui/sunken_road_map_view';
import type { IWorld } from '../src/world_api';

const CANVAS = 560;

function makeWorld(x: number, z: number, facing = 0): IWorld {
  return {
    player: { id: 1, kind: 'player', name: 'Me', pos: { x, z }, facing },
    entities: new Map(),
    socialInfo: null,
    delveRun: null,
    cfg: { seed: 42, playerClass: 'warrior' },
    playerId: 1,
    questState: () => 'unavailable',
    questLog: new Map(),
  } as unknown as IWorld;
}

describe('isInSunkenRoad', () => {
  it('is true exactly on the centerline, false far out in the open world', () => {
    const p = SUNKEN_ROAD_CENTERLINE[Math.floor(SUNKEN_ROAD_CENTERLINE.length / 2)];
    expect(isInSunkenRoad(p.x, p.z)).toBe(true);
    expect(isInSunkenRoad(WORLD_MAX_X + 200, 0)).toBe(false);
  });

  it('is true at both mouths (the surface approach into the tunnel)', () => {
    const first = SUNKEN_ROAD_WAYPOINTS[0];
    const last = SUNKEN_ROAD_WAYPOINTS[SUNKEN_ROAD_WAYPOINTS.length - 1];
    expect(isInSunkenRoad(first.x, first.z)).toBe(true);
    expect(isInSunkenRoad(last.x, last.z)).toBe(true);
  });
});

describe('mapWindowMode (sunkenRoad branch)', () => {
  it('selects sunkenRoad when the player stands in the tunnel', () => {
    const p = SUNKEN_ROAD_WAYPOINTS[2];
    expect(mapWindowMode(makeWorld(p.x, p.z))).toBe('sunkenRoad');
  });

  it('falls back to overworld well outside the tunnel', () => {
    expect(mapWindowMode(makeWorld(0, 0))).toBe('overworld');
  });
});

describe('buildSunkenRoadMapModel', () => {
  it('projects every centerline point on-canvas and keeps proportions square', () => {
    const model = buildSunkenRoadMapModel(makeWorld(0, 0), CANVAS);
    expect(model.path).toHaveLength(SUNKEN_ROAD_CENTERLINE.length);
    for (const { mx, my } of model.path) {
      expect(mx).toBeGreaterThanOrEqual(0);
      expect(mx).toBeLessThanOrEqual(CANVAS);
      expect(my).toBeGreaterThanOrEqual(0);
      expect(my).toBeLessThanOrEqual(CANVAS);
    }
  });

  it('reports the Eastbrook and Fenbridge mouth identities in order', () => {
    const model = buildSunkenRoadMapModel(makeWorld(0, 0), CANVAS);
    expect(model.mouths[0].zoneId).toBe('eastbrook_vale');
    expect(model.mouths[1].zoneId).toBe('mirefen_marsh');
  });

  it('places the player marker only when standing inside the tunnel', () => {
    const inside = SUNKEN_ROAD_WAYPOINTS[3];
    expect(buildSunkenRoadMapModel(makeWorld(inside.x, inside.z), CANVAS).player).not.toBeNull();
    expect(buildSunkenRoadMapModel(makeWorld(0, 0), CANVAS).player).toBeNull();
  });

  it('is deterministic for the same input', () => {
    const world = makeWorld(SUNKEN_ROAD_WAYPOINTS[1].x, SUNKEN_ROAD_WAYPOINTS[1].z, 1.2);
    expect(buildSunkenRoadMapModel(world, CANVAS)).toEqual(buildSunkenRoadMapModel(world, CANVAS));
  });
});
