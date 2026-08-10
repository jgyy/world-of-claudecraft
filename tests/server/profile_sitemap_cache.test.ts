// Wiring pins for the sitemap character-name memo (server/profile_sitemap_cache.ts):
// the lazy singleton TTL cache over db.listCharacterNamesForSitemap. The
// primitive's full behavior matrix (single-flight, epoch bust, warn-once) is
// pinned by tests/server/cached_read.test.ts; this file pins THIS module's
// wiring of it (cold start, the TTL window, stale-serve, reset), plus an
// end-to-end proof that GET /sitemap-characters.xml (handleCharacterSitemap)
// reads through the memo instead of querying per request, while its rendered
// XML stays byte-identical to the pre-cache shape.
//
// server/db.ts builds a pg Pool at module load and throws if DATABASE_URL is
// unset; profile_sitemap_cache imports it, so set a dummy URL. The pool never
// connects: every read here goes through the injected fake.
process.env.DATABASE_URL ||= 'postgres://test:test@127.0.0.1:5433/wocc_sitemap_cache';

import type * as http from 'node:http';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { handleCharacterSitemap } from '../../server/profile_page';
import {
  readSitemapCharacterNames,
  resetSitemapCharacterCacheForTests,
  SITEMAP_CHARACTERS_TTL_MS,
  SITEMAP_MAX,
  setSitemapCharacterCacheForTests,
} from '../../server/profile_sitemap_cache';

const NAMES = ['Hilda', 'Boros', 'Nazeem'];

let nowMs = 0;
let calls = 0;
let lastLimit: number | undefined;
let fail = false;

beforeEach(() => {
  resetSitemapCharacterCacheForTests();
  nowMs = 1_000_000;
  calls = 0;
  lastLimit = undefined;
  fail = false;
  setSitemapCharacterCacheForTests({
    query: async (limit: number) => {
      calls += 1;
      lastLimit = limit;
      if (fail) throw new Error('refresh failed');
      return [...NAMES];
    },
    now: () => nowMs,
  });
});

afterEach(() => {
  resetSitemapCharacterCacheForTests();
  vi.restoreAllMocks();
});

function fakeReq(): http.IncomingMessage {
  return {
    url: '/sitemap-characters.xml',
    headers: { host: 'worldofclaudecraft.com' },
    socket: { remoteAddress: '10.1.2.3' },
  } as never;
}

interface FakeRes {
  status: number;
  headers: Record<string, string | number>;
  body: string;
}

function fakeRes(): FakeRes & http.ServerResponse {
  const fake: FakeRes = { status: 0, headers: {}, body: '' };
  return Object.assign(fake, {
    writeHead(code: number, headers?: Record<string, string | number>) {
      fake.status = code;
      if (headers) fake.headers = headers;
    },
    end(chunk?: string) {
      fake.body += chunk ?? '';
    },
  }) as unknown as FakeRes & http.ServerResponse;
}

describe('sitemap character-name cache', () => {
  it('pins the TTL: one refresh per 30 minute window', () => {
    expect(SITEMAP_CHARACTERS_TTL_MS).toBe(30 * 60_000);
  });

  it('cold start awaits exactly one refresh, at the sitemap row cap, and returns the names', async () => {
    const names = await readSitemapCharacterNames();
    expect(calls).toBe(1);
    expect(lastLimit).toBe(SITEMAP_MAX);
    expect(names).toEqual(NAMES);
    // Shared by reference across every reader in the TTL window; frozen so no
    // consumer can mutate the shared list.
    expect(Object.isFrozen(names)).toBe(true);
  });

  it('a warm hit inside the TTL serves the cached list without re-querying', async () => {
    await readSitemapCharacterNames();
    nowMs += SITEMAP_CHARACTERS_TTL_MS - 1;
    const names = await readSitemapCharacterNames();
    expect(calls).toBe(1);
    expect(names).toEqual(NAMES);
  });

  it('a read past the TTL re-queries', async () => {
    await readSitemapCharacterNames();
    nowMs += SITEMAP_CHARACTERS_TTL_MS;
    const names = await readSitemapCharacterNames();
    expect(calls).toBe(2);
    expect(names).toEqual(NAMES);
  });

  it('a failed refresh after a success keeps serving the last list', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await readSitemapCharacterNames();
    nowMs += SITEMAP_CHARACTERS_TTL_MS;
    fail = true;
    const names = await readSitemapCharacterNames();
    expect(calls).toBe(2);
    expect(names).toEqual(NAMES);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('reset drops the instance so the next read is cold', async () => {
    await readSitemapCharacterNames();
    expect(calls).toBe(1);
    resetSitemapCharacterCacheForTests();
    setSitemapCharacterCacheForTests({
      query: async (limit: number) => {
        calls += 1;
        lastLimit = limit;
        return [...NAMES];
      },
      now: () => nowMs,
    });
    const names = await readSitemapCharacterNames();
    expect(calls).toBe(2);
    expect(names).toEqual(NAMES);
  });
});

describe('GET /sitemap-characters.xml reads through the cache', () => {
  it('two requests inside the TTL cost one query and render byte-identical XML', async () => {
    const res1 = fakeRes();
    await handleCharacterSitemap(fakeReq(), res1);
    const res2 = fakeRes();
    await handleCharacterSitemap(fakeReq(), res2);

    expect(calls).toBe(1);
    expect(res1.status).toBe(200);
    expect(res1.headers['Content-Type']).toBe('application/xml; charset=utf-8');
    expect(res1.headers['Cache-Control']).toBe('public, max-age=3600');
    const expectedXml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>http://worldofclaudecraft.com/c/Hilda</loc><changefreq>daily</changefreq></url>
  <url><loc>http://worldofclaudecraft.com/c/Boros</loc><changefreq>daily</changefreq></url>
  <url><loc>http://worldofclaudecraft.com/c/Nazeem</loc><changefreq>daily</changefreq></url>
</urlset>`;
    expect(res1.body).toBe(expectedXml);
    // Same cached list served to the second request: byte-identical body.
    expect(res2.body).toBe(expectedXml);
  });

  it('a request past the TTL re-queries and still renders correctly', async () => {
    await handleCharacterSitemap(fakeReq(), fakeRes());
    expect(calls).toBe(1);
    nowMs += SITEMAP_CHARACTERS_TTL_MS;
    const res = fakeRes();
    await handleCharacterSitemap(fakeReq(), res);
    expect(calls).toBe(2);
    expect(res.body).toContain('<loc>http://worldofclaudecraft.com/c/Hilda</loc>');
  });
});
