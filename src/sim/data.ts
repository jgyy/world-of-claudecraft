// Content merge layer. Actual game content lives in sim/content/* — one
// module per zone plus classes (abilities), shared items, and dungeons —
// so content can grow without everything colliding in one file. This module
// merges those records into the flat tables the rest of the engine consumes,
// and owns the world-layout constants.

import { BASE_ITEMS, FISHING_RARE_ID, FISHING_TABLES } from './content/items';
import type {
  CampDef,
  DelveDef,
  DelveModuleDef,
  DungeonDef,
  GatherNodeDef,
  GroundObjectDef,
  ItemDef,
  MobTemplate,
  NpcDef,
  PlayerClass,
  QuestDef,
  QuestState,
  WorldContent,
  ZoneDef,
  ZonePropsDef,
} from './types';

export type { FishingEntry } from './content/items';
export { FISHING_RARE_ID, FISHING_TABLES };

import {
  BROTHER_HALVEN,
  BROTHER_HALVEN_MARSH,
  COLLAPSED_RELIQUARY_DELVE,
  COLLAPSED_RELIQUARY_MODULES,
  DELVE_MOBS,
  DROWNED_LITANY_DELVE,
  DROWNED_LITANY_MODULES,
} from './content/delves';
import { DUNGEON_DEFS, DUNGEON_MOBS } from './content/dungeons';
import { GATHER_NODES as GATHER_NODES_CONTENT } from './content/gather_nodes';
import {
  type GraveyardDef,
  OVERWORLD_GRAVEYARDS,
  SPIRIT_HEALER,
  SPIRIT_HEALER_NPC_ID,
} from './content/graveyards';
import { GROUND_PICKUP_LINES } from './content/ground_pickup_lines';
import { COMMON_RECIPES as COMMON_RECIPES_CONTENT } from './content/recipes';
import {
  TEMPLE_CAMPS,
  TEMPLE_DUNGEON_DEFS,
  TEMPLE_DUNGEON_MOBS,
  TEMPLE_ITEMS,
  TEMPLE_MOBS,
  TEMPLE_NPCS,
  TEMPLE_OBJECTS,
  TEMPLE_PROPS,
  TEMPLE_QUEST_ORDER,
  TEMPLE_QUESTS,
} from './content/temple';
import { WARLOCK_PET_MOBS } from './content/warlock_pets';
import {
  GRAVEYARD_POS,
  LAKE,
  TOWN_RADIUS,
  ZONE1_CAMPS,
  ZONE1_CAVERN_CAMPS,
  ZONE1_CHAPEL_CAMPS,
  ZONE1_MOBS,
  ZONE1_NPCS,
  ZONE1_OBJECTS,
  ZONE1_PROPS,
  ZONE1_QUEST_ORDER,
  ZONE1_QUESTS,
  ZONE1_ROADS,
  ZONE1_ZONE,
} from './content/zone1';
import {
  DEEPFEN_SHALLOWS_LAKE,
  ZONE2_CAMPS,
  ZONE2_CAVERN_CAMPS,
  ZONE2_ITEMS,
  ZONE2_MOBS,
  ZONE2_NPCS,
  ZONE2_OBJECTS,
  ZONE2_PROPS,
  ZONE2_QUEST_ORDER,
  ZONE2_QUESTS,
  ZONE2_ROADS,
  ZONE2_ZONE,
} from './content/zone2';
import {
  ZONE3_CAMPS,
  ZONE3_ITEMS,
  ZONE3_MOBS,
  ZONE3_NPCS,
  ZONE3_OBJECTS,
  ZONE3_PROPS,
  ZONE3_QUEST_ORDER,
  ZONE3_QUESTS,
  ZONE3_ROADS,
  ZONE3_ZONE,
} from './content/zone3';
import { DUNGEON_WALL_HW } from './dungeon_layout';

