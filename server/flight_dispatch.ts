// The flight_take wire dispatch (the rift_forge_dispatch.ts shape): parse the
// destination node id and hand it to the sim, which re-validates everything
// on its authoritative copy (reach to a flightmaster, the node known, the
// route, the fare). A malformed frame is a silent no-op, the same silence
// every other malformed command gets. Nothing here trusts client data.

import type { Sim } from '../src/sim/sim';

type FlightMessage = Readonly<Record<string, unknown>> & { cmd?: string };

/** Route one flight_take command to the sim; null when the frame is malformed. */
export function dispatchFlightCommand(
  sim: Pick<Sim, 'takeFlightFor'>,
  msg: FlightMessage,
  pid: number,
): boolean {
  if (msg.cmd !== 'flight_take' || typeof msg.node !== 'string' || msg.node.length > 64) {
    return false;
  }
  sim.takeFlightFor(msg.node, pid);
  return true;
}
