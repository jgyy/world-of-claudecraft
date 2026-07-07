// Pure draw model for the Sunken Road's dedicated underground schematic map.
//
// The overworld map (map_window_view.ts) only ever shows "The Sunken Road" as a
// single POI label at its Eastbrook/Fenbridge mouth: a real top-down zone map
// has no sensible way to depict a corridor that runs 24 yards straight down,
// so instead of trying to paint it on the surface map, opening the map window
// while standing inside the tunnel switches to this dedicated schematic (same
// pure-core + thin-painter split as the delve branch; see mapWindowMode in
// map_window_view.ts for the sibling selector this mirrors).
//
// DOM-free / i18n-free so tests can drive it directly: labels carry identity
// (zoneId/poiIndex), the painter resolves localized text via zonePoiLabel,
// same as the overworld POI markers.

import {
  SUNKEN_ROAD_CENTERLINE,
  SUNKEN_ROAD_RIDGE_CROSSING_X,
  SUNKEN_ROAD_WAYPOINTS,
  TUNNEL_FLOOR_RADIUS,
} from '../sim/data';
import type { IWorld } from '../world_api';

// A player standing this many multiples of the carve radius from the nearest
// centerline point still reads as "in the tunnel" (covers the mouths, where
// the corridor widens slightly into the surface approach).
const IN_TUNNEL_RADIUS_MULT = 1.5;

/** True when (x, z) is inside the Sunken Road's walkable corridor (or close
 *  enough to one of its mouths that opening the map should show the
 *  underground schematic instead of the surface map). */
export function isInSunkenRoad(x: number, z: number): boolean {
  const rMax = TUNNEL_FLOOR_RADIUS * IN_TUNNEL_RADIUS_MULT;
  for (const p of SUNKEN_ROAD_CENTERLINE) {
    if ((x - p.x) ** 2 + (z - p.z) ** 2 < rMax * rMax) return true;
  }
  return false;
}

export interface SunkenRoadMapMouth {
  mx: number;
  my: number;
  zoneId: string;
  poiIndex: number;
}

export interface SunkenRoadMapModel {
  /** The dense centerline, already projected to canvas pixels. */
  path: { mx: number; my: number }[];
  /** Both ends of the tunnel: index 0 is the Eastbrook mouth, 1 the Fenbridge one. */
  mouths: [SunkenRoadMapMouth, SunkenRoadMapMouth];
  /** The zone1/zone2 ridge crossing, projected to canvas pixels. */
  ridge: { mx: number; my: number };
  /** The local player's position along the schematic, or null off the path
   *  entirely (opening the map mid-transition at a mouth). */
  player: { mx: number; my: number; angle: number } | null;
}

// "The Sunken Road" is the last POI in both zone1's and zone2's `pois` list
// (src/sim/content/zone1.ts / zone2.ts): the painter resolves its localized
// text via zonePoiLabel(zoneId, poiIndex), same as every other POI label.
const EASTBROOK_MOUTH = { zoneId: 'eastbrook_vale', poiIndex: 10 };
const FENBRIDGE_MOUTH = { zoneId: 'mirefen_marsh', poiIndex: 8 };

// A fixed margin (world units) around the centerline's own bounding box, so
// the schematic doesn't crop the path flush against the canvas edge.
const SCHEMATIC_MARGIN = TUNNEL_FLOOR_RADIUS * 3;

export function buildSunkenRoadMapModel(world: IWorld, canvasSize: number): SunkenRoadMapModel {
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const p of SUNKEN_ROAD_CENTERLINE) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.z < minZ) minZ = p.z;
    if (p.z > maxZ) maxZ = p.z;
  }
  minX -= SCHEMATIC_MARGIN;
  maxX += SCHEMATIC_MARGIN;
  minZ -= SCHEMATIC_MARGIN;
  maxZ += SCHEMATIC_MARGIN;
  const spanX = maxX - minX;
  const spanZ = maxZ - minZ;
  // Square canvas: fit the longer world span to the canvas, center the shorter
  // one, so the corridor's true proportions never stretch.
  const scale = canvasSize / Math.max(spanX, spanZ);
  const offX = (canvasSize - spanX * scale) / 2;
  const offZ = (canvasSize - spanZ * scale) / 2;
  // Matches the overworld map's convention (+X world is map-left; see
  // map_window_view.ts toMap): world's east is -X, so drawing +X to the right
  // would mirror the world.
  const toMap = (x: number, z: number): { mx: number; my: number } => ({
    mx: offX + (maxX - x) * scale,
    my: offZ + (maxZ - z) * scale,
  });

  const path = SUNKEN_ROAD_CENTERLINE.map((p) => toMap(p.x, p.z));
  const firstWp = SUNKEN_ROAD_WAYPOINTS[0];
  const lastWp = SUNKEN_ROAD_WAYPOINTS[SUNKEN_ROAD_WAYPOINTS.length - 1];
  const eastbrook = toMap(firstWp.x, firstWp.z);
  const fenbridge = toMap(lastWp.x, lastWp.z);
  const ridgeWp =
    SUNKEN_ROAD_WAYPOINTS.find((wp) => wp.x === SUNKEN_ROAD_RIDGE_CROSSING_X) ?? firstWp;
  const ridge = toMap(ridgeWp.x, ridgeWp.z);

  const p = world.player;
  let player: SunkenRoadMapModel['player'] = null;
  if (isInSunkenRoad(p.pos.x, p.pos.z)) {
    const { mx, my } = toMap(p.pos.x, p.pos.z);
    // Matches the overworld player arrow: canvas is mirrored on X, so the
    // world facing is negated (map_window_view.ts draws the same way).
    player = { mx, my, angle: -p.facing };
  }

  return {
    path,
    mouths: [
      { ...eastbrook, ...EASTBROOK_MOUTH },
      { ...fenbridge, ...FENBRIDGE_MOUTH },
    ],
    ridge,
    player,
  };
}