export type { DelveShopEntry, DelveShopGate, DelveShopOffer } from './content/delves';
// Delve affix/companion catalogs are consumed by the Sim delve engine; re-export
// them here so sim.ts imports the whole delve data surface from one module.
export {
  COMPANION_UPGRADE_COSTS,
  DELVE_AFFIXES,
  DELVE_COMPANIONS,
  DELVE_SHOPS,
  delveShopGateUnlocked,
  resolveDelveShopOffers,
} from './content/delves';

import { DELVE_ITEMS } from './content/delves/items';
import { DELVE_MODULE_LAYOUTS, type DelveModuleId, delveModuleSpan } from './delve_layout';

function mergeItems(...parts: Record<string, ItemDef>[]): Record<string, ItemDef> {
  const merged = Object.assign({}, ...parts);
  for (const [id, lines] of Object.entries(GROUND_PICKUP_LINES)) {
    if (merged[id]) {
      merged[id] = { ...merged[id], pickupDeny: lines.deny, pickupEnough: lines.enough };
    }
  }
  return merged;
}

export type { ClassDef } from './content/classes';
export { ABILITIES, abilitiesKnownAt, CLASSES } from './content/classes';
export { GATHER_NODE_TYPES } from './content/gather_nodes';
// Re-export content shapes so existing `from './data'` imports keep working.
export type {
  BiomeId,
  CampDef,
  DelveDef,
  DungeonDef,
  DungeonSpawn,
  GatherNodeDef,
  GatherNodeType,
  GroundObjectDef,
  NpcDef,
  ZoneDef,
  ZonePropsDef,
} from './types';

// ---------------------------------------------------------------------------
// Merged content tables
// ---------------------------------------------------------------------------

export const ITEMS: Record<string, ItemDef> = mergeItems(
  BASE_ITEMS,
  ZONE2_ITEMS,
  ZONE3_ITEMS,
  TEMPLE_ITEMS,
  DELVE_ITEMS,
);

export type { AggregatedSetEffect } from './content/item_sets';
export { aggregateSetBonuses, ITEM_SETS } from './content/item_sets';

export const MOBS: Record<string, MobTemplate> = {
  ...ZONE1_MOBS,
  ...ZONE2_MOBS,
  ...ZONE3_MOBS,
  ...DUNGEON_MOBS,
  ...WARLOCK_PET_MOBS,
  ...TEMPLE_MOBS,
  ...TEMPLE_DUNGEON_MOBS,
  ...DELVE_MOBS,
};

export const NPCS: Record<string, NpcDef> = {
  ...ZONE1_NPCS,
  ...ZONE2_NPCS,
  ...ZONE3_NPCS,
  ...TEMPLE_NPCS,
  brother_halven: BROTHER_HALVEN,
  brother_halven_marsh: BROTHER_HALVEN_MARSH,
  // The Spirit Healer template (dynamic: true, so the ctor's surface-placement
  // loop skips it). Kept in NPCS so the online client and world_entity_i18n can
  // resolve its name; spirit.ts spawns a copy at every graveyard.
  [SPIRIT_HEALER_NPC_ID]: SPIRIT_HEALER,
};

// Graveyards + the Spirit Healer: re-exported so the Sim and spirit.ts import the
// whole death-loop data surface from this one merge module.
export { type GraveyardDef, OVERWORLD_GRAVEYARDS, SPIRIT_HEALER, SPIRIT_HEALER_NPC_ID };

export const QUESTS: Record<string, QuestDef> = {
  ...ZONE1_QUESTS,
  ...ZONE2_QUESTS,
  ...ZONE3_QUESTS,
  ...TEMPLE_QUESTS,
};

export const QUEST_ORDER: string[] = [
  ...ZONE1_QUEST_ORDER,
  ...ZONE2_QUEST_ORDER,
  ...ZONE3_QUEST_ORDER,
  ...TEMPLE_QUEST_ORDER,
];

