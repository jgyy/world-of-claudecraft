// Demand-driven TTL memo over db.listCharacterNamesForSitemap. Every crawler
// hit on GET /sitemap-characters.xml used to run a fresh sorted scan of up to
// SITEMAP_MAX rows, uncached: a viewer-identical read, exactly the case the
// "Hot paths" section of server/CLAUDE.md says must never ride a per-request
// pool.query. This memo bounds it to one refresh per TTL window, shared by
// every crawler hit inside the window.
//
// The response itself already promises Cache-Control: public, max-age=3600
// (profile_page.ts), so a server-side TTL well under an hour never makes the
// served list staler than what crawlers are already told to expect.
//
// Not bust-wired: a renamed or newly created character simply waits out the
// TTL before it appears or disappears from the crawled sitemap, a cosmetic
// discoverability delay only. The profile page and character data themselves
// are always read live, so this never widens a moderation-visibility gap.
//
// The single-flight, stale-serve, and bust semantics come from the
// cached_read primitive (server/cached_read.ts, pinned by
// tests/server/cached_read.test.ts); this module only wires it to the
// sitemap query at a fixed TTL, the same shape as admin_overview_cache.ts.

import { type CachedRead, createCachedRead } from './cached_read';
import { listCharacterNamesForSitemap } from './db';

/** Sitemap protocol per-file URL cap; also the row limit of the cached query. */
export const SITEMAP_MAX = 50000;

/** How long one character-name list is served before the next re-query. */
export const SITEMAP_CHARACTERS_TTL_MS = 30 * 60_000;

// The refresh + clock the singleton is built with. Production never touches
// these (the real listCharacterNamesForSitemap and Date.now); tests inject
// fakes below.
let queryFn: (limit: number) => Promise<string[]> = listCharacterNamesForSitemap;
let nowFn: (() => number) | undefined;

// The module-level singleton, built LAZILY on first read so a test seam
// installed before first use takes effect (and so importing this module under
// a mocked db module never touches the real query).
let cache: CachedRead<readonly string[]> | null = null;

/** The cached sitemap character names: at most one query per TTL window. */
export function readSitemapCharacterNames(): Promise<readonly string[]> {
  // One name list is served by reference to every reader in a TTL window;
  // freeze it so no consumer can mutate the shared array.
  cache ??= createCachedRead(async () => Object.freeze(await queryFn(SITEMAP_MAX)), {
    ttlMs: SITEMAP_CHARACTERS_TTL_MS,
    now: nowFn,
  });
  return cache.read();
}

/**
 * Inject a fake query and/or clock into the singleton (test-only). Drops the
 * current cache instance so the next read is cold under the injected fakes.
 */
export function setSitemapCharacterCacheForTests(opts: {
  query?: (limit: number) => Promise<string[]>;
  now?: () => number;
}): void {
  if (opts.query) queryFn = opts.query;
  if (opts.now) nowFn = opts.now;
  cache = null;
}

/**
 * Restore the real listCharacterNamesForSitemap + Date.now and drop the cache
 * instance so the next read is cold (test-only).
 */
export function resetSitemapCharacterCacheForTests(): void {
  queryFn = listCharacterNamesForSitemap;
  nowFn = undefined;
  cache = null;
}
