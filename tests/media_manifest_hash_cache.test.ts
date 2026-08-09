// scripts/build_media_manifest.mjs used to re-read and re-sha256 every media
// asset on every invocation (generate/emit/prune each call manifestEntries()).
// This module lets it reuse a persisted hash keyed by path, mtime, and size
// instead. The behavior that matters: a stat-matching entry is trusted
// without touching file content, and anything else (missing entry, changed
// mtime or size, a corrupt cache file) falls back to a safe miss.
import { spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  buildCacheEntry,
  isCacheEntryFresh,
  loadHashCache,
  saveHashCache,
} from '../scripts/lib/media_manifest_hash_cache.mjs';

describe('isCacheEntryFresh', () => {
  const stat = { mtimeMs: 1_700_000_000_123, size: 4096 };

  it('is fresh when mtime and size both match', () => {
    const entry = buildCacheEntry(stat, 'deadbeef');
    expect(isCacheEntryFresh(entry, stat)).toBe(true);
  });

  it('misses when there is no entry', () => {
    expect(isCacheEntryFresh(undefined, stat)).toBe(false);
  });

  it('misses when the size differs (content changed, mtime coincidentally equal)', () => {
    const entry = buildCacheEntry(stat, 'deadbeef');
    expect(isCacheEntryFresh(entry, { mtimeMs: stat.mtimeMs, size: stat.size + 1 })).toBe(false);
  });

  it('misses when the mtime differs (file touched or rewritten)', () => {
    const entry = buildCacheEntry(stat, 'deadbeef');
    expect(isCacheEntryFresh(entry, { mtimeMs: stat.mtimeMs + 1, size: stat.size })).toBe(false);
  });

  it('misses when the stored sha256 is not a string (malformed entry)', () => {
    const malformed = { mtime: stat.mtimeMs, size: stat.size, sha256: 42 } as unknown as Parameters<
      typeof isCacheEntryFresh
    >[0];
    expect(isCacheEntryFresh(malformed, stat)).toBe(false);
  });
});

describe('buildCacheEntry', () => {
  it('captures mtime, size, and the given sha256', () => {
    expect(buildCacheEntry({ mtimeMs: 123, size: 9 }, 'cafebabe')).toEqual({
      mtime: 123,
      size: 9,
      sha256: 'cafebabe',
    });
  });
});

describe('loadHashCache / saveHashCache (real fs)', () => {
  let dir: string;

  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  it('round-trips a saved cache through load', () => {
    dir = mkdtempSync(path.join(tmpdir(), 'wocc-media-hash-cache-'));
    const cachePath = path.join(dir, 'nested', 'media-manifest-hash-cache.json');
    const cache = {
      'models/props/crate.glb': { mtime: 111, size: 222, sha256: 'abc123' },
    };
    saveHashCache(cachePath, cache);
    expect(existsSync(cachePath)).toBe(true);
    expect(loadHashCache(cachePath)).toEqual(cache);
  });

  it('creates any missing parent directories', () => {
    dir = mkdtempSync(path.join(tmpdir(), 'wocc-media-hash-cache-'));
    const cachePath = path.join(dir, 'a', 'b', 'c', 'cache.json');
    saveHashCache(cachePath, {});
    expect(existsSync(cachePath)).toBe(true);
  });

  it('returns an empty cache for a missing file (first run)', () => {
    dir = mkdtempSync(path.join(tmpdir(), 'wocc-media-hash-cache-'));
    expect(loadHashCache(path.join(dir, 'does-not-exist.json'))).toEqual({});
  });

  it('returns an empty cache for a corrupt file instead of throwing', () => {
    dir = mkdtempSync(path.join(tmpdir(), 'wocc-media-hash-cache-'));
    const cachePath = path.join(dir, 'cache.json');
    writeFileSync(cachePath, '{ not valid json');
    expect(loadHashCache(cachePath)).toEqual({});
  });

  it('returns an empty cache when the file holds a JSON array, not an object', () => {
    dir = mkdtempSync(path.join(tmpdir(), 'wocc-media-hash-cache-'));
    const cachePath = path.join(dir, 'cache.json');
    writeFileSync(cachePath, '[1, 2, 3]');
    expect(loadHashCache(cachePath)).toEqual({});
  });

  it('persists as plain JSON readable by a fresh parse', () => {
    dir = mkdtempSync(path.join(tmpdir(), 'wocc-media-hash-cache-'));
    const cachePath = path.join(dir, 'cache.json');
    const cache = { 'vfx/spark.png': { mtime: 1, size: 2, sha256: 'aa' } };
    saveHashCache(cachePath, cache);
    expect(JSON.parse(readFileSync(cachePath, 'utf8'))).toEqual(cache);
  });
});

