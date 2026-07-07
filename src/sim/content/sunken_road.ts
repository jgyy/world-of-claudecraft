// The Sunken Road: a deep, walkable mine tunnel connecting Eastbrook Vale
// (Zone 1) directly to Mirefen Marsh (Zone 2).
//
// A real NARROW bore, not a wide open-air trench: a chain of closely spaced
// 'level'/'flat' HeightStamps (see sim/types.ts HeightStamp) carves a corridor
// only TUNNEL_FLOOR_RADIUS wide with sharp (not smoothed) walls, so the carved
// footprint is deliberately narrower than the visual shell that wraps it
// (src/render/cave_tunnel.ts: a THREE.TubeGeometry swept along this same
// centerline). Standing anywhere on the walkable floor, the shell fully
// encloses you in every direction, including straight up: this is the fix for
// an earlier version that used one wide 'smooth' stamp per waypoint (spaced
// far apart): that carved a broad, gently-sloped BOWL (a valley), and the
// narrow floating tube inside it left most of the walkable floor open to sky.
// A tunnel's floor must be no wider than its own ceiling. Terrain-aware water
// (waterLevelAt/isInWaterBody, sim/world.ts) means this can sit far below the
// old flat WATER_LEVEL without flooding or blocking non-swim movement, as
// long as it stays outside every zone's declared `lakes` list (it does).
//
// Enters both zones on their west side ("9 o'clock" on the map, the same
// convention Glimmervein Cavern used). Threads between Eastbrook Vale's
// northwest (-8,6)->(-35,25)->(-58,48)->(-66,58) and southwest (-6,-6)->
// (-30,-28)->(-55,-45)->(-70,-55) roads and the webwood_spider (-60,5) /
// mudfin_murloc (-75,57) camps, ducks east of Mirror Lake's terrain-aware
// footprint (-92,88, radius 30 -> 48; the -172,80 waypoint bulges further out
// than that footprint so the tunnel_gravemite camp anchored there can't aggro
// across it), then in Mirefen Marsh clears the
// mire_prowler camp (-40,230) and stays well short of Deepfen Shallows'
// footprint (-110,310, radius 56). The route below is unchanged from before;
// only the carve width/technique changed, so all of that clearance still
// holds (a narrower carve only makes it hold with MORE margin).
// Crosses the zone1/zone2 ridge at x=-110, z=180 (tests/terrain_walls.test.ts
// excludes this corridor from the "every ridge crossing is a wall" check,
// the same way it already excludes the native road pass at x=0).

import type {
  CampDef,
  GatherNodeDef,
  HeightStamp,
  ItemDef,
  MobTemplate,
  NpcDef,
  QuestDef,
} from '../types';

// A genuinely deep subway-style bore, not a shallow trench: the old flat
// WATER_LEVEL model would have flooded or blocked movement well above this;
// terrain-aware water (isInWaterBody, sim/world.ts) means it stays dry and
// walkable here since it is outside every zone's declared `lakes` list.
export const SUNKEN_ROAD_FLOOR_Y = -24;
// The floor carve's own radius: a real corridor width (16yd wide), not a wide
// bowl. 'flat' falloff (below) means no smoothing past this radius: the walls
// are a sharp, effectively vertical drop, which is exactly right for a
// tunnel's side walls (they are not meant to be walkable, only impassable).
export const TUNNEL_FLOOR_RADIUS = 8;
// The x of the waypoint that carves through the zone1/zone2 ridge: exported so
// tests/terrain_walls.test.ts can exclude this corridor from its "every ridge
// crossing outside the road pass is a wall" sweep, the same way it already
// excludes the native road pass at x=0.
export const SUNKEN_ROAD_RIDGE_CROSSING_X = -110;

// Control waypoints from the Eastbrook mouth to the Fenbridge mouth: the
// route the tunnel follows (used for camp/NPC placement and as the render
// shell's spline control points). The actual terrain carve below is a much
// DENSER set of points interpolated along these segments (see
// densifyPolyline), since a narrow 'flat' stamp needs close spacing to stay
// continuous, unlike the old wide 'smooth' stamps which could be sparse.
export const SUNKEN_ROAD_WAYPOINTS: { x: number; z: number }[] = [
  { x: -95, z: -15 }, // Eastbrook mouth, west of town (9 o'clock)
  { x: -100, z: 20 },
  { x: -140, z: 50 }, // stays west of Mirror Lake's terrain-aware footprint
  { x: -172, z: 80 }, // bulges further out here: this waypoint also anchors a
  // mob camp, and the camp's aggroRadius needs to clear not just the lake's
  // own footprint but the wider ring the Mirror Lake fishing spot search
  // (tests/sim.test.ts) scans out to
  { x: -140, z: 110 },
  { x: -145, z: 122 }, // keeps the segment itself clear of the lake circle
  { x: -100, z: 140 }, // past the lake's z-reach; swings back in
  { x: -110, z: 180 }, // ridge crossing
  { x: -110, z: 205 },
  { x: -110, z: 230 },
  { x: -140, z: 258 }, // Fenbridge mouth, west of town (9 o'clock)
];

