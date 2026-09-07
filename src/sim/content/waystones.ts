// Waystones: one attunable stone per zone hub, kept by a Waystone Keeper, and
// the instant teleport between any two stones a character has attuned. Data
// only; the teleport itself lives in src/sim/waystones.ts, the fee math in
// src/sim/waystone_fee.ts and the free-use tickets in src/sim/waystone_tickets.ts.
//
// The design (maintainer direction on PR #3932): teleport-style fast travel
// rather than a hands-off ride. A hop is INSTANT and priced as a gold sink,
// by straight-line distance and well above a classic flight fare, so a mount
// stays the free option and the stone the paid shortcut. Waystone Tickets
// (earned from the daily dungeon queue, WAYSTONE_TICKETS_PER_FINDER_CLEAR per
// first finder clear of the day) pay for one hop instead of gold, and a
// guild's tier (src/sim/guild_tier.ts) unlocks a percentage off the fee.
//
// Every keeper spawns on a RESERVED entity id (WAYSTONE_KEEPER_ENTITY_ID_BASE
// plus its WAYSTONES index) from src/sim/waystones.ts, so adding one here
// never shifts a sequential entity id or a parity golden (the FURY precedent,
// STATIC_WORLD_SERVICE_ENTITY_ID_MIN in types.ts). Append new stones at the
// END: the index is the id. Stone ids are persisted in
// CharacterState.waystonesAttuned, so they follow the never-rename rule.

import type { ItemDef, NpcDef } from '../types';

export interface WaystoneDef {
  /** Persisted stone id (never rename). */
  id: string;
  zoneId: string;
  /** The hub town this stone serves (map label source). */
  town: string;
  /** The keeper's NPC content key (NPCS). */
  npcId: string;
  /** Keeper stand and teleport landing point. */
  x: number;
  z: number;
}

/** The floor of any hop fee, in copper (20 silver). */
export const WAYSTONE_FEE_MIN_COPPER = 2_000;

/** Fee per started 100 yards of straight-line distance, in copper (10 silver).
 *  A cross-map hop (about 2,000 yards) therefore costs about 2 gold. */
export const WAYSTONE_FEE_PER_100YD_COPPER = 1_000;

/** Percent off the hop fee per guild tier (index = tier, src/sim/guild_tier.ts).
 *  Tier 0 (a fresh guild, or no guild) pays full price. */
export const WAYSTONE_GUILD_DISCOUNT_PCT: readonly number[] = [0, 10, 20, 30, 40];

/** Waystone Ticket: pays one hop instead of gold. */
export const WAYSTONE_TICKET_ITEM_ID = 'waystone_ticket';

/** Tickets granted on the first dungeon cleared through the Dungeon Finder
 *  queue each realm day. */
export const WAYSTONE_TICKETS_PER_FINDER_CLEAR = 3;

/** Reserved entity id of the first keeper; stone index N takes BASE + N. */
export const WAYSTONE_KEEPER_ENTITY_ID_BASE = 1_000_000_020;

export const WAYSTONES: readonly WaystoneDef[] = [
  {
    id: 'eastbrook',
    zoneId: 'eastbrook_vale',
    town: 'Eastbrook',
    npcId: 'waystone_keeper_eastbrook',
    x: -30,
    z: -112,
  },
  {
    id: 'fenbridge',
    zoneId: 'mirefen_marsh',
    town: 'Fenbridge',
    npcId: 'waystone_keeper_fenbridge',
    x: 14,
    z: 286,
  },
  {
    id: 'highwatch',
    zoneId: 'thornpeak_heights',
    town: 'Highwatch',
    npcId: 'waystone_keeper_highwatch',
    x: 12,
    z: 672,
  },
  {
    id: 'eldergleam',
    zoneId: 'veiled_hollow',
    town: 'Eldergleam',
    npcId: 'waystone_keeper_eldergleam',
    x: -22,
    z: 1044,
  },
  {
    id: 'wyrmwatch',
    zoneId: 'drakelands',
    town: 'Wyrmwatch',
    npcId: 'waystone_keeper_wyrmwatch',
    x: 418,
    z: 1912,
  },
  {
    id: 'icemantle',
    zoneId: 'frostveil',
    town: 'Icemantle',
    npcId: 'waystone_keeper_icemantle',
    x: -16,
    z: 1572,
  },
  {
    id: 'lanternmere',
    zoneId: 'amberfall',
    town: 'Lanternmere',
    npcId: 'waystone_keeper_lanternmere',
    x: -346,
    z: 2086,
  },
  {
    id: 'bridgemere',
    zoneId: 'willowfen',
    town: 'Bridgemere',
    npcId: 'waystone_keeper_bridgemere',
    x: -348,
    z: 374,
  },
  {
    id: 'moonrest',
    zoneId: 'nightbloom',
    town: 'Moonrest',
    npcId: 'waystone_keeper_moonrest',
    x: -358,
    z: 1432,
  },
  {
    id: 'gallowmere',
    zoneId: 'wraithwood',
    town: 'Gallowmere',
    npcId: 'waystone_keeper_gallowmere',
    x: 370,
    z: 1440,
  },
  {
    id: 'drifthaven',
    zoneId: 'palmreach',
    town: 'Drifthaven',
    npcId: 'waystone_keeper_drifthaven',
    x: -290,
    z: 830,
  },
  {
    id: 'hedgewick',
    zoneId: 'evergarden',
    town: 'Hedgewick',
    npcId: 'waystone_keeper_hedgewick',
    x: 330,
    z: 820,
  },
  {
    id: 'wickharbor',
    zoneId: 'galecrest',
    town: 'Wickharbor',
    npcId: 'waystone_keeper_wickharbor',
    x: 430,
    z: 370,
  },
  {
    id: 'gullhaven',
    zoneId: 'farshore_isle',
    town: 'Gullhaven',
    npcId: 'waystone_keeper_gullhaven',
    x: 314,
    z: 80,
  },
];

