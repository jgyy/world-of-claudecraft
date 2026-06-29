import { describe, expect, it } from 'vitest';
import { nextRaidResetMs, RAID_RESET_TIME_ZONE } from '../src/sim/instances/raid_reset';

// The daily raid reset is standardized to midnight in the us-east-1 region's civil
// time (US Eastern, America/New_York), so every realm shares one predictable reset
// boundary instead of a rolling "24h from kill" window. nextRaidResetMs is a pure
// function of the wall-clock instant, so it stays deterministic (no Date.now/rng).

// Helper: the parts of an instant rendered in the reset zone, so a test can assert
// the result really lands on 00:00:00 local time regardless of DST.
function zoneParts(ms: number): { hour: number; minute: number; second: number } {
  const p = new Intl.DateTimeFormat('en-US', {
    timeZone: RAID_RESET_TIME_ZONE,
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
    .formatToParts(new Date(ms))
    .reduce<Record<string, string>>((acc, part) => {
      acc[part.type] = part.value;
      return acc;
    }, {});
  return { hour: Number(p.hour) % 24, minute: Number(p.minute), second: Number(p.second) };
}

describe('nextRaidResetMs', () => {
  it('is deterministic: same input gives the same output', () => {
    const now = Date.UTC(2025, 5, 29, 16, 0, 0); // a fixed instant
    expect(nextRaidResetMs(now)).toBe(nextRaidResetMs(now));
  });

  it('always returns an instant strictly in the future', () => {
    for (const now of [0, Date.UTC(2025, 0, 1, 5, 0, 0), Date.UTC(2025, 6, 4, 3, 30, 0)]) {
      expect(nextRaidResetMs(now)).toBeGreaterThan(now);
    }
  });

  it('lands exactly on midnight in the reset zone', () => {
    for (const now of [
      Date.UTC(2025, 5, 29, 16, 0, 0), // summer (EDT)
      Date.UTC(2025, 0, 15, 12, 0, 0), // winter (EST)
      Date.UTC(2025, 11, 31, 23, 59, 0), // year boundary
    ]) {
      const reset = nextRaidResetMs(now);
      expect(zoneParts(reset)).toEqual({ hour: 0, minute: 0, second: 0 });
    }
  });

  it('resolves to the next civil day during summer (EDT, UTC-4)', () => {
    // 2025-06-29 12:00 EDT == 16:00 UTC. Next midnight is 2025-06-30 00:00 EDT == 04:00 UTC.
    const now = Date.UTC(2025, 5, 29, 16, 0, 0);
    expect(nextRaidResetMs(now)).toBe(Date.UTC(2025, 5, 30, 4, 0, 0));
  });

  it('resolves to the next civil day during winter (EST, UTC-5)', () => {
    // 2025-01-15 12:00 EST == 17:00 UTC. Next midnight is 2025-01-16 00:00 EST == 05:00 UTC.
    const now = Date.UTC(2025, 0, 15, 17, 0, 0);
    expect(nextRaidResetMs(now)).toBe(Date.UTC(2025, 0, 16, 5, 0, 0));
  });

  it('rolls a kill made just before midnight to the imminent reset, not a full day', () => {
    // 2025-06-29 23:30 EDT == 2025-06-30 03:30 UTC. Reset is only 30 min away.
    const now = Date.UTC(2025, 5, 30, 3, 30, 0);
    const reset = nextRaidResetMs(now);
    expect(reset).toBe(Date.UTC(2025, 5, 30, 4, 0, 0));
    expect(reset - now).toBe(30 * 60 * 1000);
  });

  it('at the reset instant itself, returns the following day (no zero-length lockout)', () => {
    const midnight = Date.UTC(2025, 5, 30, 4, 0, 0); // 2025-06-30 00:00 EDT
    expect(nextRaidResetMs(midnight)).toBe(Date.UTC(2025, 6, 1, 4, 0, 0));
  });

  it('handles the spring-forward DST gap day (clocks jump 02:00 to 03:00 EST to EDT)', () => {
    // DST began 2025-03-09. Killing on 2025-03-09 mid-day must still reset at the
    // next local midnight (2025-03-10 00:00 EDT == 04:00 UTC), not 05:00.
    const now = Date.UTC(2025, 2, 9, 18, 0, 0); // 2025-03-09 14:00 EDT
    expect(nextRaidResetMs(now)).toBe(Date.UTC(2025, 2, 10, 4, 0, 0));
  });

  it('handles the fall-back DST day (clocks repeat 01:00 to 02:00 EDT to EST)', () => {
    // DST ended 2025-11-02. Reset at next local midnight (2025-11-03 00:00 EST == 05:00 UTC).
    const now = Date.UTC(2025, 10, 2, 12, 0, 0); // 2025-11-02 07:00 EST (after fall-back)
    expect(nextRaidResetMs(now)).toBe(Date.UTC(2025, 10, 3, 5, 0, 0));
  });
});
