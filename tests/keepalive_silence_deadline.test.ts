import { describe, expect, it } from 'vitest';

import {
  KEEPALIVE_STALL_FACTOR,
  noteClientFrame,
  socketSilentPastDeadline,
  WS_SILENCE_DEADLINE_MS,
} from '../server/keepalive_sweep';

describe('keepalive silence deadline', () => {
  it('is ten minutes, and longer than any span the pong check could be paused for by one late sweep', () => {
    expect(WS_SILENCE_DEADLINE_MS).toBe(10 * 60 * 1000);
    expect(WS_SILENCE_DEADLINE_MS).toBeGreaterThan(KEEPALIVE_STALL_FACTOR * 30_000);
  });

  it('counts silence only up to the previous sweep, never into the interval frames may still be queued for', () => {
    const ws = {};
    const t0 = 1_000_000;
    noteClientFrame(ws, t0);
    // Previous sweep ran one deadline after the frame: proven silent.
    expect(socketSilentPastDeadline(ws, t0 + WS_SILENCE_DEADLINE_MS)).toBe(true);
    // One millisecond short of the deadline at the previous sweep: not yet.
    expect(socketSilentPastDeadline(ws, t0 + WS_SILENCE_DEADLINE_MS - 1)).toBe(false);
    // A frame processed AFTER the previous sweep (it was queued behind a stall)
    // makes the gap negative: that is evidence of life, never of death.
    noteClientFrame(ws, t0 + 10);
    expect(socketSilentPastDeadline(ws, t0)).toBe(false);
  });

  it('never judges a socket it has no frame timestamp for', () => {
    expect(socketSilentPastDeadline({}, Number.MAX_SAFE_INTEGER)).toBe(false);
  });

  it('keys on socket identity so a replaced (resumed) socket starts its own clock', () => {
    const oldWs = {};
    const newWs = {};
    const t0 = 5_000_000;
    noteClientFrame(oldWs, t0);
    noteClientFrame(newWs, t0 + WS_SILENCE_DEADLINE_MS);
    const sweepAt = t0 + WS_SILENCE_DEADLINE_MS;
    expect(socketSilentPastDeadline(oldWs, sweepAt)).toBe(true);
    expect(socketSilentPastDeadline(newWs, sweepAt)).toBe(false);
  });
});