// Camps spawn in array order, each drawing world-gen RNG, so an entry inserted
// before others shifts their spawn positions. New rare-elite camps
// (ZONE1_CHAPEL_CAMPS) and the Eastbrook rare Grix are appended LAST so every
// existing zone camp keeps its exact draw order (determinism).
export const CAMPS: CampDef[] = [
  ...ZONE1_CAMPS,
  ...ZONE2_CAMPS,
  ...ZONE3_CAMPS,
  ...TEMPLE_CAMPS,
  ...ZONE1_CHAPEL_CAMPS,
  { mobId: 'grix_the_tunnelking', center: { x: -95, z: -78 }, radius: 4, count: 1 },
  ...ZONE1_CAVERN_CAMPS,
  ...ZONE2_CAVERN_CAMPS,
];

export const GROUND_OBJECTS: GroundObjectDef[] = [
  ...ZONE1_OBJECTS,
  ...ZONE2_OBJECTS,
  ...ZONE3_OBJECTS,
  ...TEMPLE_OBJECTS,
];

export const GATHER_NODES: GatherNodeDef[] = [...GATHER_NODES_CONTENT];

export const COMMON_RECIPES = [...COMMON_RECIPES_CONTENT];

export const ROADS: { x: number; z: number }[][] = [...ZONE1_ROADS, ...ZONE2_ROADS, ...ZONE3_ROADS];

export const PROPS: ZonePropsDef = mergeProps([
  ZONE1_PROPS,
  ZONE2_PROPS,
  ZONE3_PROPS,
  TEMPLE_PROPS,
]);

function mergeProps(sets: ZonePropsDef[]): ZonePropsDef {
  return {
    buildings: sets.flatMap((s) => s.buildings),
    wells: sets.flatMap((s) => s.wells),
    stalls: sets.flatMap((s) => s.stalls),
    mines: sets.flatMap((s) => s.mines),
    docks: sets.flatMap((s) => s.docks),
    tents: sets.flatMap((s) => s.tents),
    crates: sets.flatMap((s) => s.crates),
    campfires: sets.flatMap((s) => s.campfires),
    mudHuts: sets.flatMap((s) => s.mudHuts),
    ruinRings: sets.flatMap((s) => s.ruinRings),
    fences: sets.flatMap((s) => s.fences),
    graveyards: sets.flatMap((s) => s.graveyards),
    // optional per-zone field, was being dropped here, so the delve entrance
    // marker (name slab + arch) never reached the renderer (props.ts)
    delveMarkers: sets.flatMap((s) => s.delveMarkers ?? []),
  };
}

// Quest reward fallback by archetype: classes without an explicit entry use these.
export const REWARD_ARCHETYPE: Record<PlayerClass, PlayerClass> = {
  warrior: 'warrior',
  paladin: 'warrior',
  shaman: 'warrior',
  rogue: 'rogue',
  hunter: 'rogue',
  mage: 'mage',
  priest: 'mage',
  warlock: 'mage',
  druid: 'mage',
};

// Resolve the item a quest awards a given class: a class-specific reward if the
// quest lists one, else the reward for the class's archetype (rewards are
// authored per archetype — warrior/rogue/mage). The dialog preview and the
// turn-in grant MUST both call this so what the player is shown matches what
// they receive. Returns undefined when the quest has no item reward.
export function questRewardItem(quest: QuestDef, cls: PlayerClass): string | undefined {
  return quest.itemRewards[cls] ?? quest.itemRewards[REWARD_ARCHETYPE[cls]];
}

export const questRewardItemId = questRewardItem;

// Classic-era group XP multipliers by party size (1-5).
export const GROUP_XP_BONUS = [1, 1, 1.166, 1.3, 1.43];

// ---------------------------------------------------------------------------
// Zones. The world is a north-running strip of zone bands: x in
// [-WORLD_SIZE/2, WORLD_SIZE/2], z from WORLD_MIN_Z through the last zone's
// zMax. Each zone owns a hub settlement (terrain flattens there), a
// graveyard, its lakes, and a biome palette the renderer keys off.
// ---------------------------------------------------------------------------

export const ZONES: ZoneDef[] = [ZONE1_ZONE, ZONE2_ZONE, ZONE3_ZONE];

