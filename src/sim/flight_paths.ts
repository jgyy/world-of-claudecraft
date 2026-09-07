// Flight paths: the flightmaster service and the hands-off ride between hubs.
//
// Data lives in content/flight_paths.ts (nodes, links, fare, speed, height).
// This module owns the three verbs the coordinator delegates to:
//   spawnFlightmasters: world-init spawn on RESERVED ids (the Warfare
//     Quartermaster precedent, pvp/warfare_quartermaster.ts), so adding a node
//     never shifts a sequential entity id or a parity golden. Draws no rng.
//   discoverFlightmaster: the interact path at a flightmaster records its node
//     as known (persisted in CharacterState.flightNodesKnown) and asks the
//     client to open the flight window.
//   takeFlight + advanceFlightPath: the paid, server-authoritative ride. The
//     route is the BFS-shortest path over FLIGHT_LINKS from the flightmaster
//     in reach to a known destination; the fare is FLIGHT_FARE_COPPER per hop.
//     While Entity.flight is set the ride owns the body outright (the Heroic
//     Leap / climb MOVEMENT MODE family): input is ignored, the rider hovers
//     FLIGHT_HEIGHT above the sampled ground, and the landing is settled through
//     the shared teleport-arrival recipe so no fall damage carries over.
// Every function here draws ZERO rng.

import {
  FLIGHT_FARE_COPPER,
  FLIGHT_HEIGHT,
  FLIGHT_LINKS,
  FLIGHT_NODES,
  FLIGHT_SPEED,
  type FlightNodeDef,
  flightmasterEntityId,
  flightNodeById,
  flightNodeByNpcId,
} from './content/flight_paths';
import { createNpc } from './entity';
import { formatMoney } from './format_money';
import type { PlayerMeta } from './sim';
import type { SimContext } from './sim_context';
import { settleTeleportArrival } from './teleport_arrival';
import { DT, type Entity, INTERACT_RANGE, type NpcDef } from './types';

/** How close a player must stand to a flightmaster to fly: INTERACT_RANGE + 2,
 *  inclusive, the same reach the bank and the Rift Forge use. */
export const FLIGHTMASTER_RANGE = INTERACT_RANGE + 2;

export const FLIGHT_ALREADY_FLYING_TEXT = 'You are already on a flight.';
export const FLIGHT_TOO_FAR_TEXT = 'You are too far from the flightmaster.';
export const FLIGHT_UNKNOWN_NODE_TEXT = 'You have not learned that flight path.';
export const FLIGHT_ALREADY_THERE_TEXT = 'You are already there.';
export const FLIGHT_NO_ROUTE_TEXT = 'No flight path leads there.';
export const FLIGHT_NO_MONEY_TEXT = 'Not enough money.';

/** True when `e` is a live NPC whose content key names a flight node. */
export function isFlightmasterNpc(e: Entity): boolean {
  return e.kind === 'npc' && flightNodeByNpcId(e.templateId) !== undefined;
}

/**
 * Spawn every flightmaster whose def the ACTIVE world content carries, each on
 * its reserved id. A custom map without a def skips that node; a second call
 * with the entity already present is a no-op. No rng, no nextId.
 */
export function spawnFlightmasters(
  ctx: SimContext,
  npcs: Record<string, NpcDef>,
  findSafePos: (x: number, z: number) => { x: number; z: number },
): void {
  for (const node of FLIGHT_NODES) {
    const def = npcs[node.npcId];
    if (!def) continue;
    const id = flightmasterEntityId(node.id);
    if (id === null || ctx.entities.has(id)) continue;
    const safe = findSafePos(node.x, node.z);
    ctx.addEntity(createNpc(id, def, ctx.groundPos(safe.x, safe.z)));
  }
}

/** Talking to a flightmaster: record the node (first time only logs) and
 *  always ask the client to open the flight window. */
export function discoverFlightmaster(ctx: SimContext, meta: PlayerMeta, npc: Entity): void {
  const node = flightNodeByNpcId(npc.templateId);
  if (!node) return;
  if (!meta.flightNodesKnown.has(node.id)) {
    meta.flightNodesKnown.add(node.id);
    ctx.emit({
      type: 'log',
      text: `Flight path discovered: ${node.town}.`,
      color: '#b9f',
      pid: meta.entityId,
    });
  }
  ctx.emit({ type: 'flightmaster', npcId: npc.id, nodeId: node.id, pid: meta.entityId });
}

/** The flightmaster node within FLIGHTMASTER_RANGE of `p`, or null. */
export function nearbyFlightNode(ctx: SimContext, p: Entity): FlightNodeDef | null {
  let found: FlightNodeDef | null = null;
  ctx.grid.forEachInRadius(p.pos.x, p.pos.z, FLIGHTMASTER_RANGE, (e) => {
    if (found || e.kind !== 'npc') return;
    const node = flightNodeByNpcId(e.templateId);
    if (node) found = node;
  });
  return found;
}