// Interpolates points every `spacing` units along a polyline's segments
// (always including every original vertex), so a narrow, non-blending 'flat'
// stamp chain stays continuous along the whole route instead of leaving gaps
// between widely spaced control points.
function densifyPolyline(
  points: readonly { x: number; z: number }[],
  spacing: number,
): { x: number; z: number }[] {
  const out: { x: number; z: number }[] = [points[0]];
  for (let i = 0; i + 1 < points.length; i++) {
    const a = points[i];
    const b = points[i + 1];
    const dist = Math.hypot(b.x - a.x, b.z - a.z);
    const steps = Math.max(1, Math.round(dist / spacing));
    for (let s = 1; s <= steps; s++) {
      const t = s / steps;
      out.push({ x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t });
    }
  }
  return out;
}

// Exported so the render shell (cave_tunnel.ts) can sweep its tube along the
// SAME dense path the terrain actually carves, rather than the sparse control
// waypoints, so the shell hugs the corridor tightly through every turn.
export const SUNKEN_ROAD_CENTERLINE = densifyPolyline(
  SUNKEN_ROAD_WAYPOINTS,
  TUNNEL_FLOOR_RADIUS * 0.75,
);

// Both mouths otherwise open onto natural rolling terrain (roughly -3 to -4)
// right next to the interior's sharp, 'flat'-falloff full-depth carve (-24):
// with nothing between them, a player walking toward the mouth meets an
// invisible-until-the-last-step 20-yard sheer cliff instead of a walkable
// entrance, exactly the "I can't find where to walk in" failure mode. Both
// mouths sit due west of their zone's hub (see the file header's "9 o'clock"
// note), so the open field is always the +x side: taper each mouth outward
// along +x with a short chain of wide, 'smooth'-falloff stamps shallowing
// from the tunnel floor back up to natural grade, so the entrance reads (and
// plays) as a graded ramp cut into the hillside, not a fall-in pit. These
// stay terrain-only (not added to SUNKEN_ROAD_CENTERLINE): the render shell
// only needs to enclose the actual full-depth corridor, not this open-air
// approach cut.
const MOUTH_RAMP_OFFSETS = [4, 9, 15, 21, 28]; // yd outward (+x) from the mouth
const MOUTH_RAMP_RADIUS = 15; // wider than the tunnel floor so it blends into the hillside
const MOUTH_RAMP_DEPTHS = [-20, -15, -11, -7, -4]; // shallows back out to natural grade

function mouthRampEdits(mouth: { x: number; z: number }): HeightStamp[] {
  return MOUTH_RAMP_OFFSETS.map((dx, i) => ({
    x: mouth.x + dx,
    z: mouth.z,
    radius: MOUTH_RAMP_RADIUS,
    delta: MOUTH_RAMP_DEPTHS[i],
    falloff: 'smooth',
    mode: 'level',
  }));
}

// The ramps run FIRST and the full-depth 'flat' interior stamps LAST: a
// 'flat' stamp forces height to its delta unconditionally (w=1) everywhere
// inside its own radius, so applying it last guarantees every corridor point
// (including both mouths themselves) still lands at the true floor depth,
// regardless of a ramp stamp's radius reaching back that far. The ramps only
// end up shaping ground the interior carve's own 8yd reach never touches.
export const SUNKEN_ROAD_TERRAIN_EDITS: HeightStamp[] = [
  ...mouthRampEdits(SUNKEN_ROAD_WAYPOINTS[0]),
  ...mouthRampEdits(SUNKEN_ROAD_WAYPOINTS[SUNKEN_ROAD_WAYPOINTS.length - 1]),
  ...SUNKEN_ROAD_CENTERLINE.map((wp) => ({
    x: wp.x,
    z: wp.z,
    radius: TUNNEL_FLOOR_RADIUS,
    delta: SUNKEN_ROAD_FLOOR_Y,
    falloff: 'flat' as const,
    mode: 'level' as const,
  })),
];

// ---------------------------------------------------------------------------
// Content: mobs bridging Zone 1's top (7) and Zone 2's entry band (6-8),
// camps along the route, one lone named elite near the ridge crossing, an ore
// vein pair, a junk item, one NPC, and a single standalone quest.
// ---------------------------------------------------------------------------

