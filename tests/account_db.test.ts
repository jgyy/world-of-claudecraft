import { beforeEach, describe, expect, it, vi } from 'vitest';

// db.ts builds a pg Pool and requires DATABASE_URL at import time; stub both so
// the module loads and every query goes through a spy we can assert against.
const dbMock = vi.hoisted(() => ({ query: vi.fn(), connect: vi.fn() }));
vi.hoisted(() => {
  process.env.DATABASE_URL = 'postgres://test/test';
});
vi.mock('pg', () => ({
  Pool: function Pool() {
    return { query: dbMock.query, connect: dbMock.connect };
  },
}));

import {
  getAccountInfo, passwordHashForAccount, updatePasswordHash, deleteAllTokensForAccount, deleteAccount,
} from '../server/db';

beforeEach(() => {
  dbMock.query.mockReset();
  dbMock.connect.mockReset();
});

describe('getAccountInfo', () => {
  it('returns a normalized summary with the character count and ISO dates', async () => {
    const created = new Date('2024-01-02T03:04:05.000Z');
    const login = new Date('2024-05-06T07:08:09.000Z');
    dbMock.query.mockResolvedValueOnce({
      rows: [{ username: 'alice', created_at: created, last_login: login, character_count: 3 }],
    } as any);

    const info = await getAccountInfo(7);

    const [sql, params] = dbMock.query.mock.calls[0];
    expect(sql).toMatch(/FROM accounts/i);
    expect(params).toEqual([7]);
    expect(info).toEqual({
      username: 'alice',
      createdAt: '2024-01-02T03:04:05.000Z',
      lastLogin: '2024-05-06T07:08:09.000Z',
      characterCount: 3,
    });
  });

  it('keeps a null last_login as null (never-logged-in account)', async () => {
    dbMock.query.mockResolvedValueOnce({
      rows: [{ username: 'bob', created_at: new Date('2024-01-01T00:00:00.000Z'), last_login: null, character_count: 0 }],
    } as any);

    const info = await getAccountInfo(8);
    expect(info?.lastLogin).toBeNull();
    expect(info?.characterCount).toBe(0);
  });

  it('returns null when the account does not exist', async () => {
    dbMock.query.mockResolvedValueOnce({ rows: [] } as any);
    expect(await getAccountInfo(999)).toBeNull();
  });
});

describe('passwordHashForAccount', () => {
  it('fetches the stored hash for re-verification', async () => {
    dbMock.query.mockResolvedValueOnce({ rows: [{ password_hash: 'salt:key' }] } as any);
    expect(await passwordHashForAccount(7)).toBe('salt:key');
    const [sql, params] = dbMock.query.mock.calls[0];
    expect(sql).toMatch(/password_hash/i);
    expect(params).toEqual([7]);
  });

  it('returns null when the account is gone', async () => {
    dbMock.query.mockResolvedValueOnce({ rows: [] } as any);
    expect(await passwordHashForAccount(7)).toBeNull();
  });
});

describe('updatePasswordHash', () => {
  it('updates only the target account row', async () => {
    dbMock.query.mockResolvedValueOnce({ rowCount: 1 } as any);
    await updatePasswordHash(7, 'newsalt:newkey');
    const [sql, params] = dbMock.query.mock.calls[0];
    expect(sql).toMatch(/UPDATE accounts SET password_hash/i);
    expect(params).toEqual([7, 'newsalt:newkey']);
  });
});

describe('deleteAllTokensForAccount', () => {
  it('revokes every bearer token for the account', async () => {
    dbMock.query.mockResolvedValueOnce({ rowCount: 4 } as any);
    await deleteAllTokensForAccount(7);
    const [sql, params] = dbMock.query.mock.calls[0];
    expect(sql).toMatch(/DELETE FROM auth_tokens WHERE account_id/i);
    expect(params).toEqual([7]);
  });
});

describe('deleteAccount', () => {
  it('deletes the account and reports whether a row was removed', async () => {
    dbMock.query.mockResolvedValueOnce({ rowCount: 1 } as any);
    expect(await deleteAccount(7)).toBe(true);
    const [sql, params] = dbMock.query.mock.calls[0];
    expect(sql).toMatch(/DELETE FROM accounts WHERE id/i);
    expect(params).toEqual([7]);

    dbMock.query.mockResolvedValueOnce({ rowCount: 0 } as any);
    expect(await deleteAccount(999)).toBe(false);
  });
});
