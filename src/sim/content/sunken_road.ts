// The Sunken Road: a deep, walkable mine tunnel connecting Eastbrook Vale
// (Zone 1) directly to Mirefen Marsh (Zone 2).
//
// Carved as a chain of overlapping 'level'/'smooth' HeightStamps (see
// sim/types.ts HeightStamp): each stamp pulls the ground to a fixed floor, and
// its own concave falloff is the wall, so no separate wall/ceiling geometry is
// needed. Terrain-aware water (waterLevelAt/isInWaterBody, sim/world.ts) means
// this can sit far below the old flat WATER_LEVEL without flooding or
// blocking non-swim movement, as long as it stays outside every zone's
// declared `lakes` list (it does).
//
// Runs well east of Eastbrook Vale's existing "northeast to ruins" road
// (ZONE1_ROADS: (6,8)->(35,35)->(60,60)->(78,74)) and its Hollow Crypt camps
// (restless_bones/captain_verlan/wraithbinder_maldrec, x~78-92 z~75-92), and
// the forest_wolf camp at (20,70): the whole zone1 stretch stays x>=100.
// Converges back toward x~40-90 in Mirefen Marsh, threading clear of the
// mire_prowler camp at (35,225) and the mire_widow camps at (70,300)/(95,340),
// and the causeway (ZONE2_ROADS[0], which hugs x~0..-8).
//
// Winds x=100..140 as z runs 15->180 (zone1), then x=40..90 as z runs
// 180->275 (zone2), crossing the zone1/zone2 ridge (z=180), mouths just
// outside each town hub.

import type { CampDef, GatherNodeDef, HeightStamp, ItemDef, MobTemplate, NpcDef, QuestDef } from '../types';

export const SUNKEN_ROAD_FLOOR_Y = -14;
const STAMP_RADIUS = 28;

// Waypoints from the Eastbrook mouth to the Fenbridge mouth. Consecutive
// stamps overlap (spacing well under 2x radius) so the floor stays continuous.
export const SUNKEN_ROAD_WAYPOINTS: { x: number; z: number }[] = [
  { x: 130, z: 15 }, // Eastbrook mouth, clear of the NE road, town hub (radius 26), and (100,0)
  // (a fixed reference point tests/custom_map_parity.test.ts uses as its "no terrain edits" probe)
  { x: 130, z: 45 },
  { x: 125, z: 75 }, // clear of the Hollow Crypt camps
  { x: 140, z: 100 },
  { x: 110, z: 130 },
  { x: 135, z: 155 },
  { x: 115, z: 180 }, // ridge crossing
  { x: 90, z: 205 },
  { x: 85, z: 230 }, // clear of the mire_prowler camp at (35,225)
  { x: 65, z: 255 },
  { x: 40, z: 275 }, // Fenbridge mouth, clear of the mire_widow camp at (70,300)
];

export const SUNKEN_ROAD_TERRAIN_EDITS: HeightStamp[] = SUNKEN_ROAD_WAYPOINTS.map((wp) => ({
  x: wp.x,
  z: wp.z,
  radius: STAMP_RADIUS,
  delta: SUNKEN_ROAD_FLOOR_Y,
  falloff: 'smooth',
  mode: 'level',
}));

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

export const SUNKEN_ROAD_CAMPS: CampDef[] = [
  { mobId: 'tunnel_gravemite', center: { x: 130, z: 45 }, radius: 20, count: 5 },
  { mobId: 'tunnel_gravemite', center: { x: 140, z: 100 }, radius: 18, count: 4 },
  { mobId: 'the_old_prospector', center: { x: 115, z: 180 }, radius: 6, count: 1 },
  { mobId: 'deep_road_stalker', center: { x: 85, z: 230 }, radius: 20, count: 5 },
  { mobId: 'deep_road_stalker', center: { x: 55, z: 260 }, radius: 18, count: 4 },
];

export const SUNKEN_ROAD_GATHER_NODES: GatherNodeDef[] = [
  { id: 'ore_sunken_road_1', zoneId: 'eastbrook_vale', type: 'ore', pos: { x: 132, z: 60 } },
  { id: 'ore_sunken_road_2', zoneId: 'mirefen_marsh', type: 'ore', pos: { x: 60, z: 245 } },
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
    pos: { x: 125, z: 10 },
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
    text: "My crew dug that road clear to Fenbridge before the gravemites moved in. Thin them out, $N, and the stalkers deeper in, and honest folk can walk it again.",
    completionText: 'Clear air and quiet stone. You have my thanks, and Fenbridge will hear of it too.',
    objectives: [
      { type: 'kill', targetMobId: 'tunnel_gravemite', count: 8, label: 'Tunnel Gravemite slain' },
      { type: 'kill', targetMobId: 'deep_road_stalker', count: 6, label: 'Deep Road Stalker slain' },
    ],
    xpReward: 380,
    copperReward: 130,
    itemRewards: {},
    minLevel: 6,
  },
};
