import { beforeEach, describe, expect, it, vi } from 'vitest';

const dbMock = vi.hoisted(() => {
  process.env.DATABASE_URL ??= 'postgres://test/test';
  return { query: vi.fn() };
});

vi.mock('pg', () => ({
  Pool: vi.fn(function Pool() {
    return { query: dbMock.query };
  }),
}));

import { searchCharacters } from '../server/db';
import { SOCIAL_SCHEMA } from '../server/social_db';

beforeEach(() => {
  dbMock.query.mockReset();
});

describe('character typeahead search', () => {
  it('creates a realm-scoped lower-name prefix index', () => {
    expect(SOCIAL_SCHEMA).toContain('CREATE INDEX IF NOT EXISTS characters_realm_lower_name_prefix');
    expect(SOCIAL_SCHEMA).toContain('ON characters (realm, lower(name) text_pattern_ops)');
  });

  it('enforces case-insensitive name uniqueness to match folded lookups', () => {
    // The unique index must fold case so the DB rejects 'Bob' vs 'bob'; a
    // verbatim (realm, name) unique index would let case-collisions coexist and
    // make report-target / social name resolution ambiguous.
    expect(SOCIAL_SCHEMA).toContain('CREATE UNIQUE INDEX IF NOT EXISTS characters_realm_lower_name');
    expect(SOCIAL_SCHEMA).toContain('ON characters(realm, lower(name))');
    // the old case-sensitive unique index must be dropped, not left behind
    expect(SOCIAL_SCHEMA).toContain('DROP INDEX IF EXISTS characters_realm_name');
    expect(SOCIAL_SCHEMA).not.toContain('CREATE UNIQUE INDEX IF NOT EXISTS characters_realm_name ');
  });

  it('uses the lower-name prefix predicate and preserves wildcard escaping', async () => {
    dbMock.query.mockResolvedValueOnce({ rows: [{ name: 'Al%_', cls: 'mage', level: 12 }] });

    await expect(searchCharacters('  Al%_  ', 99)).resolves.toEqual([{ name: 'Al%_', cls: 'mage', level: 12 }]);

    const [sql, params] = dbMock.query.mock.calls[0];
    expect(sql).toContain('lower(name) LIKE lower($2)');
    expect(sql).toContain("ESCAPE '\\'");
    expect(sql).toContain('ORDER BY name LIMIT $3');
    expect(params).toEqual([expect.any(String), 'Al\\%\\_%', 20]);
  });

  it('keeps the search limit clamped to at least one', async () => {
    dbMock.query.mockResolvedValueOnce({ rows: [] });

    await searchCharacters('Bet', 0);

    expect(dbMock.query.mock.calls[0][1][2]).toBe(1);
  });
});