// Black-box wiring check: runs the real scripts/build_media_manifest.mjs
// `generate` command against a small fixture tree, so it exercises the actual
// cache read/write path build_media_manifest.mjs takes, not just the pure
// helpers above.
describe('build_media_manifest.mjs generate (cache wiring)', () => {
  const repoDir = path.join(__dirname, '..');
  const scriptPath = path.join(repoDir, 'scripts/build_media_manifest.mjs');
  let dir: string;

  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  function runGenerate(cwd: string) {
    return spawnSync(process.execPath, [scriptPath, 'generate'], {
      cwd,
      encoding: 'utf8',
      timeout: 20_000,
    });
  }

  function cachePathFor(cwd: string) {
    return path.join(cwd, 'node_modules/.cache/media-manifest-hash-cache.json');
  }

  function manifestPathFor(cwd: string) {
    return path.join(cwd, 'src/render/assets/manifest.generated.ts');
  }

  it('writes a cache entry keyed by the relative asset path after generate', () => {
    dir = mkdtempSync(path.join(tmpdir(), 'wocc-media-manifest-gen-'));
    mkdirSync(path.join(dir, 'public/models'), { recursive: true });
    writeFileSync(path.join(dir, 'public/models/crate.glb'), 'fixture content v1');

    const res = runGenerate(dir);
    expect(res.status, res.stderr).toBe(0);

    const cache = JSON.parse(readFileSync(cachePathFor(dir), 'utf8'));
    expect(Object.keys(cache)).toEqual(['models/crate.glb']);
    expect(typeof cache['models/crate.glb'].sha256).toBe('string');
    expect(cache['models/crate.glb'].size).toBe(
      statSync(path.join(dir, 'public/models/crate.glb')).size,
    );
  });

  it('trusts a stat-matching cached sha256 rather than the real file content', () => {
    // Proves reuse, not just presence: plant a WRONG sha256 against the file's
    // real mtime/size and confirm the emitted manifest carries that wrong
    // value. If generate ever stopped consulting the cache, this would emit
    // the file's true hash instead and the assertion would catch it.
    dir = mkdtempSync(path.join(tmpdir(), 'wocc-media-manifest-gen-'));
    mkdirSync(path.join(dir, 'public/models'), { recursive: true });
    const assetPath = path.join(dir, 'public/models/crate.glb');
    writeFileSync(assetPath, 'fixture content v1');

    const first = runGenerate(dir);
    expect(first.status, first.stderr).toBe(0);

    const stat = statSync(assetPath);
    const poisoned = {
      'models/crate.glb': { mtime: stat.mtimeMs, size: stat.size, sha256: 'poisoned0000' },
    };
    writeFileSync(cachePathFor(dir), JSON.stringify(poisoned));

    const second = runGenerate(dir);
    expect(second.status, second.stderr).toBe(0);

    const manifestSrc = readFileSync(manifestPathFor(dir), 'utf8');
    expect(manifestSrc).toContain('/media/models/crate.poisoned0000.glb');
  });

  it('recomputes when the file content (and so mtime/size) changes', () => {
    dir = mkdtempSync(path.join(tmpdir(), 'wocc-media-manifest-gen-'));
    mkdirSync(path.join(dir, 'public/models'), { recursive: true });
    const assetPath = path.join(dir, 'public/models/crate.glb');
    writeFileSync(assetPath, 'fixture content v1');

    const first = runGenerate(dir);
    expect(first.status, first.stderr).toBe(0);
    const firstManifest = readFileSync(manifestPathFor(dir), 'utf8');

    writeFileSync(assetPath, 'fixture content v2, a different length');
    const second = runGenerate(dir);
    expect(second.status, second.stderr).toBe(0);
    const secondManifest = readFileSync(manifestPathFor(dir), 'utf8');

    expect(secondManifest).not.toBe(firstManifest);
  });
});