export const WORLD_SIZE = 360; // world width: x spans [-180, 180]
export const WORLD_MIN_X = -WORLD_SIZE / 2;
export const WORLD_MAX_X = WORLD_SIZE / 2;
export const WORLD_MIN_Z = ZONES[0].zMin;
export const WORLD_MAX_Z = ZONES[ZONES.length - 1].zMax;

export const PLAYER_START = { x: 2, z: -2 };

// ---------------------------------------------------------------------------
// Active world content registry.
//
// The terrain function (src/sim/world.ts) and the Sim spawn loop derive the
// playable world from the spatial data below. To support custom maps (the editor)
// without forking the engine, that data is reachable through a swappable bundle.
// The DEFAULT bundle wraps the exact same arrays the built-in game has always
// used, so with no custom map loaded everything is byte-identical.
//
// The editor's offline play-test calls setActiveWorldContent(map) before building
// the Sim+renderer; the default game never touches it.
// ---------------------------------------------------------------------------

// Glimmervein Cavern: a real underground TUNNEL, not a carved-open valley or
// a pass through a ridge wall. It sits on the EAST ("right") side of both
// Eastbrook Vale and Mirefen Marsh (x=110, well clear of every existing camp
// and POI on that side), running under ordinary ground the whole way,
// including under the zone1/zone2 ridge itself.
//
// The terrain here is a single heightfield (there is no second, occluded
// layer to tunnel through), so "underground" is built the same way the
// engine already builds a sunken feature (MIREFEN_IMPACT_CRATER above): a
// HeightStamp pulls the ground down to a fixed low floor. Two things make
// this read as a bored tunnel and not a valley:
//   1. The long BODY run uses 'flat' falloff: every point inside a body
//      stamp's radius snaps straight to the fixed floor with zero blend, so
//      the sides are a sheer, instant drop (real walls, not a graded slope)
//      and the surface hillshade the world map draws shows a thin edge, not
//      a wide shaded valley.
//   2. The two entrance/exit RAMPS (which must be walkable, so they need a
//      'smooth' blend) are short and, critically, roofed by the render
//      tunnel module (src/render/cave_tunnel.ts) for their entire descent,
//      not just the flat body: cave_tunnel.ts encloses every point whose
//      (already-edited) height drops meaningfully below the surface, which
//      covers the ramps too, so there is no open-air stretch anywhere along
//      the run, only a small mouth right where the ramp rejoins the surface.
export const GLIMMERVEIN_PASS_X = 110;
export const GLIMMERVEIN_TUNNEL_HALF_WIDTH = 12; // a thick subway-tunnel width (24yd across)
export const GLIMMERVEIN_FLOOR_Y = -22; // fixed absolute depth: genuinely below the surface
// The two short entrance/exit ramps: 'smooth' falloff so they are walkable
// (peak slope stays under the movement climb limit; see terrain_walls.test.ts),
// but small enough, and fully roofed, that they don't read as an open valley.
export const GLIMMERVEIN_RAMP_SOUTH_Z = 128;
export const GLIMMERVEIN_RAMP_NORTH_Z = 232;
// 30: gives the smooth blend's peak slope (steeper than the average, per
// smoothstep's derivative shape) a real margin under the movement climb
// limit (1.5 rise/run) rather than landing right at the edge of it.
const GLIMMERVEIN_RAMP_RADIUS = 30;
// The long flat body: dead-flat floor, sheer 'flat'-falloff walls, no slope.
// Its outer stamps (144 / 216) are deliberately close to the ramp CENTERS
// (128 / 232, only 2yd past where each ramp's own smooth blend has already
// saturated to within a fraction of a yard of the floor), not the ramps'
// outer radius: a 'flat' stamp snaps unconditionally to its exact delta
// wherever it applies, so if its own reach started further out, at a point
// where the ramp's blend hasn't finished (still meaningfully above the
// floor), the flat stamp would snap that point down to the floor in one
// step, an unwalkable cliff in the middle of what should be a continuous
// ramp. Starting the flat body right where the ramp is already saturated
// keeps that seam a fraction of a yard, not a cliff.
export const GLIMMERVEIN_BODY_ZS = [144, 156, 168, 180, 192, 204, 216] as const;

