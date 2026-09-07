// The waystone_teleport wire dispatch (the rift_forge_dispatch.ts shape): parse
// the destination stone id and hand it to the sim, which re-validates everything
// on its authoritative copy (reach to a keeper, the stone attuned, the ticket or
// the fee). A malformed frame is a silent no-op, the same silence every other
// malformed command gets. Nothing here trusts client data.

import type { Sim } from '../src/sim/sim';

type WaystoneMessage = Readonly<Record<string, unknown>> & { cmd?: string };

/** Route one waystone_teleport command to the sim; null when the frame is malformed. */
export function dispatchWaystoneCommand(
  sim: Pick<Sim, 'waystoneTeleportFor'>,
  msg: WaystoneMessage,
  pid: number,
): boolean {
  if (msg.cmd !== 'waystone_teleport' || typeof msg.stone !== 'string' || msg.stone.length > 64) {
    return false;
  }
  sim.waystoneTeleportFor(msg.stone, pid);
  return true;
}
