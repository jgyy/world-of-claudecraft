// Honing over the real online path: the hone_item frame ClientWorld emits,
// fed verbatim into the real GameServer dispatch; the attempt resolving
// SERVER-SIDE (the sim spends the ledger and the purse and mutates the worn
// copy, never the client); the malformed-frame matrix dropping before any sim
// call; the `vls` self scalar and the einst mirror reaching the client on the
// next snapshot; the peer eqi projection carrying the record (the glow's
// input); and the honed event's immediacy arm on the ClientWorld mirror.
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('../server/db', () => ({
  pool: { query: vi.fn(async () => ({ rows: [] })) },
  saveCharacterState: vi.fn(async () => {}),
  loadGuildBankRow: vi.fn(async () => null),
  saveCharacterAndMarketState: vi.fn(async () => {}),
  openPlaySession: vi.fn(async () => 1),
  touchCharacterLogin: vi.fn(async () => {}),
  closePlaySession: vi.fn(async () => {}),
  insertChatLogs: vi.fn(async () => {}),
  walletForAccount: vi.fn(async () => null),
  loadAccountFlair: vi.fn(async () => ({ ai: false, streamer: false, links: {} })),
  markAccountQuestComplete: vi.fn(async () => ({ completedQuestIds: [], mechChromaIds: [] })),
  grantAccountMechChroma: vi.fn(async () => ({ completedQuestIds: [], mechChromaIds: [] })),
  setAccountWeaponSkinLoadout: vi.fn(async () => ({
    completedQuestIds: [],
    mechChromaIds: [],
    weaponSkinIds: [],
    weaponSkinLoadout: {},
  })),
}));

import { type ClientSession, GameServer } from '../server/game';
import { HEAVY_SELF_CMDS, HEAVY_SELF_EVENTS } from '../server/heavy_self';
import type { ClientWorld } from '../src/net/online';
import { honingCost } from '../src/sim/progression/honing_policy';
import type { PlayerMeta } from '../src/sim/sim';
import {
  type ItemInstancePayload,
  MAX_LEVEL,
  type SimEvent,
  xpToReachLevel,
} from '../src/sim/types';
import { bareClient, broadcast, fakeWs, joinServer, lastSnap } from './helpers/bare_client';

const SWORD = 'eastbrook_arming_sword';
const PURSE = 100 * 10_000;

function serverMeta(server: GameServer, pid: number): PlayerMeta {
  const meta = server.sim.meta(pid);
  if (!meta) throw new Error(`no meta for pid ${pid}`);
  return meta;
}

/** A level-cap character with six unspent virtual levels, a full purse, and
 *  the plain sword worn, so no arm below can deny for want of anything but
 *  what it tests. */
function seedHoner(server: GameServer, pid: number): void {
  server.sim.setPlayerLevel(MAX_LEVEL, pid);
  const meta = serverMeta(server, pid);
  meta.lifetimeXp = xpToReachLevel(MAX_LEVEL + 6);
  meta.copper = PURSE;
  server.sim.addItem(SWORD, 1, pid);
  server.sim.equipItem(SWORD, pid);
  expect(meta.equipment.mainhand).toBe(SWORD);
}

function cmd(server: GameServer, session: ClientSession, body: Record<string, unknown>): void {
  server.handleMessage(session, JSON.stringify({ t: 'cmd', ...body }));
}

function drawsDuring(server: GameServer, run: () => void): number {
  let draws = 0;
  server.sim.rng.setObserver(() => {
    draws += 1;
  });
  try {
    run();
  } finally {
    server.sim.rng.setObserver(null);
  }
  return draws;
}

function sendingClient(pid: number): { client: ClientWorld; sent: Record<string, unknown>[] } {
  const sent: Record<string, unknown>[] = [];
  const client = bareClient(pid, {
    ws: { readyState: 1, send: (raw: string) => sent.push(JSON.parse(raw)) },
  });
  return { client, sent };
}

let oldWebSocket: unknown;
beforeAll(() => {
  oldWebSocket = (globalThis as { WebSocket?: unknown }).WebSocket;
  (globalThis as { WebSocket?: unknown }).WebSocket = { OPEN: 1 };
});
afterAll(() => {
  (globalThis as { WebSocket?: unknown }).WebSocket = oldWebSocket;
});

