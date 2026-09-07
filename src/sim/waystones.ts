// Waystones: the keeper service and the instant, paid hop between attuned stones.
//
// Data lives in content/waystones.ts (stones, keepers, fee constants, the
// ticket item). This module owns the verbs the coordinator delegates to:
//   spawnWaystoneKeepers: world-init spawn on RESERVED ids (the Warfare
//     Quartermaster precedent, pvp/warfare_quartermaster.ts), so adding a stone
//     never shifts a sequential entity id or a parity golden. Draws no rng.
//   attuneWaystone: the interact path at a keeper records its stone as attuned
//     (persisted in CharacterState.waystonesAttuned) and asks the client to open
//     the waystone window.
//   waystoneTeleport: the server-authoritative hop. From the keeper in reach to
//     any attuned stone, instantly, paid with one Waystone Ticket when the bags
//     hold one and otherwise with the distance fee after the guild discount
//     (waystone_fee.ts). The landing goes through displacePlayer so the arrival
//     is settled like every other teleport (no carried fall damage).
// Every function here draws ZERO rng.

import {
  WAYSTONE_TICKET_ITEM_ID,
  WAYSTONES,
  type WaystoneDef,
  waystoneById,
  waystoneByNpcId,
  waystoneKeeperEntityId,
} from './content/waystones';
import { displacePlayer } from './displacement';
import { createNpc } from './entity';
import { formatMoney } from './format_money';
import type { PlayerMeta } from './sim';
import type { SimContext } from './sim_context';
import { type Entity, INTERACT_RANGE, type NpcDef } from './types';
import { waystoneFee } from './waystone_fee';

/** How close a player must stand to a keeper to use the stone: INTERACT_RANGE + 2,
 *  inclusive, the same reach the bank and the Rift Forge use. */
export const WAYSTONE_KEEPER_RANGE = INTERACT_RANGE + 2;

export const WAYSTONE_TOO_FAR_TEXT = 'You are too far from the waystone.';
export const WAYSTONE_UNKNOWN_TEXT = 'You have not attuned to that waystone.';
export const WAYSTONE_ALREADY_THERE_TEXT = 'You are already there.';
export const WAYSTONE_NO_MONEY_TEXT = 'Not enough money.';

/** True when `e` is a live NPC whose content key names a waystone. */
export function isWaystoneKeeperNpc(e: Entity): boolean {
  return e.kind === 'npc' && waystoneByNpcId(e.templateId) !== undefined;
}

/**
 * Spawn every keeper whose def the ACTIVE world content carries, each on its
 * reserved id. A custom map without a def skips that stone; a second call with
 * the entity already present is a no-op. No rng, no nextId.
 */
export function spawnWaystoneKeepers(
  ctx: SimContext,
  npcs: Record<string, NpcDef>,
  findSafePos: (x: number, z: number) => { x: number; z: number },
): void {
  for (const stone of WAYSTONES) {
    const def = npcs[stone.npcId];
    if (!def) continue;
    const id = waystoneKeeperEntityId(stone.id);
    if (id === null || ctx.entities.has(id)) continue;
    const safe = findSafePos(stone.x, stone.z);
    ctx.addEntity(createNpc(id, def, ctx.groundPos(safe.x, safe.z)));
  }
}

/** Talking to a keeper: attune the stone (first time only logs) and always ask
 *  the client to open the waystone window. */
export function attuneWaystone(ctx: SimContext, meta: PlayerMeta, npc: Entity): void {
  const stone = waystoneByNpcId(npc.templateId);
  if (!stone) return;
  if (!meta.waystonesAttuned.has(stone.id)) {
    meta.waystonesAttuned.add(stone.id);
    ctx.emit({
      type: 'log',
      text: `Waystone attuned: ${stone.town}.`,
      color: '#b9f',
      pid: meta.entityId,
    });
  }
  ctx.emit({ type: 'waystone', npcId: npc.id, stoneId: stone.id, pid: meta.entityId });
}

/** The stone whose keeper stands within WAYSTONE_KEEPER_RANGE of `p`, or null. */
export function nearbyWaystone(ctx: SimContext, p: Entity): WaystoneDef | null {
  let found: WaystoneDef | null = null;
  ctx.grid.forEachInRadius(p.pos.x, p.pos.z, WAYSTONE_KEEPER_RANGE, (e) => {
    if (found || e.kind !== 'npc') return;
    const stone = waystoneByNpcId(e.templateId);
    if (stone) found = stone;
  });
  return found;
}

/** Teleport from the keeper in reach to an attuned stone. Every gate refuses
 *  through ctx.error with the English line (client re-localizes). */
export function waystoneTeleport(ctx: SimContext, pid: number, stoneId: string): void {
  const r = ctx.resolve(pid);
  if (!r) return;
  const { meta, e: p } = r;
  if (p.dead || p.ghost) return; // the town-service idiom: the dead travel nowhere
  if (p.inCombat) {
    ctx.error(pid, "You can't do that while in combat.");
    return;
  }
  const origin = nearbyWaystone(ctx, p);
  if (!origin) {
    ctx.error(pid, WAYSTONE_TOO_FAR_TEXT);
    return;
  }
  const dest = waystoneById(stoneId);
  if (!dest || !meta.waystonesAttuned.has(stoneId)) {
    ctx.error(pid, WAYSTONE_UNKNOWN_TEXT);
    return;
  }
  if (dest.id === origin.id) {
    ctx.error(pid, WAYSTONE_ALREADY_THERE_TEXT);
    return;
  }
  const ticket = ctx.countItem(WAYSTONE_TICKET_ITEM_ID, pid) > 0;
  const fee = ticket ? 0 : waystoneFee(origin, dest, p.guildTier);
  if (fee > meta.copper) {
    ctx.error(pid, WAYSTONE_NO_MONEY_TEXT);
    return;
  }
  if (ticket) ctx.removeItem(WAYSTONE_TICKET_ITEM_ID, 1, pid);
  else meta.copper -= fee;
  ctx.cancelCast(p);
  displacePlayer(
    ctx,
    p,
    { x: dest.x + 2, z: dest.z + 2, facing: p.facing },
    ticket
      ? `Waystone to ${dest.town}: 1 ticket.`
      : `Waystone to ${dest.town}: ${formatMoney(fee)}.`,
  );
}
