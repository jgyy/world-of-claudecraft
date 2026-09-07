// Waystone Tickets: the free-use grant for running the daily dungeon queue.
//
// A ticket pays one waystone hop instead of gold (src/sim/waystones.ts). The
// grant is deliberately narrow: a group the Dungeon Finder ASSEMBLED
// (social/dungeon_finder.ts completeProposal stamps every member with the
// activity's dungeon id) that then kills that dungeon's final boss pays every
// credited participant WAYSTONE_TICKETS_PER_FINDER_CLEAR tickets, once per
// realm day (ctx.resetDay, the delve/heroic daily boundary). A premade that
// walks in through the door earns none: the tickets reward filling the queue,
// not the clear itself. Other events can call grantWaystoneTickets directly;
// it is the ONE seam every ticket source goes through. Draws no rng.

import { HEROIC_DUNGEON_TUNING } from './content/dungeon_difficulty';
import { WAYSTONE_TICKET_ITEM_ID, WAYSTONE_TICKETS_PER_FINDER_CLEAR } from './content/waystones';
import type { PlayerMeta } from './sim';
import type { SimContext } from './sim_context';
import type { Entity } from './types';

/** Grant `count` tickets to `meta`, with the ordinary loot line and cue. */
export function grantWaystoneTickets(ctx: SimContext, meta: PlayerMeta, count: number): void {
  if (count <= 0) return;
  ctx.addItem(WAYSTONE_TICKET_ITEM_ID, count, meta.entityId);
}

/** Remember that the finder formed this player's group for `dungeonId`; the
 *  stamp is transient (never persisted) and cleared once it pays. */
export function markFinderRun(meta: PlayerMeta, dungeonId: string): void {
  meta.finderRunDungeonId = dungeonId;
}

/** True when this kill is the daily finder clear for `meta`: the finder sent
 *  them to this dungeon and no clear has paid yet today. Pure over the meta. */
export function finderClearEarnsTickets(
  meta: Pick<PlayerMeta, 'finderRunDungeonId' | 'waystoneTicketDay'>,
  dungeonId: string,
  resetDay: string,
): boolean {
  if (meta.finderRunDungeonId !== dungeonId) return false;
  // A fresh character (null) always earns; afterwards only a NEW realm day
  // does. An unknown day ('' on a host without a daily boundary) therefore
  // pays exactly once, so a same-seed replay stays reproducible.
  return meta.waystoneTicketDay !== resetDay;
}

/**
 * The boss-kill hook (called beside awardHeroicMarks from the death hub): pays
 * the finder ticket grant to every credited participant of a final-boss kill
 * inside a claimed instance.
 */
export function awardFinderClearTickets(
  ctx: SimContext,
  mob: Entity,
  recipients: PlayerMeta[],
): void {
  const inst = ctx.instances.find((i) => i.partyKey !== null && i.mobIds.includes(mob.id));
  if (inst === undefined) return;
  const finalBossId = HEROIC_DUNGEON_TUNING[inst.dungeonId]?.finalBossId;
  if (finalBossId === undefined || mob.templateId !== finalBossId) return;
  for (const meta of recipients) {
    if (!finderClearEarnsTickets(meta, inst.dungeonId, ctx.resetDay)) continue;
    meta.waystoneTicketDay = ctx.resetDay;
    meta.finderRunDungeonId = null;
    grantWaystoneTickets(ctx, meta, WAYSTONE_TICKETS_PER_FINDER_CLEAR);
  }
}
