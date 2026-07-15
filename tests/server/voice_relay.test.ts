import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock the db layer so no Postgres is needed: the voice relay gate under test
// lives entirely in the server's in-memory session/dispatch routing.
vi.mock('../../server/db', () => ({
  pool: { query: vi.fn(async () => ({ rows: [] })) },
  saveCharacterState: vi.fn(async () => {}),
  openPlaySession: vi.fn(async () => 1),
  touchCharacterLogin: vi.fn(async () => {}),
  closePlaySession: vi.fn(async () => {}),
  insertChatLogs: vi.fn(async () => {}),
  walletForAccount: vi.fn(async () => null),
  markAccountQuestComplete: vi.fn(async () => ({ completedQuestIds: [], mechChromaIds: [] })),
  grantAccountMechChroma: vi.fn(async () => ({ completedQuestIds: [], mechChromaIds: [] })),
}));

import { type ClientSession, GameServer } from '../../server/game';
import type { PlayerClass } from '../../src/sim/types';

interface FakeClient {
  sent: any[];
  ws: any;
}

function fakeWs(): FakeClient {
  const sent: any[] = [];
  return { sent, ws: { readyState: 1, send: (payload: string) => sent.push(JSON.parse(payload)) } };
}

function joinServer(
  server: GameServer,
  fc: FakeClient,
  characterId: number,
  name: string,
  cls: PlayerClass = 'warrior',
): ClientSession {
  const session = server.join(fc.ws, characterId, characterId, name, cls, null);
  if ('error' in session) throw new Error(session.error);
  session.blockListLoaded = true;
  return session;
}

function send(server: GameServer, session: ClientSession, msg: Record<string, unknown>): void {
  server.handleMessage(session, JSON.stringify(msg));
}

function voiceFrames(fc: FakeClient, type: string): any[] {
  return fc.sent.filter((m) => m.t === type);
}

function colocate(server: GameServer, aPid: number, bPid: number): void {
  const a = server.sim.entities.get(aPid);
  const b = server.sim.entities.get(bPid);
  if (!a || !b) throw new Error('entity missing');
  b.pos.x = a.pos.x;
  b.pos.y = a.pos.y;
  b.pos.z = a.pos.z;
  b.prevPos = { ...b.pos };
}

function optIn(server: GameServer, session: ClientSession): void {
  send(server, session, { t: 'voiceoptin', on: true });
  (server as any).broadcastVoicePeers();
}

function setup() {
  const server = new GameServer();
  const fcA = fakeWs();
  const a = joinServer(server, fcA, 1, 'Aleph');
  const fcB = fakeWs();
  const b = joinServer(server, fcB, 2, 'Bet');
  colocate(server, a.pid, b.pid);
  return { server, fcA, a, fcB, b };
}

describe('voice relay: mutual pairing gate', () => {
  it('pairs two opted-in colocated players and relays signaling between them', () => {
    const { server, a, fcB, b } = setup();
    optIn(server, a);
    optIn(server, b);

    expect(a.voicePeerIds.has(b.pid)).toBe(true);
    expect(b.voicePeerIds.has(a.pid)).toBe(true);

    send(server, a, { t: 'voiceoffer', toPid: b.pid, payload: { sdp: 'x' } });
    const offers = voiceFrames(fcB, 'voiceoffer');
    expect(offers).toHaveLength(1);
    expect(offers[0].fromPid).toBe(a.pid);
  });

  it('rejects relay to an unpaired toPid', () => {
    const { server, fcB, a, b } = setup();
    // b never opts in, so a.voicePeerIds never contains b.pid.
    optIn(server, a);
    expect(a.voicePeerIds.has(b.pid)).toBe(false);

    send(server, a, { t: 'voiceoffer', toPid: b.pid, payload: { sdp: 'x' } });
    expect(voiceFrames(fcB, 'voiceoffer')).toHaveLength(0);
  });

  it('rejects relay when the target has since opted out (asymmetric membership)', () => {
    const { server, fcB, a, b } = setup();
    optIn(server, a);
    optIn(server, b);
    expect(a.voicePeerIds.has(b.pid)).toBe(true);

    // b opts out; its own voicePeerIds is cleared immediately, but a's stale
    // membership (until the next broadcast tick) must not be enough to relay.
    send(server, b, { t: 'voiceoptin', on: false });
    send(server, a, { t: 'voiceoffer', toPid: b.pid, payload: { sdp: 'x' } });
    expect(voiceFrames(fcB, 'voiceoffer')).toHaveLength(0);
  });

  it('drops an oversize payload above the 8 KiB cap', () => {
    const { server, fcB, a, b } = setup();
    optIn(server, a);
    optIn(server, b);

    const huge = 'x'.repeat(9000);
    send(server, a, { t: 'voiceoffer', toPid: b.pid, payload: { sdp: huge } });
    expect(voiceFrames(fcB, 'voiceoffer')).toHaveLength(0);

    // A payload under the cap from the same pair still goes through.
    send(server, a, { t: 'voiceoffer', toPid: b.pid, payload: { sdp: 'small' } });
    expect(voiceFrames(fcB, 'voiceoffer')).toHaveLength(1);
  });
});

