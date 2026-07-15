// Pure peer-selection for proximity voice chat. Audio itself is a P2P WebRTC
// mesh between clients (see src/net/voice_chat.ts); the server's only role is
// (a) authoritatively deciding WHO each opted-in player's mesh should include
// (so both sides agree, instead of each client independently guessing), and
// (b) relaying WebRTC signaling frames (offer/answer/ice) between the two
// endpoints of an agreed pair. Neither belongs in the deterministic Sim: voice
// is not gameplay state, carries no rng, and must never affect a replay.
//
// Kept host-agnostic (no WebSocket/session types) so it is Vitest-testable
// without spinning up the server.

export const VOICE_PEER_CAP = 8;

export interface VoiceCandidate {
  pid: number;
  name: string;
  x: number;
  z: number;
}

/** The `cap` nearest other voice-opted-in players to `self`, closest first.
 *  Ties broken by lower pid for a stable, deterministic order across ticks.
 *  `maxRangeSq`, if given, excludes any candidate beyond that squared distance
 *  BEFORE the cap is applied, so a farther candidate never displaces a nearer
 *  one that is still out of range, and a small opted-in pool never gets paired
 *  across the whole map just to fill the cap (PR #1826 review). */
export function nearestVoicePeers(
  self: VoiceCandidate,
  others: readonly VoiceCandidate[],
  cap: number = VOICE_PEER_CAP,
  maxRangeSq?: number,
): { pid: number; name: string }[] {
  const ranked = others
    .filter((o) => o.pid !== self.pid)
    .map((o) => {
      const dx = o.x - self.x;
      const dz = o.z - self.z;
      return { o, distSq: dx * dx + dz * dz };
    })
    .filter((c) => maxRangeSq === undefined || c.distSq <= maxRangeSq)
    .sort((a, b) => a.distSq - b.distSq || a.o.pid - b.o.pid);
  return ranked.slice(0, cap).map(({ o }) => ({ pid: o.pid, name: o.name }));
}