export const SUNKEN_ROAD_MOBS: Record<string, MobTemplate> = {
  tunnel_gravemite: {
    id: 'tunnel_gravemite',
    name: 'Tunnel Gravemite',
    minLevel: 6,
    maxLevel: 7,
    family: 'beast',
    hpBase: 95,
    hpPerLevel: 18,
    dmgBase: 6,
    dmgPerLevel: 2.0,
    attackSpeed: 1.9,
    armorPerLevel: 14,
    moveSpeed: 7.5,
    aggroRadius: 11,
    loot: [
      { copper: 14, chance: 1 },
      { itemId: 'sunken_road_grit', chance: 0.4 },
    ],
    scale: 0.85,
    color: 0x5b4636,
    componentTags: ['claw'],
  },
  deep_road_stalker: {
    id: 'deep_road_stalker',
    name: 'Deep Road Stalker',
    minLevel: 7,
    maxLevel: 8,
    family: 'beast',
    hpBase: 130,
    hpPerLevel: 20,
    dmgBase: 8,
    dmgPerLevel: 2.3,
    attackSpeed: 1.7,
    armorPerLevel: 16,
    moveSpeed: 8.5,
    aggroRadius: 13,
    loot: [
      { copper: 20, chance: 1 },
      { itemId: 'sunken_road_grit', chance: 0.35 },
    ],
    scale: 1.0,
    color: 0x2f3b2f,
    componentTags: ['fang', 'hide'],
  },
  the_old_prospector: {
    id: 'the_old_prospector',
    name: 'The Old Prospector',
    minLevel: 8,
    maxLevel: 8,
    family: 'beast',
    rare: true,
    hpBase: 260,
    hpPerLevel: 22,
    dmgBase: 10,
    dmgPerLevel: 2.6,
    attackSpeed: 1.8,
    armorPerLevel: 18,
    moveSpeed: 8,
    aggroRadius: 14,
    loot: [
      { copper: 90, chance: 1 },
      { itemId: 'sunken_road_grit', chance: 1 },
    ],
    scale: 1.15,
    color: 0x8a6d3b,
    componentTags: ['claw', 'hide'],
  },
};

// Camps sit exactly on the tunnel's own waypoints with a small radius (< the
// floor's own 8yd carve radius), so every mob actually spawns on the narrow
// walkable strip rather than out in the (now unwalkable) tunnel wall.
export const SUNKEN_ROAD_CAMPS: CampDef[] = [
  { mobId: 'tunnel_gravemite', center: { x: -100, z: 20 }, radius: 6, count: 5 },
  { mobId: 'tunnel_gravemite', center: { x: -172, z: 80 }, radius: 6, count: 4 },
  { mobId: 'the_old_prospector', center: { x: -110, z: 180 }, radius: 5, count: 1 },
  { mobId: 'deep_road_stalker', center: { x: -110, z: 205 }, radius: 6, count: 5 },
  { mobId: 'deep_road_stalker', center: { x: -110, z: 230 }, radius: 6, count: 4 },
];

export const SUNKEN_ROAD_GATHER_NODES: GatherNodeDef[] = [
  { id: 'ore_sunken_road_1', zoneId: 'eastbrook_vale', type: 'ore', pos: { x: -140, z: 110 } },
  { id: 'ore_sunken_road_2', zoneId: 'mirefen_marsh', type: 'ore', pos: { x: -110, z: 205 } },
];

export const SUNKEN_ROAD_ITEMS: Record<string, ItemDef> = {
  sunken_road_grit: {
    id: 'sunken_road_grit',
    name: 'Sunken Road Grit',
    kind: 'junk',
    quality: 'poor',
    sellValue: 6,
  },
};

export const SUNKEN_ROAD_NPC_ID = 'foreman_delke';

export const SUNKEN_ROAD_NPCS: Record<string, NpcDef> = {
  [SUNKEN_ROAD_NPC_ID]: {
    id: SUNKEN_ROAD_NPC_ID,
    name: 'Foreman Delke',
    title: 'Last of the Sunken Road Crew',
    pos: { x: -90, z: -10 },
    facing: Math.PI,
    color: 0x8a6d3b,
    questIds: ['q_sunken_road'],
    greeting: 'The old mine road still runs clear to Fenbridge, if you dare the vermin in it, $C.',
  },
};

export const SUNKEN_ROAD_QUEST_ID = 'q_sunken_road';

export const SUNKEN_ROAD_QUESTS: Record<string, QuestDef> = {
  [SUNKEN_ROAD_QUEST_ID]: {
    id: SUNKEN_ROAD_QUEST_ID,
    name: 'Clearing the Sunken Road',
    giverNpcId: SUNKEN_ROAD_NPC_ID,
    turnInNpcId: SUNKEN_ROAD_NPC_ID,
    text: 'My crew dug that road clear to Fenbridge before the gravemites moved in. Thin them out, $N, and the stalkers deeper in, and honest folk can walk it again.',
    completionText:
      'Clear air and quiet stone. You have my thanks, and Fenbridge will hear of it too.',
    objectives: [
      { type: 'kill', targetMobId: 'tunnel_gravemite', count: 8, label: 'Tunnel Gravemite slain' },
      {
        type: 'kill',
        targetMobId: 'deep_road_stalker',
        count: 6,
        label: 'Deep Road Stalker slain',
      },
    ],
    xpReward: 380,
    copperReward: 130,
    itemRewards: {},
    minLevel: 6,
  },
};