describe('voice pairing and relay: block list', () => {
  it('never pairs a blocked pair, even proximate and both opted in', () => {
    const { server, a, b } = setup();
    b.blockedIds = new Set([a.characterId]);
    optIn(server, a);
    optIn(server, b);

    expect(a.voicePeerIds.has(b.pid)).toBe(false);
    expect(b.voicePeerIds.has(a.pid)).toBe(false);
  });

  it('rejects relay directly when the sender is blocked by the target', () => {
    const { server, fcB, a, b } = setup();
    optIn(server, a);
    optIn(server, b);
    expect(a.voicePeerIds.has(b.pid)).toBe(true);

    // Block lands after pairing; the relay gate re-checks voicePeerIds, which the
    // very next broadcast clears, but the relay itself must not depend on timing.
    b.blockedIds = new Set([a.characterId]);
    (server as any).broadcastVoicePeers();
    send(server, a, { t: 'voiceoffer', toPid: b.pid, payload: { sdp: 'x' } });
    expect(voiceFrames(fcB, 'voiceoffer')).toHaveLength(0);
  });
});

describe('voice opt-in and relay: jail and chat-mute gating', () => {
  it('refuses to opt a jailed session into voice', () => {
    const { server, a } = setup();
    a.jailed = { until: Date.now() + 60_000, returnPos: { x: 0, y: 0, z: 0 } } as any;

    send(server, a, { t: 'voiceoptin', on: true });
    expect(a.voiceOptIn).toBe(false);
  });

  it('refuses to opt a chat-muted session into voice', () => {
    const { server, a } = setup();
    a.chatMutedUntil = Date.now() + 60_000;

    send(server, a, { t: 'voiceoptin', on: true });
    expect(a.voiceOptIn).toBe(false);
  });

  it('drops relay from a jailed session even if voicePeerIds is stale', () => {
    const { server, fcB, a, b } = setup();
    optIn(server, a);
    optIn(server, b);
    expect(a.voicePeerIds.has(b.pid)).toBe(true);

    a.jailed = { until: Date.now() + 60_000, returnPos: { x: 0, y: 0, z: 0 } } as any;
    send(server, a, { t: 'voiceoffer', toPid: b.pid, payload: { sdp: 'x' } });
    expect(voiceFrames(fcB, 'voiceoffer')).toHaveLength(0);
  });

  it('excludes a jailed or muted session from broadcastVoicePeers pairing', () => {
    const { server, a, b } = setup();
    optIn(server, a);
    a.jailed = { until: Date.now() + 60_000, returnPos: { x: 0, y: 0, z: 0 } } as any;
    optIn(server, b);

    expect(a.voicePeerIds.has(b.pid)).toBe(false);
    expect(b.voicePeerIds.has(a.pid)).toBe(false);
  });
});