const GLIMMERVEIN_BODY_STAMPS: WorldContent['terrainEdits'] = GLIMMERVEIN_BODY_ZS.map((z) => ({
  x: GLIMMERVEIN_PASS_X,
  z,
  radius: GLIMMERVEIN_TUNNEL_HALF_WIDTH + 2,
  delta: GLIMMERVEIN_FLOOR_Y,
  falloff: 'flat',
  mode: 'level',
}));
const GLIMMERVEIN_RAMP_STAMPS: WorldContent['terrainEdits'] = [
  {
    x: GLIMMERVEIN_PASS_X,
    z: GLIMMERVEIN_RAMP_SOUTH_Z,
    radius: GLIMMERVEIN_RAMP_RADIUS,
    delta: GLIMMERVEIN_FLOOR_Y,
    falloff: 'smooth',
    mode: 'level',
  },
  {
    x: GLIMMERVEIN_PASS_X,
    z: GLIMMERVEIN_RAMP_NORTH_Z,
    radius: GLIMMERVEIN_RAMP_RADIUS,
    delta: GLIMMERVEIN_FLOOR_Y,
    falloff: 'smooth',
    mode: 'level',
  },
];
const GLIMMERVEIN_TERRAIN_EDITS: WorldContent['terrainEdits'] = [
  GLIMMERVEIN_RAMP_STAMPS[0],
  ...GLIMMERVEIN_BODY_STAMPS,
  GLIMMERVEIN_RAMP_STAMPS[1],
];

// Covers the tunnel's footprint (body + both ramps) so the 'cave'/rock ground
// tint and decoration mix switch over the whole run, not just the body.
const GLIMMERVEIN_CAVE_PAINT_COLS = 6;
const GLIMMERVEIN_CAVE_PAINT_ROWS = 15;
const GLIMMERVEIN_CAVE_PAINT: WorldContent['biomePaint'] = {
  cell: 10,
  cols: GLIMMERVEIN_CAVE_PAINT_COLS,
  rows: GLIMMERVEIN_CAVE_PAINT_ROWS,
  originX: GLIMMERVEIN_PASS_X - 30,
  originZ: 95,
  ids: new Array(GLIMMERVEIN_CAVE_PAINT_COLS * GLIMMERVEIN_CAVE_PAINT_ROWS).fill(6),
};

export const BUILTIN_WORLD: WorldContent = {
  zones: ZONES,
  camps: CAMPS,
  npcs: NPCS,
  groundObjects: GROUND_OBJECTS,
  roads: ROADS,
  props: PROPS,
  playerStart: PLAYER_START,
  // Glimmervein Cavern's floor: a fixed underground depth for the whole run
  // (see GLIMMERVEIN_TERRAIN_EDITS above); the walls come from the height
  // difference between this floor and the untouched surface either side.
  terrainEdits: GLIMMERVEIN_TERRAIN_EDITS,
  biomePaint: GLIMMERVEIN_CAVE_PAINT,
};

let activeWorld: WorldContent = BUILTIN_WORLD;

// The world content the terrain function and renderer should sample. Defaults to
// the built-in 3-zone world; the editor swaps it for a custom map during play-test.
export function getActiveWorldContent(): WorldContent {
  return activeWorld;
}

// Swap in a custom world (editor play-test) or restore the built-in (pass nothing).
// Affects terrain (world.ts), props (render/props.ts), and any consumer that reads
// through getActiveWorldContent. Spawns come from SimConfig.world too (sim.ts ctor).
export function setActiveWorldContent(world: WorldContent | null): void {
  activeWorld = world ?? BUILTIN_WORLD;
}

// Zone containing a world position (overworld only; clamps to the strip ends).
export function zoneAt(z: number): ZoneDef {
  for (const zone of ZONES) {
    if (z < zone.zMax) return zone;
  }
  return ZONES[ZONES.length - 1];
}

