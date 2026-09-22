// Honing over the real online path: the hone_item frame ClientWorld emits,
// fed verbatim into the real GameServer dispatch; the attempt resolving
// SERVER-SIDE; malformed frames dropping before any sim call; the `vls` self
// scalar and the einst mirror reaching the owner; the peer eqi projection
// carrying the record (the glow's input) but never the bind; and the honed
// event's immediacy arm on the ClientWorld mirror.
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

function rig(characterId: number, name: string) {
  const server = new GameServer();
  const fc = fakeWs();
  const session = joinServer(server, fc, characterId, name);
  const pid = session.pid as number;
  server.sim.setPlayerLevel(MAX_LEVEL, pid);
  const meta = server.sim.meta(pid) as PlayerMeta;
  meta.lifetimeXp = xpToReachLevel(MAX_LEVEL + 6);
  meta.copper = PURSE;
  server.sim.addItem(SWORD, 1, pid);
  server.sim.equipItem(SWORD, pid);
  expect(meta.equipment.mainhand).toBe(SWORD);
  return { server, fc, session, pid, meta };
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

let oldWebSocket: unknown;
beforeAll(() => {
  oldWebSocket = (globalThis as { WebSocket?: unknown }).WebSocket;
  (globalThis as { WebSocket?: unknown }).WebSocket = { OPEN: 1 };
});
afterAll(() => {
  (globalThis as { WebSocket?: unknown }).WebSocket = oldWebSocket;
});

describe('the hone_item frame end to end', () => {
  it('ClientWorld emits the declared frame; the server resolves it in the sim and mirrors it back', () => {
    const { server, fc, session, pid, meta } = rig(931, 'Honer');
    const sent: Record<string, unknown>[] = [];
    const client = bareClient(pid, {
      ws: { readyState: 1, send: (raw: string) => sent.push(JSON.parse(raw)) },
    });
    client.honeItem('mainhand', 'str');
    expect(sent).toEqual([{ t: 'cmd', cmd: 'hone_item', slot: 'mainhand', stat: 'str' }]);

    const draws = drawsDuring(server, () => server.handleMessage(session, JSON.stringify(sent[0])));
    expect(draws).toBe(1);
    expect(meta.virtualLevelsSpent).toBe(1);
    expect(meta.copper).toBe(PURSE - honingCost(0).copper);
    expect(meta.equipmentInstance.mainhand?.honing).toEqual({ rank: 1, stats: { str: 1 } });
    expect(meta.equipmentInstance.mainhand?.boundTo).toBe(meta.entityId);
    expect(HEAVY_SELF_CMDS.has('hone_item')).toBe(true);
    expect(HEAVY_SELF_EVENTS.has('honed')).toBe(true);

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
    const honedEvent = fc.sent
      .filter((m) => m.t === 'events')
      .flatMap((m) => (m.list ?? []) as SimEvent[])
      .find((ev) => ev.type === 'honed');
    expect(honedEvent).toMatchObject({ slot: 'mainhand', rank: 1, landed: true, spent: 1 });
  });

  it('a malformed frame drops before the sim, and a sim-denied one spends nothing', () => {
    const { server, session, meta } = rig(932, 'Forger');
    for (const body of [
      { cmd: 'hone_item', slot: 'backpack', stat: 'str' },
      { cmd: 'hone_item', slot: 'mainhand', stat: 'armor' },
      { cmd: 'hone_item', slot: 'mainhand' },
      { cmd: 'hone_item', slot: ['mainhand'], stat: 'str' },
    ]) {
      expect(
        drawsDuring(server, () => cmd(server, session, body)),
        JSON.stringify(body),
      ).toBe(0);
    }
    meta.lifetimeXp = xpToReachLevel(MAX_LEVEL); // nothing earned past the cap
    expect(
      drawsDuring(server, () =>
        cmd(server, session, { cmd: 'hone_item', slot: 'mainhand', stat: 'str' }),
      ),
    ).toBe(0);
    expect(meta.virtualLevelsSpent).toBe(0);
    expect(meta.copper).toBe(PURSE);
    expect(meta.equipmentInstance.mainhand).toBeUndefined();
  });

  it('peers see the record on the eqi projection but never the bind', () => {
    const { server, session, pid } = rig(934, 'Shiny');
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

  it('the ClientWorld immediacy arm mirrors the ledger off the honed event', () => {
    const client = bareClient(1);
    const apply = (ev: SimEvent) =>
      (client as unknown as { applyPrestigeEvent(ev: SimEvent): void }).applyPrestigeEvent(ev);
    apply({ type: 'honed', pid: 1, slot: 'mainhand', rank: 2, landed: true, spent: 3 });
    expect(client.virtualLevelsSpent).toBe(3);
    apply({ type: 'prestige', pid: 1, rank: 4 });
    expect(client.prestigeRank).toBe(4);
    expect(client.virtualLevelsSpent).toBe(3);
  });
});
