// IWorldFlightPaths: the flightmaster service (src/sim/flight_paths.ts).
// Reads are snapshot-mirrored on the online client; takeFlight is a command.

export interface IWorldFlightPaths {
  /** Flight node ids whose flightmaster this character has spoken to. */
  flightNodesKnown: ReadonlySet<string>;
  /** Fly from the flightmaster in reach to a known node (content/flight_paths.ts). */
  takeFlight(nodeId: string): void;
}
