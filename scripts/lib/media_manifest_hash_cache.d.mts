export interface MediaHashCacheEntry {
  mtime: number;
  size: number;
  sha256: string;
}

export type MediaHashCache = Record<string, MediaHashCacheEntry>;

export declare function isCacheEntryFresh(
  entry: MediaHashCacheEntry | undefined,
  stat: { mtimeMs: number; size: number },
): boolean;

export declare function buildCacheEntry(
  stat: { mtimeMs: number; size: number },
  sha256: string,
): MediaHashCacheEntry;

export declare function loadHashCache(cachePath: string): MediaHashCache;

export declare function saveHashCache(cachePath: string, cache: MediaHashCache): void;
