import { describe, expect, it } from 'vitest';
import { diffVoicePeers, VoiceChatClient } from '../../src/net/voice_chat';

describe('diffVoicePeers', () => {
  it('reports newly added peers', () => {
    const { added, removed } = diffVoicePeers(new Set(), [{ pid: 1 }, { pid: 2 }]);
    expect(added.sort()).toEqual([1, 2]);
    expect(removed).toEqual([]);
  });

  it('reports peers dropped from the server list', () => {
    const { added, removed } = diffVoicePeers(new Set([1, 2, 3]), [{ pid: 2 }]);
    expect(added).toEqual([]);
    expect(removed.sort()).toEqual([1, 3]);
  });

  it('is a no-op when the set is unchanged', () => {
    const { added, removed } = diffVoicePeers(new Set([1, 2]), [{ pid: 1 }, { pid: 2 }]);
    expect(added).toEqual([]);
    expect(removed).toEqual([]);
  });

  it('handles simultaneous add and remove', () => {
    const { added, removed } = diffVoicePeers(new Set([1, 2]), [{ pid: 2 }, { pid: 3 }]);
    expect(added).toEqual([3]);
    expect(removed).toEqual([1]);
  });
});

// Minimal fake getUserMedia: enough to exercise setMuted (track.enabled) and
// setEnabled's opt-in lifecycle without a real browser.
function fakeTrack() {
  return { enabled: true, stop: () => undefined, kind: 'audio' };
}

function withFakeMediaDevices<T>(fn: () => Promise<T>): Promise<T> {
  const g = globalThis as Record<string, unknown>;
  const prev = Object.getOwnPropertyDescriptor(g, 'navigator');
  const track = fakeTrack();
  Object.defineProperty(g, 'navigator', {
    value: {
      mediaDevices: {
        getUserMedia: async () => ({
          getTracks: () => [track],
          getAudioTracks: () => [track],
        }),
      },
    },
    configurable: true,
  });
  return fn().finally(() => {
    if (prev) Object.defineProperty(g, 'navigator', prev);
  });
}

describe('VoiceChatClient self-mute', () => {
  it('disables the local audio track without leaving the mesh (idempotent setEnabled)', async () => {
    await withFakeMediaDevices(async () => {
      let optIn: boolean | null = null;
      const client = new VoiceChatClient(
        () => 1,
        () => undefined,
        (on) => {
          optIn = on;
        },
      );

      client.setMuted(true);
      expect(client.isMuted()).toBe(true);

      await client.setEnabled(true);
      expect(client.isEnabled()).toBe(true);
      expect(optIn).toBe(true);
      // A prior self-mute persists across the fresh getUserMedia capture.
      const track = (
        client as unknown as { localStream: { getAudioTracks(): { enabled: boolean }[] } }
      ).localStream.getAudioTracks()[0];
      expect(track.enabled).toBe(false);

      client.setMuted(false);
      expect(track.enabled).toBe(true);
      // Muting never re-sends voiceoptin or tears down the mesh: setEnabled(true)
      // above is the only call that flipped optIn.
      expect(optIn).toBe(true);
    });
  });
});