describe('the hone_item frame end to end', () => {
  it('ClientWorld emits the declared frame and the server resolves it in the sim', () => {
    const server = new GameServer();
    const fc = fakeWs();
    const session = joinServer(server, fc, 931, 'Honer');
    const pid = session.pid as number;
    seedHoner(server, pid);
    const meta = serverMeta(server, pid);

    const { client, sent } = sendingClient(pid);
    client.honeItem('mainhand', 'str');
    expect(sent).toEqual([{ t: 'cmd', cmd: 'hone_item', slot: 'mainhand', stat: 'str' }]);

    const draws = drawsDuring(server, () => server.handleMessage(session, JSON.stringify(sent[0])));
    expect(draws).toBe(1);
    expect(meta.virtualLevelsSpent).toBe(1);
    expect(meta.copper).toBe(PURSE - honingCost(0).copper);
    expect(meta.equipmentInstance.mainhand?.honing).toEqual({ rank: 1, stats: { str: 1 } });
    expect(meta.equipmentInstance.mainhand?.boundTo).toBe(meta.entityId);
    // the command is a heavy-self member, and the honed event too
    expect(HEAVY_SELF_CMDS.has('hone_item')).toBe(true);
    expect(HEAVY_SELF_EVENTS.has('honed')).toBe(true);

    // The next snapshot carries the ledger scalar and the mutated worn copy to
    // the owner's mirror, and the honed event reaches the session (routed
    // without a tick, so the world clock stays held).
    (server as unknown as { routeEvents(e: SimEvent[]): void }).routeEvents(
      server.sim.drainEvents(),
    );
    broadcast(server);
    const snap = lastSnap(fc.sent);
    expect(snap?.self?.vls).toBe(1);
    const mirror = bareClient(pid);
    (mirror as unknown as { applySnapshot(s: unknown): void }).applySnapshot(snap);
    expect(mirror.virtualLevelsSpent).toBe(1);
    expect(mirror.equipmentInstances.mainhand?.honing).toEqual({ rank: 1, stats: { str: 1 } });
    // the private bind never rides the self einst mirror's public twin on peers
    const honedEvent = fc.sent
      .filter((m) => m.t === 'events')
      .flatMap((m) => (m.list ?? []) as SimEvent[])
      .find((ev) => ev.type === 'honed');
    expect(honedEvent).toMatchObject({ slot: 'mainhand', rank: 1, landed: true, spent: 1 });
  });

  it('a malformed frame drops before the sim: no draw, no spend, no payload', () => {
    const server = new GameServer();
    const fc = fakeWs();
    const session = joinServer(server, fc, 932, 'Forger');
    const pid = session.pid as number;
    seedHoner(server, pid);
    const meta = serverMeta(server, pid);
    for (const body of [
      { cmd: 'hone_item', slot: 'backpack', stat: 'str' },
      { cmd: 'hone_item', slot: 'mainhand', stat: 'armor' },
      { cmd: 'hone_item', slot: 'mainhand' },
      { cmd: 'hone_item', stat: 'str' },
      { cmd: 'hone_item', slot: ['mainhand'], stat: 'str' },
    ]) {
      const draws = drawsDuring(server, () => cmd(server, session, body));
      expect(draws, JSON.stringify(body)).toBe(0);
    }
    expect(meta.virtualLevelsSpent).toBe(0);
    expect(meta.copper).toBe(PURSE);
    expect(meta.equipmentInstance.mainhand).toBeUndefined();
  });

  it('a well-formed frame the sim denies spends nothing (the ledger gate is authoritative)', () => {
    const server = new GameServer();
    const fc = fakeWs();
    const session = joinServer(server, fc, 933, 'Broke');
    const pid = session.pid as number;
    seedHoner(server, pid);
    const meta = serverMeta(server, pid);
    meta.lifetimeXp = xpToReachLevel(MAX_LEVEL); // nothing earned past the cap
    const draws = drawsDuring(server, () =>
      cmd(server, session, { cmd: 'hone_item', slot: 'mainhand', stat: 'str' }),
    );
    expect(draws).toBe(0);
    expect(meta.virtualLevelsSpent).toBe(0);
    expect(meta.copper).toBe(PURSE);
    expect(meta.equipmentInstance.mainhand).toBeUndefined();
  });

  it('peers see the record on the eqi projection (the glow input) but never the bind', () => {
    const server = new GameServer();
    const fc = fakeWs();
    const session = joinServer(server, fc, 934, 'Shiny');
    const pid = session.pid as number;
    seedHoner(server, pid);
    cmd(server, session, { cmd: 'hone_item', slot: 'mainhand', stat: 'agi' });
    const peerWs = fakeWs();
    const peer = joinServer(server, peerWs, 935, 'Watcher');
    broadcast(server);
    const snap = lastSnap(peerWs.sent) as {
      ents?: { id: number; eqi?: Record<string, ItemInstancePayload> }[];
    } | null;
    const shiny = (snap?.ents ?? []).find((e) => e.id === pid);
    expect(peer.pid).not.toBe(pid);
    expect(shiny?.eqi?.mainhand?.honing).toEqual({ rank: 1, stats: { agi: 1 } });
    expect(shiny?.eqi?.mainhand?.boundTo).toBeUndefined();
  });
});

describe('the ClientWorld immediacy arm', () => {
  it('mirrors the ledger off the honed event before the next snapshot lands', () => {
    const client = bareClient(1);
    expect(client.virtualLevelsSpent).toBe(0);
    (client as unknown as { applyPrestigeEvent(ev: SimEvent): void }).applyPrestigeEvent({
      type: 'honed',
      pid: 1,
      slot: 'mainhand',
      rank: 2,
      landed: true,
      spent: 3,
    });
    expect(client.virtualLevelsSpent).toBe(3);
    (client as unknown as { applyPrestigeEvent(ev: SimEvent): void }).applyPrestigeEvent({
      type: 'prestige',
      pid: 1,
      rank: 4,
    });
    expect(client.prestigeRank).toBe(4);
    expect(client.virtualLevelsSpent).toBe(3);
  });
});
