// Persisted sha256 cache for scripts/build_media_manifest.mjs.
//
// manifestEntries() used to read and hash every media asset on every one of
// its (multiple, per build) invocations, even though the asset content
// rarely changes between runs. Media assets (GLB/textures/HDR/etc) are
// large relative to source files, so re-hashing hundreds of unchanged ones
// on `generate`, `emit`, and `prune` each build was pure waste. This module
// mirrors the node_modules/.cache/tsc pattern check:ts already uses: a small
// JSON file keyed by the asset's path relative to public/, storing the mtime
// and size the sha256 was computed against. A hit only needs a stat, never a
// re-read of file content.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

/**
 * True when a cached entry's mtime and size still match the current file
 * stat, meaning its stored sha256 can be reused without re-reading the file.
 * Pure: takes only values the caller already has from a single statSync.
 */
export function isCacheEntryFresh(entry, stat) {
  return (
    entry != null &&
    typeof entry.sha256 === 'string' &&
    entry.mtime === stat.mtimeMs &&
    entry.size === stat.size
  );
}

/** Builds the cache entry shape persisted for one file. */
export function buildCacheEntry(stat, sha256) {
  return { mtime: stat.mtimeMs, size: stat.size, sha256 };
}

/**
 * Loads a previously persisted hash cache. A missing file (first run) or a
 * corrupt/unexpected-shape one (interrupted write, format change) both yield
 * an empty cache rather than throwing: every entry just misses and gets
 * recomputed, so a bad cache file can never wrongly resurrect a stale hash.
 */
export function loadHashCache(cachePath) {
  if (!existsSync(cachePath)) return {};
  try {
    const parsed = JSON.parse(readFileSync(cachePath, 'utf8'));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

/** Persists the hash cache, creating its parent directory if needed. */
export function saveHashCache(cachePath, cache) {
  mkdirSync(path.dirname(cachePath), { recursive: true });
  writeFileSync(cachePath, JSON.stringify(cache));
}
