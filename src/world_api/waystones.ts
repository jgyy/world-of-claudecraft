// IWorldWaystones: the waystone keeper service (src/sim/waystones.ts).
// Reads are snapshot-mirrored on the online client; waystoneTeleport is a command.

export interface IWorldWaystones {
  /** Waystone ids this character has attuned (touched the keeper's stone). */
  waystonesAttuned: ReadonlySet<string>;
  /** Teleport from the keeper in reach to an attuned stone (content/waystones.ts). */
  waystoneTeleport(stoneId: string): void;
}
