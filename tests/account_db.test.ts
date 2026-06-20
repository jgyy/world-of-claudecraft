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
  getAccountInfo, passwordHashForAccount, updatePasswordHash, deleteAllTokensForAccount,
  deactivateAccount, updateEmail,
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
      rows: [{ username: 'alice', email: 'alice@example.com', created_at: created, last_login: login, character_count: 3 }],
    } as any);

    const info = await getAccountInfo(7);

    const [sql, params] = dbMock.query.mock.calls[0];
    expect(sql).toMatch(/FROM accounts/i);
    expect(params).toEqual([7]);
    expect(info).toEqual({
      username: 'alice',
      email: 'alice@example.com',
      createdAt: '2024-01-02T03:04:05.000Z',
      lastLogin: '2024-05-06T07:08:09.000Z',
      characterCount: 3,
    });
  });

  it('keeps a null last_login as null (never-logged-in account) and email null', async () => {
    dbMock.query.mockResolvedValueOnce({
      rows: [{ username: 'bob', email: null, created_at: new Date('2024-01-01T00:00:00.000Z'), last_login: null, character_count: 0 }],
    } as any);

    const info = await getAccountInfo(8);
    expect(info?.lastLogin).toBeNull();
    expect(info?.email).toBeNull();
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

describe('updateEmail', () => {
  it('stores a trimmed address on the target row', async () => {
    dbMock.query.mockResolvedValueOnce({ rowCount: 1 } as any);
    await updateEmail(7, 'carol@example.com');
    const [sql, params] = dbMock.query.mock.calls[0];
    expect(sql).toMatch(/UPDATE accounts SET email/i);
    expect(params).toEqual([7, 'carol@example.com']);
  });

  it('clears the email when passed null', async () => {
    dbMock.query.mockResolvedValueOnce({ rowCount: 1 } as any);
    await updateEmail(7, null);
    expect(dbMock.query.mock.calls[0][1]).toEqual([7, null]);
  });
});

describe('deactivateAccount', () => {
  it('soft-deactivates the row and revokes its tokens', async () => {
    dbMock.query
      .mockResolvedValueOnce({ rowCount: 1 } as any) // UPDATE deactivated_at
      .mockResolvedValueOnce({ rowCount: 2 } as any); // DELETE tokens
    expect(await deactivateAccount(7)).toBe(true);

    const [updateSql, updateParams] = dbMock.query.mock.calls[0];
    expect(updateSql).toMatch(/UPDATE accounts SET deactivated_at = now\(\)/i);
    expect(updateSql).toMatch(/deactivated_at IS NULL/i);
    expect(updateParams).toEqual([7]);

    const [tokenSql, tokenParams] = dbMock.query.mock.calls[1];
    expect(tokenSql).toMatch(/DELETE FROM auth_tokens WHERE account_id/i);
    expect(tokenParams).toEqual([7]);
  });

  it('returns false (and skips token revocation) when nothing was deactivated', async () => {
    dbMock.query.mockResolvedValueOnce({ rowCount: 0 } as any);
    expect(await deactivateAccount(999)).toBe(false);
    expect(dbMock.query).toHaveBeenCalledTimes(1);
  });
});