export function waystoneById(id: string): WaystoneDef | undefined {
  return WAYSTONES.find((stone) => stone.id === id);
}

export function waystoneByNpcId(npcId: string): WaystoneDef | undefined {
  return WAYSTONES.find((stone) => stone.npcId === npcId);
}

/** Reserved entity id of a stone's keeper. */
export function waystoneKeeperEntityId(stoneId: string): number | null {
  const index = WAYSTONES.findIndex((stone) => stone.id === stoneId);
  return index < 0 ? null : WAYSTONE_KEEPER_ENTITY_ID_BASE + index;
}

export const WAYSTONE_ITEMS: Record<string, ItemDef> = {
  [WAYSTONE_TICKET_ITEM_ID]: {
    id: WAYSTONE_TICKET_ITEM_ID,
    name: 'Waystone Ticket',
    kind: 'tool',
    quality: 'uncommon',
    // Currency-like (the Heroic Mark shape): tickets stack, are bound to the
    // earner and cannot be destroyed, so the daily grant is never lost or sold.
    stackSize: 20,
    sellValue: 0,
    soulbound: true,
    noDiscard: true,
  },
};

const KEEPER_NAMES: Record<string, { name: string; greeting: string }> = {
  eastbrook: {
    name: 'Wren Hollis',
    greeting: 'The stone hums for you, $C. Touch it once and it will always know your name.',
  },
  fenbridge: {
    name: 'Odo Marshwick',
    greeting: 'Mind the moss on the stone. Name a town and you will be standing in it.',
  },
  highwatch: {
    name: 'Bram Thistlecrag',
    greeting: 'Thin air, quick roads. The stone remembers every peak you have touched.',
  },
  eldergleam: {
    name: 'Sylvane Duskwarden',
    greeting: 'The Hollow keeps its stone under the boughs. Choose where you would rather be.',
  },
  wyrmwatch: {
    name: 'Karsk Emberhide',
    greeting: 'Even the wyrms leave the stone alone. Where does the keep send you?',
  },
  icemantle: {
    name: 'Hilde Frostmantle',
    greeting: 'The stone is warm to the touch, the only warm thing on the glacier. Where to?',
  },
  lanternmere: {
    name: 'Fennick Ambergale',
    greeting: 'The lanterns are lit around the stone tonight. Pick a destination.',
  },
  bridgemere: {
    name: 'Tamsin Reedwright',
    greeting: 'From the bridge stone to any stone you know. Where to, $C?',
  },
  moonrest: {
    name: 'Elowen Nightsong',
    greeting: 'The moths circle the stone at dusk. Say where and you are there.',
  },
  gallowmere: {
    name: 'Corvin Gravesend',
    greeting: 'Nothing haunts this stone. Yet. Name your town.',
  },
  drifthaven: {
    name: 'Nia Saltwind',
    greeting: 'Salt has not dulled the stone one bit. Where are you bound?',
  },
  hedgewick: {
    name: 'Pip Greenbower',
    greeting: 'The stone sits between the hedges and the orchards. Where shall it be?',
  },
  wickharbor: {
    name: 'Marlo Galeson',
    greeting: 'The harbor stone is steady whatever the wind does. Choose a landing.',
  },
  gullhaven: {
    name: 'Sabine Gullwing',
    greeting: 'The gulls roost on the stone. The stone does not mind. Where to?',
  },
};

/** The keeper NPC defs, one per stone, all `dynamic` (reserved-id spawn). */
export const WAYSTONE_KEEPER_NPCS: Record<string, NpcDef> = Object.fromEntries(
  WAYSTONES.map((stone) => {
    const persona = KEEPER_NAMES[stone.id];
    const def: NpcDef = {
      id: stone.npcId,
      name: persona.name,
      title: 'Waystone Keeper',
      pos: { x: stone.x, z: stone.z },
      facing: 0,
      color: 0x6d8fb3,
      questIds: [],
      waystoneKeeper: true,
      dynamic: true,
      greeting: persona.greeting,
    };
    return [stone.npcId, def];
  }),
);