export function zoneWelcomeText(
  zone: ZoneDef,
  questState: (questId: string) => QuestState,
): string | null {
  if (zone.welcomeQuestId && questState(zone.welcomeQuestId) !== 'available') return null;
  return zone.welcome;
}

// Legacy single-zone exports (zone 1) — still referenced by tests and the
// starter-town logic.
export { DEEPFEN_SHALLOWS_LAKE, GRAVEYARD_POS, LAKE, TOWN_RADIUS };
export const ZONE_NAME = ZONE1_ZONE.name;

// ---------------------------------------------------------------------------
// Dungeons — private party instances at far-off flat origins (see
// world.groundHeight). Each dungeon gets its own x-band of instance origins;
// slots stack along z.
// ---------------------------------------------------------------------------

// Concurrent copies a single dungeon can host. Each slot is a cheap, empty
// InstanceSlot (no entities, no rng) pre-allocated in the Sim ctor and only
// populated when a party claims it, so a generous ceiling costs little memory
// and lets a busy realm keep many leveling groups in the same dungeon at once.
export const INSTANCE_SLOT_COUNT = 24;
export const DUNGEON_X_THRESHOLD = 600; // x beyond this = inside an instance
export const DUNGEON_FLOOR_Y = 0;

export function instanceOrigin(dungeonIndex: number, slot: number): { x: number; z: number } {
  return { x: 900 + dungeonIndex * 600, z: -1250 + slot * 500 };
}

export const DUNGEONS: Record<string, DungeonDef> = { ...DUNGEON_DEFS, ...TEMPLE_DUNGEON_DEFS };

export const DUNGEON_LIST: DungeonDef[] = Object.values(DUNGEONS).sort((a, b) => a.index - b.index);

export function dungeonByIndex(index: number): DungeonDef | null {
  return DUNGEON_LIST.find((d) => d.index === index) ?? null;
}

// Which dungeon a far-off instance position belongs to, by x-band.
export function dungeonAt(x: number): DungeonDef | null {
  if (x <= DUNGEON_X_THRESHOLD || x >= ARENA_X_MIN) return null;
  return dungeonByIndex(Math.round((x - 900) / 600));
}

// ---------------------------------------------------------------------------
// The Ashen Coliseum — 1v1 ranked arena. Its match instances live in their own
// far-off flat-ground x-band, well past the dungeon bands (index 0/1/2 sit at
// x 900/1500/2100). Like dungeons, x beyond DUNGEON_X_THRESHOLD means flat
// ground (world.groundHeight) and instance-local collision (sim/colliders.ts);
// the band split below keeps arena positions from being read as a dungeon.
// ---------------------------------------------------------------------------

export const ARENA_X = 4200; // arena instances share this x; slots stack along z
export const ARENA_X_MIN = ARENA_X; // x at/after this = an arena instance, not a dungeon
export const ARENA_SLOT_COUNT = 4; // concurrent 1v1 matches the world can host
const ARENA_Z0 = -1250;
const ARENA_SLOT_SPACING = 120; // > the pit footprint (~44yd) so slots never overlap

export function arenaOrigin(slot: number): { x: number; z: number } {
  return { x: ARENA_X, z: ARENA_Z0 + slot * ARENA_SLOT_SPACING };
}

export function isArenaPos(x: number): boolean {
  return x >= ARENA_X_MIN && x < DELVE_BAND_X_MIN;
}

