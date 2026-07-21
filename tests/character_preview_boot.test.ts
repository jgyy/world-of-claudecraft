import { describe, expect, it, vi } from 'vitest';

// The bug: the landing character-creation preview was gated on the site-wide
// assetsReady() promise with no failure handler. That promise covers EVERY
// registered preload (terrain, dungeon, foliage, character GLBs, ...), so a
// single transient failure ANYWHERE permanently sank the character preview
// with zero retry, most likely on a cold, first-visit cache (no warm HTTP
// cache to mask a flaky fetch). charactersReady() is the narrower fix: it
// only waits on character-boot assets and retries whatever is still missing,
// since loadGltf/loadTexture evict a failed URL from their cache on
// rejection, making a fresh call a real re-fetch attempt.
function mockGltfLoad(failFirstNCalls: number): void {
  const calls = new Map<string, number>();
  vi.doMock('../src/render/assets/loader', () => ({
    loadGltf: vi.fn((url: string) => {
      const n = (calls.get(url) ?? 0) + 1;
      calls.set(url, n);
      if (n <= failFirstNCalls) return Promise.reject(new Error(`transient failure: ${url}`));
      return Promise.resolve({ scene: {}, animations: [] });
    }),
    loadHdr: vi.fn(() => new Promise(() => undefined)),
    loadTexture: vi.fn(() => Promise.resolve({})),
    releaseGltf: vi.fn(),
  }));
}

describe('character preview boot (first-visit transient asset failure)', () => {
  it('retries a failed character GLB and eventually resolves', async () => {
    vi.resetModules();
    mockGltfLoad(1); // every URL fails once, then succeeds
    const { charactersReady } = await import('../src/render/characters/assets');

    await expect(charactersReady(3)).resolves.toBeUndefined();
  });

  it('rejects once every attempt is exhausted, instead of hanging forever', async () => {
    vi.resetModules();
    mockGltfLoad(Number.POSITIVE_INFINITY); // every URL always fails
    const { charactersReady } = await import('../src/render/characters/assets');

    await expect(charactersReady(2)).rejects.toThrow(/character preview assets failed to load/);
  });
});
