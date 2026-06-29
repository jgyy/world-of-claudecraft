// Daily raid reset boundary.
//
// Classic-style realms expire raid lockouts at a fixed daily reset time, not on a
// rolling "24h from kill" window, so a guild can plan its raid night around one
// predictable boundary. We standardize that boundary to midnight in the us-east-1
// region's civil time zone (US Eastern, America/New_York), which observes DST.
//
// This module is a pure leaf: given the wall-clock instant of a boss kill (epoch
// ms, supplied by the host via SimContext.lockoutNowMs), it returns the epoch ms of
// the next reset. It draws no randomness and reads no live clock, so it stays
// deterministic (same input -> same output) and host-agnostic. It uses only
// Intl.DateTimeFormat, new Date(ms), and Date.UTC, all pure functions of their
// arguments and none of the sim-banned wall-clock calls (Date.now/performance.now).

export const RAID_RESET_TIME_ZONE = 'America/New_York';

// The reset zone's UTC offset (in ms) active at a given instant. Derived by rendering
// the instant as wall-clock parts in the zone and diffing against the same numbers read
// as if they were UTC. Positive for zones ahead of UTC, negative (US Eastern) behind it.
function zoneOffsetMs(instantMs: number): number {
  const p = new Intl.DateTimeFormat('en-US', {
    timeZone: RAID_RESET_TIME_ZONE,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
    .formatToParts(new Date(instantMs))
    .reduce<Record<string, string>>((acc, part) => {
      acc[part.type] = part.value;
      return acc;
    }, {});
  const asUtc = Date.UTC(
    Number(p.year),
    Number(p.month) - 1,
    Number(p.day),
    Number(p.hour) % 24, // some runtimes render midnight as hour '24'
    Number(p.minute),
    Number(p.second),
  );
  // asUtc - instantMs rounds to whole seconds; reset boundaries are whole hours so
  // this is exact for every IANA offset.
  return asUtc - instantMs;
}

// The civil calendar date (year, month 1-12, day) of an instant in the reset zone.
function zoneDate(instantMs: number): { y: number; mo: number; d: number } {
  const p = new Intl.DateTimeFormat('en-US', {
    timeZone: RAID_RESET_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
    .formatToParts(new Date(instantMs))
    .reduce<Record<string, string>>((acc, part) => {
      acc[part.type] = part.value;
      return acc;
    }, {});
  return { y: Number(p.year), mo: Number(p.month), d: Number(p.day) };
}

// The epoch ms of 00:00:00 reset-zone time for the given civil date. Day overflow
// (e.g. d = 32) wraps the month/year via Date.UTC. The offset is resolved twice so a
// midnight that straddles a DST transition still maps to the correct UTC instant.
function zoneMidnightToUtc(y: number, mo: number, d: number): number {
  const naive = Date.UTC(y, mo - 1, d, 0, 0, 0);
  const firstGuess = naive - zoneOffsetMs(naive);
  const offset = zoneOffsetMs(firstGuess);
  return naive - offset;
}

// The next daily raid reset strictly after nowMs (epoch ms): midnight of the next
// civil day in the reset zone.
export function nextRaidResetMs(nowMs: number): number {
  const { y, mo, d } = zoneDate(nowMs);
  return zoneMidnightToUtc(y, mo, d + 1);
}
