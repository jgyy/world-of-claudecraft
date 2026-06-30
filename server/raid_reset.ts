// Daily raid reset boundary (server-side).
//
// Classic-style realms expire raid lockouts at a fixed daily reset time, not on a
// rolling "24h from kill" window, so a guild can plan its raid night around one
// predictable boundary. The reset lands at midnight in the realm's own civil time
// zone (an IANA name, e.g. America/New_York or Europe/Paris); each realm process
// picks its zone via REALM_RESET_TZ (see server/realm.ts), defaulting to US Eastern.
//
// This lives on the SERVER, not in src/sim/, on purpose: the reset zone is a host /
// wall-clock concern (like the lockout clock itself), so the deterministic sim core
// never reads the host time zone database. The server computes the next-reset instant
// and injects it into the sim through the lockout seam (SimContext.raidResetMs); the
// sim just stores the number it is handed. nextRaidResetMs is a pure function of
// (instant, zone): it draws no randomness and reads no live clock, using only
// Intl.DateTimeFormat, new Date(ms), and Date.UTC.

export const DEFAULT_RAID_RESET_TIME_ZONE = 'America/New_York';

// Whether the host ICU database can resolve the given IANA zone. A Node built without
// full ICU throws here even for a valid zone, so callers can validate config and fail
// fast at boot instead of crashing mid-raid on the first boss kill.
export function isSupportedTimeZone(zone: string): boolean {
  try {
    // The constructor throws RangeError for an unknown/unsupported zone.
    new Intl.DateTimeFormat('en-US', { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}

// The reset zone's UTC offset (in ms) active at a given instant. Derived by rendering
// the instant as wall-clock parts in the zone and diffing against the same numbers read
// as if they were UTC. Positive for zones ahead of UTC, negative (US Eastern) behind it.
function zoneOffsetMs(instantMs: number, zone: string): number {
  const p = new Intl.DateTimeFormat('en-US', {
    timeZone: zone,
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
  // this is exact for every modern IANA offset.
  return asUtc - instantMs;
}

// The civil calendar date (year, month 1-12, day) of an instant in the reset zone.
function zoneDate(instantMs: number, zone: string): { y: number; mo: number; d: number } {
  const p = new Intl.DateTimeFormat('en-US', {
    timeZone: zone,
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
function zoneMidnightToUtc(y: number, mo: number, d: number, zone: string): number {
  const naive = Date.UTC(y, mo - 1, d, 0, 0, 0);
  const firstGuess = naive - zoneOffsetMs(naive, zone);
  const offset = zoneOffsetMs(firstGuess, zone);
  return naive - offset;
}

// The next daily raid reset strictly after nowMs (epoch ms): midnight of the next
// civil day in the given reset zone (default US Eastern).
export function nextRaidResetMs(
  nowMs: number,
  zone: string = DEFAULT_RAID_RESET_TIME_ZONE,
): number {
  const { y, mo, d } = zoneDate(nowMs, zone);
  return zoneMidnightToUtc(y, mo, d + 1, zone);
}
