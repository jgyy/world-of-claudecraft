import { describe, expect, it, vi } from 'vitest';

// The server only ever routes/stores the first MAX_CHAT_MESSAGE_LEN chars of a
// chat message, but the WS frame can be up to maxPayload (16 KiB). The hard-word
// filter must not scan past that cap: doing so burns ~64-170x CPU on bytes that
// are never delivered, and would punitively mute a sender for a slur that is
// sliced off before anyone sees it.

vi.mock('../server/db', () => ({
  pool: { query: vi.fn(async () => ({ rows: [] })) },
  saveCharacterState: vi.fn(async () => {}),
  openPlaySession: vi.fn(async () => 1),
  closePlaySession: vi.fn(async () => {}),
  insertChatLogs: vi.fn(async () => {}),
}));

import { DEFAULT_ESCALATION } from '../server/chat_filter';
import { type ClientSession, GameServer } from '../server/game';
import { MAX_CHAT_MESSAGE_LEN } from '../src/sim/sim';

const HARD = 'zzslur';

function serverWithHardWord(): GameServer {
  const server = new GameServer();
  server.chatFilter.load({ soft: [], hard: [HARD], config: DEFAULT_ESCALATION });
  return server;
}

function joinSession(server: GameServer): ClientSession {
  const ws = { readyState: 1, send: vi.fn(), close: vi.fn() } as any;
  const result = server.join(ws, 11, 101, 'Talker', 'warrior', null);
  if ('error' in result) throw new Error(result.error);
  return result;
}

function enforce(server: GameServer, session: ClientSession, text: string): boolean {
  return (server as any).enforceChatPolicy(session, text);
}

describe('chat policy cap (server scans at most the routed slice)', () => {
  it('flags a hard word that lands within the routed slice', () => {
    const server = serverWithHardWord();
    const session = joinSession(server);
    expect(enforce(server, session, `hey ${HARD} there`)).toBe(true);
  });

  it('does NOT flag a hard word that only appears past the routed cap', () => {
    const server = serverWithHardWord();
    const session = joinSession(server);
    // Padding longer than the cap, with the slur only after it: this slur is
    // sliced off before delivery, so it must neither mute nor cost a full scan.
    const text = `${'a'.repeat(MAX_CHAT_MESSAGE_LEN + 50)} ${HARD}`;
    expect(enforce(server, session, text)).toBe(false);
  });

  it('still flags a hard word sitting exactly at the cap boundary', () => {
    const server = serverWithHardWord();
    const session = joinSession(server);
    // Slur ends right at the cap (fits within the routed slice).
    const pad = 'a '.repeat(10); // tokens kept short so the slur stays whole
    const text = `${pad}${HARD}`.slice(0, MAX_CHAT_MESSAGE_LEN);
    expect(enforce(server, session, text)).toBe(true);
  });
});
