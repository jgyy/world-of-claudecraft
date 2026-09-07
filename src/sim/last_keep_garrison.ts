// The Last Keep garrison and town services: the townsfolk who bring the
// rebuilt castle's bailey to life (content/drakelands.ts DRAKELANDS_NPCS, the
// `dynamic: true` records: the waystone warden by the Wyrmgate arch, the
// sutler at the market row, the sergeant by the well, the chaplain at the
// chapel, and the three services that make the keep a town: the paymaster's
// strongroom (a banker), the World Market auctioneer, and the keep armorer),
// plus the Ravenpost mailbox by the well (content/mailboxes.ts, the record
// carrying a reserved `entityId`). They spawn from here, AFTER the rng-driven
// roster, on RESERVED ids (types.ts, the FURY precedent for the NPC band and
// the noticeboard precedent for the static-service band): the generic
// world-init loops allocate ids by iterating the merged tables, so a plain
// insertion there would shift the id of every camp mob, object, and dungeon
// door created after it, which the parity goldens pin per frame. createNpc
// and the mailbox builder draw no rng, so this pass is determinism-neutral
// wherever the ctor calls it.
//
// The service registries (bank.ts nearBanker over bankerIds, market.ts over
// merchantIds, post_office.ts nearMailbox over mailboxIds) are the SAME live
// arrays the ctor loops feed, passed in as sinks, so a reserved-id banker is
// a place to bank exactly like a sequential one.
//
// Keyed on the world's own tables so a custom map without these records
// stands nobody up. `src/sim`-pure.

import { LAST_KEEP_MAILBOX_ENTITY_ID } from './content/mailboxes';
import { createNpc } from './entity';
import { createMailboxEntity } from './mail/mailbox_entity';
import type { SimContext } from './sim_context';
import type { MailboxDef, NpcDef } from './types';

export { LAST_KEEP_MAILBOX_ENTITY_ID };

export const LAST_KEEP_GARRISON_NPC_IDS = [
  'waystone_warden_ilse',
  'provisioner_dunmore',
  'sergeant_varga',
  'chaplain_ondrey',
  // the town services (append only: the slot is the id)
  'paymaster_edda_thorne',
  'auctioneer_bram_kestrel',
  'armorer_tam_rusk',
] as const;
export type LastKeepGarrisonNpcId = (typeof LAST_KEEP_GARRISON_NPC_IDS)[number];

/** First reserved entity id; the roster takes consecutive slots from it. */
export const LAST_KEEP_GARRISON_ENTITY_ID_BASE = 1_000_000_010;

export function lastKeepGarrisonEntityId(npcId: LastKeepGarrisonNpcId): number {
  return LAST_KEEP_GARRISON_ENTITY_ID_BASE + LAST_KEEP_GARRISON_NPC_IDS.indexOf(npcId);
}

/** The live service registries the Sim ctor loops also feed. */
export interface LastKeepServiceSinks {
  bankerIds: number[];
  merchantIds: number[];
  mailboxIds: number[];
}

/** Stand the garrison, the services, and the mailbox up. Throws on a taken
 *  reserved id: two static services claiming one slot is a content bug, never
 *  something a player can cause. */
export function spawnLastKeepGarrison(
  ctx: Pick<SimContext, 'entities' | 'addEntity' | 'groundPos'>,
  npcs: Readonly<Record<string, NpcDef>>,
  sinks: LastKeepServiceSinks,
  mailboxes: readonly MailboxDef[],
): void {
  for (const npcId of LAST_KEEP_GARRISON_NPC_IDS) {
    const def = npcs[npcId];
    if (!def) continue;
    const id = lastKeepGarrisonEntityId(npcId);
    if (ctx.entities.has(id)) throw new Error(`Duplicate static service entity id: ${id}`);
    const npc = createNpc(id, def, ctx.groundPos(def.pos.x, def.pos.z));
    ctx.addEntity(npc);
    if (def.banker) sinks.bankerIds.push(npc.id);
    if (def.market) sinks.merchantIds.push(npc.id);
  }
  // Every reserved-id pillar the ctor's sequential loop skipped is claimed
  // HERE (the keep's today; the same contract for any town that follows), so
  // a record with an entityId can never end up as a solid, mapped pillar
  // with no entity behind it.
  for (const def of mailboxes) {
    if (def.entityId === undefined) continue;
    if (ctx.entities.has(def.entityId))
      throw new Error(`Duplicate static service entity id: ${def.entityId}`);
    const box = createMailboxEntity(def.entityId, def, ctx.groundPos(def.x, def.z));
    ctx.addEntity(box);
    sinks.mailboxIds.push(box.id);
  }
}
