// Flight paths: one flightmaster per zone hub, and the town-to-town links a
// flight may ride. Data only; the ride itself lives in src/sim/flight_paths.ts.
//
// A flight is a slow, hands-off ride along the hub graph (FLIGHT_LINKS), so a
// mount stays the FAST option and the flight the AFK one: FLIGHT_SPEED is a
// fixed fraction of the base riding speed. Fares are charged per town hop.
//
// Every flightmaster spawns on a RESERVED entity id (FLIGHTMASTER_ENTITY_ID_BASE
// plus its FLIGHT_NODES index) from src/sim/flight_paths.ts, so adding one here
// never shifts a sequential entity id or a parity golden (the FURY precedent,
// STATIC_WORLD_SERVICE_ENTITY_ID_MIN in types.ts). Append new nodes at the END:
// the index is the id. Node ids are persisted in CharacterState.flightNodesKnown,
// so they follow the never-rename rule.

import type { NpcDef } from '../types';
import { RUN_SPEED } from '../types';

export interface FlightNodeDef {
  /** Persisted node id (never rename). */
  id: string;
  zoneId: string;
  /** The hub town this flightmaster serves (map label source). */
  town: string;
  /** The flightmaster's NPC content key (NPCS). */
  npcId: string;
  /** Flightmaster stand and flight landing point. */
  x: number;
  z: number;
}

/** Fare per town hop, in copper (5 silver). */
export const FLIGHT_FARE_COPPER = 500;

/** Flight ground speed: 70% of the base (+60%) riding speed, in yards/second. */
export const FLIGHT_SPEED = RUN_SPEED * 1.6 * 0.7;

/** Height above the sampled ground the rider is carried at. */
export const FLIGHT_HEIGHT = 14;

/** Reserved entity id of the first flightmaster; node index N takes BASE + N. */
export const FLIGHTMASTER_ENTITY_ID_BASE = 1_000_000_020;

export const FLIGHT_NODES: readonly FlightNodeDef[] = [
  { id: 'eastbrook', zoneId: 'eastbrook_vale', town: 'Eastbrook', npcId: 'flightmaster_eastbrook', x: -30, z: -112 },
  { id: 'fenbridge', zoneId: 'mirefen_marsh', town: 'Fenbridge', npcId: 'flightmaster_fenbridge', x: 14, z: 286 },
  { id: 'highwatch', zoneId: 'thornpeak_heights', town: 'Highwatch', npcId: 'flightmaster_highwatch', x: 12, z: 672 },
  { id: 'eldergleam', zoneId: 'veiled_hollow', town: 'Eldergleam', npcId: 'flightmaster_eldergleam', x: -22, z: 1044 },
  { id: 'wyrmwatch', zoneId: 'drakelands', town: 'Wyrmwatch', npcId: 'flightmaster_wyrmwatch', x: 418, z: 1912 },
  { id: 'icemantle', zoneId: 'frostveil', town: 'Icemantle', npcId: 'flightmaster_icemantle', x: -16, z: 1572 },
  { id: 'lanternmere', zoneId: 'amberfall', town: 'Lanternmere', npcId: 'flightmaster_lanternmere', x: -346, z: 2086 },
  { id: 'bridgemere', zoneId: 'willowfen', town: 'Bridgemere', npcId: 'flightmaster_bridgemere', x: -348, z: 374 },
  { id: 'moonrest', zoneId: 'nightbloom', town: 'Moonrest', npcId: 'flightmaster_moonrest', x: -358, z: 1432 },
  { id: 'gallowmere', zoneId: 'wraithwood', town: 'Gallowmere', npcId: 'flightmaster_gallowmere', x: 370, z: 1440 },
  { id: 'drifthaven', zoneId: 'palmreach', town: 'Drifthaven', npcId: 'flightmaster_drifthaven', x: -290, z: 830 },
  { id: 'hedgewick', zoneId: 'evergarden', town: 'Hedgewick', npcId: 'flightmaster_hedgewick', x: 330, z: 820 },
  { id: 'wickharbor', zoneId: 'galecrest', town: 'Wickharbor', npcId: 'flightmaster_wickharbor', x: 430, z: 370 },
  { id: 'gullhaven', zoneId: 'farshore_isle', town: 'Gullhaven', npcId: 'flightmaster_gullhaven', x: 314, z: 80 },
];