/** BFS-shortest node-id route over FLIGHT_LINKS, origin first, destination
 *  last; null when no link chain connects them. Pure. */
export function flightRoute(from: string, to: string): string[] | null {
  if (from === to) return [from];
  const prev = new Map<string, string | null>([[from, null]]);
  const queue = [from];
  for (let head = 0; head < queue.length; head++) {
    const cur = queue[head];
    for (const [a, b] of FLIGHT_LINKS) {
      const next = a === cur ? b : b === cur ? a : null;
      if (next === null || prev.has(next)) continue;
      prev.set(next, cur);
      if (next === to) {
        const route: string[] = [];
        for (let at: string | null = to; at !== null; at = prev.get(at) ?? null) route.unshift(at);
        return route;
      }
      queue.push(next);
    }
  }
  return null;
}

/** Fare in copper for a route of `hops` links. Pure. */
export function flightFare(hops: number): number {
  return hops * FLIGHT_FARE_COPPER;
}

/** Board a flight from the flightmaster in reach to a known node. Every gate
 *  refuses through ctx.error with the English line (client re-localizes). */
export function takeFlight(ctx: SimContext, pid: number, nodeId: string): void {
  const r = ctx.resolve(pid);
  if (!r) return;
  const { meta, e: p } = r;
  if (p.flight) {
    ctx.error(pid, FLIGHT_ALREADY_FLYING_TEXT);
    return;
  }
  if (p.dead || p.ghost) return; // the town-service idiom: the dead fly nowhere
  if (p.inCombat) {
    ctx.error(pid, "You can't do that while in combat.");
    return;
  }
  const origin = nearbyFlightNode(ctx, p);
  if (!origin) {
    ctx.error(pid, FLIGHT_TOO_FAR_TEXT);
    return;
  }
  const dest = flightNodeById(nodeId);
  if (!dest || !meta.flightNodesKnown.has(nodeId)) {
    ctx.error(pid, FLIGHT_UNKNOWN_NODE_TEXT);
    return;
  }
  if (dest.id === origin.id) {
    ctx.error(pid, FLIGHT_ALREADY_THERE_TEXT);
    return;
  }
  const route = flightRoute(origin.id, dest.id);
  if (!route) {
    ctx.error(pid, FLIGHT_NO_ROUTE_TEXT);
    return;
  }
  const fare = flightFare(route.length - 1);
  if (fare > meta.copper) {
    ctx.error(pid, FLIGHT_NO_MONEY_TEXT);
    return;
  }
  meta.copper -= fare;
  ctx.cancelCast(p);
  p.targetId = null;
  p.autoAttack = false;
  p.flight = {
    path: route.slice(1).map((id) => {
      const node = flightNodeById(id) as FlightNodeDef;
      return { x: node.x, z: node.z };
    }),
    index: 0,
    destination: dest.id,
    speed: FLIGHT_SPEED,
  };
  ctx.emit({
    type: 'log',
    text: `Flight to ${dest.town}: ${formatMoney(fare)}.`,
    color: '#b9f',
    pid,
  });
}

/** One tick of a ride; true while the flight owns the body. */
export function advanceFlightPath(ctx: SimContext, p: Entity): boolean {
  const flight = p.flight;
  if (!flight) return false;
  // A rider killed mid-air (the movement loop skips a corpse, so this fires
  // on the released spirit): the ride ends where the body fell, the Heroic
  // Leap idiom, never resumes on resurrection.
  if (p.dead) {
    p.flight = null;
    return false;
  }
  const step = flight.speed * DT;
  let remaining = step;
  p.prevPos = { ...p.pos };
  while (remaining > 0 && flight.index < flight.path.length) {
    const wp = flight.path[flight.index];
    const dx = wp.x - p.pos.x;
    const dz = wp.z - p.pos.z;
    const dist = Math.hypot(dx, dz);
    if (dist > 1e-6) p.facing = Math.atan2(dx, dz);
    if (dist <= remaining) {
      p.pos.x = wp.x;
      p.pos.z = wp.z;
      remaining -= dist;
      flight.index++;
    } else {
      p.pos.x += (dx / dist) * remaining;
      p.pos.z += (dz / dist) * remaining;
      remaining = 0;
    }
  }
  if (flight.index < flight.path.length) {
    p.pos.y = ctx.groundPos(p.pos.x, p.pos.z).y + FLIGHT_HEIGHT;
    p.onGround = false;
    p.vy = 0;
    p.jumping = false;
    ctx.rebucket(p);
    return true;
  }
  const dest = flightNodeById(flight.destination);
  const land = flight.path[flight.path.length - 1];
  p.pos = ctx.groundPos(land.x, land.z);
  p.prevPos = { ...p.pos };
  settleTeleportArrival(p);
  ctx.rebucket(p);
  p.flight = null;
  if (dest) {
    ctx.emit({ type: 'log', text: `You have arrived in ${dest.town}.`, color: '#b9f', pid: p.id });
  }
  return true;
}
