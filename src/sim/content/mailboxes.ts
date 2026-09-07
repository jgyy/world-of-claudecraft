// Ravenpost perch placements: one mailbox per town, a few strides from each
// hub fire so it reads as town furniture. The Sim ctor spawns one interactable
// `kind:'object'` entity (templateId 'mailbox') per entry; the renderer draws
// the raven-pillar prop for that template. Positions are nudged by findSafePos
// at spawn, so a collision with a building resolves to the nearest open spot.

import { EASTBROOK_LAYOUT } from '../eastbrook_layout';
import { FENBRIDGE_LAYOUT } from '../fenbridge_layout';
import type { MailboxDef } from '../types';
import { AMBERFALL_ZONE } from './amberfall';
import { DRAKELANDS_ZONE } from './drakelands';
import { EVERGARDEN_ZONE } from './evergarden';
import { FARSHORE_ZONE } from './farshore';
import { FROSTVEIL_ZONE } from './frostveil';
import { GALECREST_ZONE } from './galecrest';
import { NIGHTBLOOM_ZONE } from './nightbloom';
import { PALMREACH_ZONE } from './palmreach';
import { PROVING_SHORE_ZONE } from './proving_shore';
import { REALM_ZONE } from './realm';
import { WILLOWFEN_ZONE } from './willowfen';
import { WRAITHWOOD_ZONE } from './wraithwood';

export type { MailboxDef } from '../types';

/** The Last Keep's Ravenpost pillar: a reserved static-service entity id
 *  (types.ts STATIC_WORLD_SERVICE_ENTITY_ID_MIN band), clear of the
 *  append-only noticeboard band (content/noticeboards.ts, 2_000_000_001
 *  upward) and the Realm Builder monument (2_000_000_100). Lives in this
 *  content leaf, not in src/sim/last_keep_garrison.ts, so the table never
 *  imports a sim module back through data.ts (a cycle that left
 *  BUILTIN_WORLD.services.mailboxes undefined under a table-first import). */
export const LAST_KEEP_MAILBOX_ENTITY_ID = 2_000_000_110;

function hubMailbox(
  zone: { hub: { x: number; z: number } },
  offset: { x: number; z: number },
): MailboxDef {
  return { x: zone.hub.x + offset.x, z: zone.hub.z + offset.z };
}

export const MAILBOXES: MailboxDef[] = [
  { ...EASTBROOK_LAYOUT.services.mailbox.position },
  { ...FENBRIDGE_LAYOUT.services.mailbox.position },
  { x: 6, z: 654 }, // Highwatch, beside the gate path
  hubMailbox(REALM_ZONE, { x: 7, z: -5 }), // Eldergleam, south of the great tree
  hubMailbox(DRAKELANDS_ZONE, { x: -7, z: 5 }), // Wyrmwatch, inside the gate lawn
  hubMailbox(FROSTVEIL_ZONE, { x: 7, z: -5 }), // Icemantle, at the pass-side square
  hubMailbox(AMBERFALL_ZONE, { x: 7, z: -5 }), // Lanternmere, by the ferry market
  hubMailbox(WILLOWFEN_ZONE, { x: 6, z: -6 }), // Bridgemere, near the island square
  hubMailbox(NIGHTBLOOM_ZONE, { x: 6, z: -5 }), // Moonrest, beside the hollow path
  hubMailbox(WRAITHWOOD_ZONE, { x: -6, z: 6 }), // Gallowmere, under the eaves
  hubMailbox(PALMREACH_ZONE, { x: 6, z: -5 }), // Drifthaven, at the reef road
  hubMailbox(EVERGARDEN_ZONE, { x: -6, z: 6 }), // Hedgewick, facing the parterre
  hubMailbox(GALECREST_ZONE, { x: 7, z: -5 }), // Wickharbor, beside the harbor square
  hubMailbox(FARSHORE_ZONE, { x: -6, z: 6 }), // Gullhaven, inside the redoubt
  // Dawnrest Camp, up the camp's north edge. Requested at (-306, 60), moved
  // 4 yards south: the camp's shoreline runs diagonally and (-306, 60) sits
  // below the waterline (ground -4.02 against WATER_LEVEL -4.3), which would
  // have put the Ravenpost perch in the shallows. Turned a half circle from
  // the pillars' default yaw so the slot faces the muster ground.
  { ...hubMailbox(PROVING_SHORE_ZONE, { x: -6, z: 6 }), facing: Math.PI },
  // The Last Keep (the Drakelands' second town, src/sim/castle_layout.ts):
  // east of the courtyard well, on the lane between the well and the tavern,
  // slot turned to face the well and the market row. Carries a reserved id so
  // the keep's owning module (src/sim/last_keep_garrison.ts) stands it up
  // after the sequential loops: appended here, a sequential pillar would have
  // renumbered every dungeon door and instance slot behind it.
  { x: 414, z: 2034, facing: -Math.PI / 2, entityId: LAST_KEEP_MAILBOX_ENTITY_ID },
];
