// Flight paths: the flightmaster service and the hands-off ride between hubs.
// STUB: bodies are filled in the flight-paths implementation commit; the
// coordinator is already wired to these signatures.

import type { Entity, NpcDef } from './types';
import type { PlayerMeta } from './sim';
import type { SimContext } from './sim_context';

export function isFlightmasterNpc(_e: Entity): boolean {
  return false;
}
export function spawnFlightmasters(
  _ctx: SimContext,
  _npcs: Record<string, NpcDef>,
  _findSafePos: (x: number, z: number) => { x: number; z: number },
): void {}
export function discoverFlightmaster(_ctx: SimContext, _meta: PlayerMeta, _npc: Entity): void {}
export function takeFlight(_ctx: SimContext, _pid: number, _nodeId: string): void {}
export function advanceFlightPath(_ctx: SimContext, _p: Entity): boolean {
  return false;
}