/** Undirected town-to-town links; a fare counts one hop per link flown. */
export const FLIGHT_LINKS: readonly (readonly [string, string])[] = [
  ['eastbrook', 'fenbridge'],
  ['eastbrook', 'gullhaven'],
  ['fenbridge', 'highwatch'],
  ['fenbridge', 'bridgemere'],
  ['fenbridge', 'wickharbor'],
  ['highwatch', 'eldergleam'],
  ['highwatch', 'drifthaven'],
  ['highwatch', 'hedgewick'],
  ['eldergleam', 'icemantle'],
  ['eldergleam', 'moonrest'],
  ['eldergleam', 'gallowmere'],
  ['icemantle', 'lanternmere'],
  ['icemantle', 'wyrmwatch'],
  ['moonrest', 'lanternmere'],
  ['gallowmere', 'wyrmwatch'],
  ['bridgemere', 'drifthaven'],
  ['drifthaven', 'moonrest'],
  ['wickharbor', 'hedgewick'],
  ['hedgewick', 'gallowmere'],
];

export function flightNodeById(id: string): FlightNodeDef | undefined {
  return FLIGHT_NODES.find((node) => node.id === id);
}

export function flightNodeByNpcId(npcId: string): FlightNodeDef | undefined {
  return FLIGHT_NODES.find((node) => node.npcId === npcId);
}

/** Reserved entity id of a node's flightmaster. */
export function flightmasterEntityId(nodeId: string): number | null {
  const index = FLIGHT_NODES.findIndex((node) => node.id === nodeId);
  return index < 0 ? null : FLIGHTMASTER_ENTITY_ID_BASE + index;
}

const FLIGHTMASTER_NAMES: Record<string, { name: string; greeting: string }> = {
  eastbrook: { name: 'Wren Hollis', greeting: 'The gryphons are rested and the sky is clear, $C. Where to?' },
  fenbridge: { name: 'Odo Marshwick', greeting: 'Mind the reeds on the way up. Name a town and we will get you there.' },
  highwatch: { name: 'Bram Thistlecrag', greeting: 'Thin air, long views. The birds know every pass in these peaks.' },
  eldergleam: { name: 'Sylvane Duskwarden', greeting: 'The Hollow is kinder from above. Choose your landing.' },
  wyrmwatch: { name: 'Karsk Emberhide', greeting: 'Even the wyrms give my birds a wide berth. Where does the keep send you?' },
  icemantle: { name: 'Hilde Frostmantle', greeting: 'Bundle up. The wind over the glacier bites, but the ride is quick.' },
  lanternmere: { name: 'Fennick Ambergale', greeting: 'The lanterns are lit for the night flights. Pick a destination.' },
  bridgemere: { name: 'Tamsin Reedwright', greeting: 'From the bridge to anywhere the fens allow. Where to, $C?' },
  moonrest: { name: 'Elowen Nightsong', greeting: 'The moths guide the night birds home. Say where and we fly.' },
  gallowmere: { name: 'Corvin Gravesend', greeting: 'Nothing haunts the sky here. Yet. Name your town.' },
  drifthaven: { name: 'Nia Saltwind', greeting: 'Warm air off the shallows lifts a bird nicely. Where are you bound?' },
  hedgewick: { name: 'Pip Greenbower', greeting: 'Over the hedges and past the orchards. Where shall it be?' },
  wickharbor: { name: 'Marlo Galeson', greeting: 'The harbor winds are steady today. Choose a landing.' },
  gullhaven: { name: 'Sabine Gullwing', greeting: 'The gulls hate my birds. The birds do not care. Where to?' },
};

/** The flightmaster NPC defs, one per node, all `dynamic` (reserved-id spawn). */
export const FLIGHTMASTER_NPCS: Record<string, NpcDef> = Object.fromEntries(
  FLIGHT_NODES.map((node) => {
    const persona = FLIGHTMASTER_NAMES[node.id];
    const def: NpcDef = {
      id: node.npcId,
      name: persona.name,
      title: 'Flightmaster',
      pos: { x: node.x, z: node.z },
      facing: 0,
      color: 0x6d8fb3,
      questIds: [],
      flightmaster: true,
      dynamic: true,
      greeting: persona.greeting,
    };
    return [node.npcId, def];
  }),
);
