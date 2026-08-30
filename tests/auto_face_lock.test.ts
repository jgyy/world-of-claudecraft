// The Y-key auto-face lock toggle (src/sim/auto_face_lock.ts + the
// toggle_auto_face_lock wire command): default-on toggle and the entity-wire
// `afu` bit end to end (server encode -> ClientWorld decode). Unlike
// weaponStowed/helmHidden, the wire polarity is INVERTED: the default is
// locked/on, so only the unlocked deviation rides the wire (see
// tests/weapon_stow.test.ts for the absent-means-drawn sibling pattern).
// Not persisted through character save (unlike weaponStowed): a per-session
// combat preference, the stopAutoAttackOnTargetSwitch precedent, not a
// standing wardrobe choice.
import { describe, expect, it, vi } from 'vitest';

// Mock the db layer so no Postgres is needed; wire/dispatch logic is under test.
vi.mock('../server/db', () => ({
  pool: { query: vi.fn(async () => ({ rows: [] })) },
  saveCharacterState: vi.fn(async () => {}),
  saveCharacterAndMarketState: vi.fn(async () => {}),
  saveMarketState: vi.fn(async () => {}),
  saveMailState: vi.fn(async () => {}),
  loadMarketState: vi.fn(async () => null),
  loadMailState: vi.fn(async () => null),
  openPlaySession: vi.fn(async () => 1),
  touchCharacterLogin: vi.fn(async () => {}),
  closePlaySession: vi.fn(async () => {}),
  insertChatLogs: vi.fn(async () => {}),
  walletForAccount: vi.fn(async () => null),
  markAccountQuestComplete: vi.fn(async () => ({ completedQuestIds: [], mechChromaIds: [] })),
  grantAccountMechChroma: vi.fn(async () => ({ completedQuestIds: [], mechChromaIds: [] })),
  revokeAccountMechChroma: vi.fn(async () => ({ completedQuestIds: [], mechChromaIds: [] })),
  insertBankLedgerRow: vi.fn(async () => {}),
  acquireCharacterLease: vi.fn(async () => true),
  releaseCharacterLease: vi.fn(async () => {}),
  heartbeatCharacterLeases: vi.fn(async () => {}),
  releaseAllCharacterLeases: vi.fn(async () => {}),
}));

import { type ClientSession, GameServer, wireEntity } from '../server/game';
import { toggleAutoFaceLock } from '../src/sim/auto_face_lock';
import { Sim } from '../src/sim/sim';
import type { PlayerClass } from '../src/sim/types';
import { bareClient } from './helpers/bare_client';

function makeSim(cls: 'warrior' | 'mage' = 'warrior', seed = 42) {
  return new Sim({ seed, playerClass: cls, autoEquip: true });
}

describe('auto_face_lock module', () => {
  it('toggles the flag both ways and survives idle ticks', () => {
    const sim = makeSim();
    toggleAutoFaceLock(sim.ctx, sim.playerId);
    expect(sim.player.autoFaceLocked).toBe(false);
    for (let i = 0; i < 20 * 3; i++) sim.tick();
    expect(sim.player.autoFaceLocked).toBe(false);
    toggleAutoFaceLock(sim.ctx, sim.playerId);
    expect(sim.player.autoFaceLocked).toBe(true);
  });

  it('is a no-op for a missing pid (mirrors ctx.resolve on every other toggle)', () => {
    const sim = makeSim();
    toggleAutoFaceLock(sim.ctx, 999999);
    expect(sim.player.autoFaceLocked).toBe(true);
  });
});

// --- entity wire: the `afu` bit ------------------------------------------------

interface FakeClient {
  sent: any[];
  ws: any;
}

function fakeWs(): FakeClient {
  const sent: any[] = [];
  return { sent, ws: { readyState: 1, send: (payload: string) => sent.push(JSON.parse(payload)) } };
}

function lastSnap(sent: any[]): any {
  for (let i = sent.length - 1; i >= 0; i--) {
    if (sent[i].t === 'snap') return sent[i];
  }
  return null;
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

describe('ClientWorld optimistic nudge', () => {
  it('flips locally and sends the toggle_auto_face_lock token', () => {
    (globalThis as any).WebSocket = { OPEN: 1 };
    const client = bareClient(7);
    const sent: any[] = [];
    (client as any).ws = { readyState: 1, send: (p: string) => sent.push(JSON.parse(p)) };
    const internals = client as unknown as { applySnapshot(snapshot: unknown): void };
    const self = (extra: Record<string, unknown>) => ({
      id: 7,
      k: 'player',
      tid: 'warrior',
      nm: 'Nudge',
      lv: 1,
      x: 0,
      y: 0,
      z: 0,
      f: 0,
      hp: 10,
      mhp: 10,
      ...extra,
    });
    // Default locked: the entity record decodes true before the first toggle.
    internals.applySnapshot({ self: self({}), ents: [], keep: [] });
    expect(client.player.autoFaceLocked).toBe(true);
    client.toggleAutoFaceLock();
    expect(client.player.autoFaceLocked).toBe(false);
    expect(sent.filter((m) => m.t === 'cmd' && m.cmd === 'toggle_auto_face_lock')).toHaveLength(1);
    // The next snapshot reconciles the optimistic state to the server's truth.
    internals.applySnapshot({ self: self({}), ents: [], keep: [] });
    expect(client.player.autoFaceLocked).toBe(true);
  });
});

describe('autoFaceLocked over the wire', () => {
  it('wireEntity carries afu:1 only while unlocked (absent-means-locked)', () => {
    const sim = makeSim();
    const locked = wireEntity(sim.player);
    expect('afu' in locked).toBe(false);
    sim.toggleAutoFaceLock();
    expect(wireEntity(sim.player).afu).toBe(1);
  });

  it('toggle_auto_face_lock dispatch -> snapshot -> ClientWorld round-trips end to end', () => {
    const server = new GameServer();
    const fc = fakeWs();
    const session = joinServer(server, fc, 1, 'Locker');
    server.handleMessage(session, JSON.stringify({ t: 'cmd', cmd: 'toggle_auto_face_lock' }));
    (server as any).broadcastSnapshots();
    const snap = lastSnap(fc.sent);
    expect(snap.self.afu).toBe(1);

    const client = bareClient(session.pid);
    (client as any).applySnapshot(snap);
    expect(client.player.autoFaceLocked).toBe(false);

    // Toggle back: the next snapshot omits the bit and the client re-locks.
    server.handleMessage(session, JSON.stringify({ t: 'cmd', cmd: 'toggle_auto_face_lock' }));
    (server as any).broadcastSnapshots();
    const snap2 = lastSnap(fc.sent);
    expect('afu' in snap2.self).toBe(false);
    (client as any).applySnapshot(snap2);
    expect(client.player.autoFaceLocked).toBe(true);
  });
});