// Nearest arena instance origin to a far-off position, matched by z-band (the
// x is shared across slots). Mirrors how the dungeon collider resolver maps a
// position back to its instance slot.
export function arenaOriginAt(z: number): { x: number; z: number; slot: number } {
  let best = 0,
    bestD = Infinity;
  for (let i = 0; i < ARENA_SLOT_COUNT; i++) {
    const d = Math.abs(z - arenaOrigin(i).z);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  const o = arenaOrigin(best);
  return { x: o.x, z: o.z, slot: best };
}

// Legacy aliases for the Hollow Crypt (tests + scripts reference these).
export const CRYPT_DOOR_POS = DUNGEONS.hollow_crypt.doorPos;
export const CRYPT_ENTRY = DUNGEONS.hollow_crypt.entry;
export const CRYPT_EXIT_OFFSET = DUNGEONS.hollow_crypt.exitOffset;
export const CRYPT_SPAWNS = DUNGEONS.hollow_crypt.spawns;

// ---------------------------------------------------------------------------
// Delves, private party instances past the arena x-band (see docs/prd/delves.md).
// DELVE_X_MIN must stay above ARENA_X_MIN (4000) and ARENA_X (4200).
// ---------------------------------------------------------------------------

// 4800 sits clear of the v0.10.0 layout: dungeons end at ARENA_X_MIN (4000) and
// the arena pit is centred at ARENA_X (4200, ~±22u footprint). The delve band's
// west edge (DELVE_BAND_X_MIN = 4773) leaves a comfortable margin past the arena.
export const DELVE_X_MIN = 4800;
// Each delve room is centred at DELVE_X_MIN + index*600. Delve modules use wider
// side walls than the base crypt kit: the side-wall centre is at instance-local
// |x| = DELVE_WALL_X (25, mirror of delve_layout.ts WALL_X) and the collider's
// outer face sits 1u beyond that (|x| = 26), i.e. world-x = DELVE_X_MIN - 26 =
// 4774 for slot 0. We set the band edge 1u further west again (4773) so
// isDelvePos covers the ENTIRE room footprint, including the west wall face,
// and the west half is never misclassified as arena. Still >500u clear of ARENA_X.
const DELVE_WALL_X = 25; // mirror of delve_layout.ts WALL_X (delve side-wall centre)
export const DELVE_BAND_X_MIN = DELVE_X_MIN - (DELVE_WALL_X + DUNGEON_WALL_HW + 1);
// Concurrent copies a single delve can host (mirrors INSTANCE_SLOT_COUNT).
export const DELVE_SLOT_COUNT = 24;
export const DELVE_MODULE_GAP = 16;
export const DELVE_MODULE_Z_START = 8;
const DELVE_Z0 = -1250;
const DELVE_SLOT_SPACING = 620; // covers 110u×4 rooms + 16u×3 gaps + 40u margin ≈ 536u

export function delveOrigin(delveIndex: number, slot: number): { x: number; z: number } {
  return { x: DELVE_X_MIN + delveIndex * 600, z: DELVE_Z0 + slot * DELVE_SLOT_SPACING };
}

export function isDelvePos(x: number): boolean {
  return x >= DELVE_BAND_X_MIN;
}

export function delveAt(x: number): DelveDef | null {
  if (!isDelvePos(x)) return null;
  const index = Math.round((x - DELVE_X_MIN) / 600);
  return DELVE_LIST.find((d) => d.index === index) ?? null;
}

export const DELVES: Record<string, DelveDef> = {
  [COLLAPSED_RELIQUARY_DELVE.id]: COLLAPSED_RELIQUARY_DELVE,
  [DROWNED_LITANY_DELVE.id]: DROWNED_LITANY_DELVE,
};
export const DELVE_LIST: DelveDef[] = Object.values(DELVES).sort((a, b) => a.index - b.index);
export const DELVE_MODULES: Record<string, DelveModuleDef> = {
  ...COLLAPSED_RELIQUARY_MODULES,
  ...DROWNED_LITANY_MODULES,
};

function delveModuleFootprint(moduleId: string): number {
  const mod = DELVE_MODULES[moduleId];
  const layoutId = (mod?.layout ?? moduleId) as DelveModuleId;
  if (DELVE_MODULE_LAYOUTS[layoutId]) return delveModuleSpan(layoutId);
  return mod?.length ?? 50;
}

/** World-z offset of a delve module within its instance slot (matches Sim). */
export function delveModuleZOffset(modules: readonly string[], moduleIndex: number): number {
  let z = DELVE_MODULE_Z_START;
  for (let i = 0; i < moduleIndex; i++) {
    z += delveModuleFootprint(modules[i]) + DELVE_MODULE_GAP;
  }
  return z;
}

/** Relative-z extent of a full module chain from the slot door (matches renderer gate). */
export function delveModuleStackEndRelZ(modules: readonly string[], margin = 40): number {
  if (modules.length === 0) return DELVE_MODULE_Z_START + 80 + margin;
  const lastId = modules[modules.length - 1];
  const layoutId = (DELVE_MODULES[lastId]?.layout ?? lastId) as DelveModuleId;
  const layout = DELVE_MODULE_LAYOUTS[layoutId];
  return delveModuleZOffset(modules, modules.length - 1) + (layout?.zMax ?? 91) + margin;
}

/** Pick the instance slot whose stacked module band contains world-z. */
export function delveSlotAt(delveIndex: number, z: number, modules: readonly string[]): number {
  const mods = modules.length > 0 ? modules : ['reliquary_sunken_ossuary'];
  const stackEnd = delveModuleStackEndRelZ(mods);
  const zMin = DELVE_MODULE_Z_START - 30;
  for (let i = 0; i < DELVE_SLOT_COUNT; i++) {
    const o = delveOrigin(delveIndex, i);
    const relZ = z - o.z;
    if (relZ >= zMin && relZ <= stackEnd) return i;
  }
  let best = 0;
  let bestD = Infinity;
  for (let i = 0; i < DELVE_SLOT_COUNT; i++) {
    const o = delveOrigin(delveIndex, i);
    const d = Math.abs(z - o.z);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}

// Memoized: the default chain is a pure function of the static DELVES table, and
// callers (collision/camera fallback) hit it per-frame inside the delve band, so
// cache one frozen array per delve id instead of reallocating each call.
const DEFAULT_DELVE_MODULES = new Map<string, readonly string[]>();

/** Default module chain for a delve when no active run is available. */
export function defaultDelveModules(delveId: string): readonly string[] {
  const cached = DEFAULT_DELVE_MODULES.get(delveId);
  if (cached) return cached;
  const delve = DELVES[delveId];
  const chain = delve
    ? Object.freeze([
        ...delve.modules.slice(0, delve.moduleCount[0] ?? delve.modules.length),
        delve.finaleModuleId,
      ])
    : Object.freeze(['reliquary_sunken_ossuary']);
  DEFAULT_DELVE_MODULES.set(delveId, chain);
  return chain;
}

/** Map world position to the active delve module band (instance-local coords). */
export function delveModuleLocal(
  x: number,
  z: number,
  modules: readonly string[],
): {
  ox: number;
  oz: number;
  moduleIndex: number;
  moduleId: string;
  localX: number;
  localZ: number;
} {
  const delve = delveAt(x);
  const index = delve?.index ?? Math.round((x - DELVE_X_MIN) / 600);
  const mods =
    modules.length > 0
      ? modules
      : delve
        ? defaultDelveModules(delve.id)
        : ['reliquary_sunken_ossuary'];
  const slot = delveOrigin(index, delveSlotAt(index, z, mods));
  const ox = slot.x;
  const slotOz = slot.z;
  const relZ = z - slotOz;
  let zCursor = DELVE_MODULE_Z_START;
  for (let i = 0; i < mods.length; i++) {
    const len = delveModuleFootprint(mods[i]);
    if (relZ < zCursor + len || i === mods.length - 1) {
      return {
        ox,
        oz: slotOz + zCursor,
        moduleIndex: i,
        moduleId: mods[i],
        localX: x - ox,
        localZ: relZ - zCursor,
      };
    }
    zCursor += len + DELVE_MODULE_GAP;
  }
  const last = mods[mods.length - 1];
  return {
    ox,
    oz: slotOz + zCursor,
    moduleIndex: mods.length - 1,
    moduleId: last,
    localX: x - ox,
    localZ: relZ - zCursor,
  };
}
