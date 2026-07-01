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
import { GUILD_MESSAGE_MAX } from '../server/social';
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

  // guild/officer chat routes body = /^\/(?:g|gu|guild)\s+([\s\S]+)$/ group 1,
  // trimmed and capped at GUILD_MESSAGE_MAX (server/social.ts guildChat), not a
  // raw-position slice of the frame. A raw-position cap can be defeated by
  // padding the command with whitespace past the cap, since the stripped
  // whitespace length is unbounded: the slur then lands outside the scanned
  // slice while still being exactly what guildChat delivers.
  it('flags a /g message whose slur is pushed past the raw cap by padding', () => {
    const server = serverWithHardWord();
    const session = joinSession(server);
    const padded = `/g${' '.repeat(MAX_CHAT_MESSAGE_LEN + 10)}${HARD}`;
    expect(enforce(server, session, padded)).toBe(true);
  });

  it('flags an /o message whose slur is pushed past the raw cap by padding', () => {
    const server = serverWithHardWord();
    const session = joinSession(server);
    const padded = `/o${' '.repeat(MAX_CHAT_MESSAGE_LEN + 10)}${HARD}`;
    expect(enforce(server, session, padded)).toBe(true);
  });

  it('does NOT flag a /g slur past the routed guild body cap', () => {
    const server = serverWithHardWord();
    const session = joinSession(server);
    // The slur sits after GUILD_MESSAGE_MAX chars of the routed body, so it is
    // sliced off before guildChat delivers the message; the filter must not
    // burn a scan on it either.
    const padded = `/g ${'a'.repeat(GUILD_MESSAGE_MAX + 5)} ${HARD}`;
    expect(enforce(server, session, padded)).toBe(false);
  });
});
