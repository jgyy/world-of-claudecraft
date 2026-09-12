import { describe, expect, it, vi } from 'vitest';

// Mock the db layer so no Postgres is needed; the wire/frame paths are under test.
vi.mock('../server/db', () => ({
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

import { GameServer } from '../server/game';
import { WHO_TAB_LIMIT } from '../server/who_roster';
import { socialInfoFromFrame } from '../src/net/social_frame_wire';
import { whoRosterFromFrame } from '../src/net/who_frame_wire';
import { bareClient, fakeWs, joinServer } from './helpers/bare_client';

// The Who tab's wire pair: the `who` command (server/game.ts dispatch, riding
// the chat lane) answers with the structured `who` frame (server/who_roster.ts
// whoFrame), which ClientWorld mirrors as IWorldSocialGraph.whoInfo. The chat
// /who keeps its log-line projection untouched beside it.

// biome-ignore lint/suspicious/noExplicitAny: sent frames are untyped wire JSON
function whoFrames(sent: any[]): any[] {
  return sent.filter((m) => m.t === 'who');
}

describe('the `who` command (server)', () => {
  it('answers a structured frame with every visible player, their guild, and no position', () => {
    const server = new GameServer();
    const viewerWs = fakeWs();
    const viewer = joinServer(server, viewerWs, 1, 'Aleron', 'warrior');
    const other = joinServer(server, fakeWs(), 2, 'Bryn', 'mage');
    // biome-ignore lint/suspicious/noExplicitAny: private sim handle
    (server as any).sim.setPlayerGuild(other.pid, 'Moonwardens');

    server.handleMessage(viewer, JSON.stringify({ t: 'cmd', cmd: 'who' }));
    const frames = whoFrames(viewerWs.sent);
    expect(frames).toHaveLength(1);
    const frame = frames[0];
    expect(frame.filter).toBe('');
    expect(frame.total).toBe(2);
    expect(frame.limit).toBe(WHO_TAB_LIMIT);
    // biome-ignore lint/suspicious/noExplicitAny: wire row
    expect(frame.rows.map((r: any) => r.name)).toEqual(['Aleron', 'Bryn']);
    const bryn = frame.rows[1];
    expect(bryn.cls).toBe('mage');
    expect(bryn.guild).toBe('Moonwardens');
    expect(typeof bryn.level).toBe('number');
    expect(typeof bryn.zone).toBe('string');
    expect(bryn.status).toBe('online');
    // The realm-wide roster is public presence; live coordinates stay on the
    // friend/guild-gated socialpos frame.
    expect('x' in bryn).toBe(false);
    expect('z' in bryn).toBe(false);
  });

  it('applies the sanitized filter server-side, over name, zone, and guild', () => {
    const server = new GameServer();
    const viewerWs = fakeWs();
    const viewer = joinServer(server, viewerWs, 1, 'Aleron');
    const other = joinServer(server, fakeWs(), 2, 'Bryn');
    // biome-ignore lint/suspicious/noExplicitAny: private sim handle
    (server as any).sim.setPlayerGuild(other.pid, 'Moonwardens');

    server.handleMessage(viewer, JSON.stringify({ t: 'cmd', cmd: 'who', filter: ' "MOON" ' }));
    const frame = whoFrames(viewerWs.sent)[0];
    expect(frame.filter).toBe('MOON');
    // biome-ignore lint/suspicious/noExplicitAny: wire row
    expect(frame.rows.map((r: any) => r.name)).toEqual(['Bryn']);
    expect(frame.total).toBe(1);
  });

  it('hides a blocked player in both directions, exactly like the chat /who', () => {
    const server = new GameServer();
    const viewerWs = fakeWs();
    const viewer = joinServer(server, viewerWs, 1, 'Aleron');
    const blocking = joinServer(server, fakeWs(), 2, 'Bryn');
    joinServer(server, fakeWs(), 3, 'Mira');
    blocking.blockedIds = new Set([viewer.characterId]);
    viewer.blockedIds = new Set([3]);

    server.handleMessage(viewer, JSON.stringify({ t: 'cmd', cmd: 'who' }));
    // biome-ignore lint/suspicious/noExplicitAny: wire row
    expect(whoFrames(viewerWs.sent)[0].rows.map((r: any) => r.name)).toEqual(['Aleron']);
  });

  it('answers nothing while the viewer block list is still loading (fail closed)', () => {
    const server = new GameServer();
    const viewerWs = fakeWs();
    const viewer = joinServer(server, viewerWs, 1, 'Aleron');
    viewer.blockListLoaded = false;
    server.handleMessage(viewer, JSON.stringify({ t: 'cmd', cmd: 'who' }));
    expect(whoFrames(viewerWs.sent)).toEqual([]);
  });

  it('leaves the chat /who projection byte-identical (header + row lines)', () => {
    const server = new GameServer();
    const viewerWs = fakeWs();
    const viewer = joinServer(server, viewerWs, 1, 'Aleron', 'warrior');
    joinServer(server, fakeWs(), 2, 'Bryn', 'mage');
    // biome-ignore lint/suspicious/noExplicitAny: private chat projection
    (server as any).sendWhoRoster(viewer, 'bry');
    const events = viewerWs.sent.filter((m) => m.t === 'events').flatMap((m) => m.list);
    // biome-ignore lint/suspicious/noExplicitAny: event rows
    const texts: string[] = events.map((e: any) => e.text);
    const header = texts.findIndex((t) => t.startsWith('Who: '));
    expect(texts[header]).toMatch(/^Who: 1 player matching "bry" on .+\.$/);
    expect(texts[header + 1]).toMatch(/^Bryn - level [0-9]+ mage - .+$/);
    expect(whoFrames(viewerWs.sent)).toEqual([]);
  });
});

describe('ClientWorld whoInfo mirror + whoRequest send', () => {
  it('whoRequest sends the `who` command with the filter', () => {
    // biome-ignore lint/suspicious/noExplicitAny: sent frames are untyped wire JSON
    const sent: any[] = [];
    const c = bareClient(7, {
      connected: true,
      ws: { readyState: 1, send: (p: string) => sent.push(JSON.parse(p)) },
    });
    c.whoRequest('Moon');
    expect(sent).toEqual([{ t: 'cmd', cmd: 'who', filter: 'Moon' }]);
  });

  it('the `who` frame sets whoInfo; a frame with no usable roster keeps the last answer', () => {
    const c = bareClient(7);
    expect(c.whoInfo).toBeNull();
    const bryn = {
      name: 'Bryn',
      cls: 'mage',
      level: 12,
      zone: 'Ashwood',
      status: 'combat',
      guild: 'Moonwardens',
    };
    // biome-ignore lint/suspicious/noExplicitAny: private frame entry
    (c as any).onMessage(
      JSON.stringify({
        t: 'who',
        filter: '',
        total: 3,
        limit: 200,
        rows: [
          bryn,
          { name: '', cls: 'mage', level: 1, zone: 'Ashwood', status: 'online', guild: '' },
          { name: 'Odd', cls: 'mage', level: 3, zone: 'Ashwood', status: 'levitating', guild: '' },
        ],
      }),
    );
    expect(c.whoInfo).toEqual({
      filter: '',
      total: 3,
      limit: 200,
      rows: [
        bryn,
        // an unknown status renders as plain online rather than raw server text
        { name: 'Odd', cls: 'mage', level: 3, zone: 'Ashwood', status: 'online', guild: '' },
      ],
    });
    // biome-ignore lint/suspicious/noExplicitAny: private frame entry
    (c as any).onMessage(JSON.stringify({ t: 'who' }));
    expect(c.whoInfo?.rows).toHaveLength(2);
  });
});

describe('who_frame_wire decode', () => {
  it('drops malformed rows, floors a bad total to the row count, and defaults the filter', () => {
    expect(
      whoRosterFromFrame({ rows: [null, 5, { name: 'A', cls: 'mage', level: 2 }], total: -1 }),
    ).toEqual({
      filter: '',
      rows: [{ name: 'A', cls: 'mage', level: 2, zone: '', status: 'online', guild: '' }],
      total: 1,
      limit: 1,
    });
    expect(whoRosterFromFrame({ rows: 'nope' })).toBeNull();
    expect(whoRosterFromFrame(null)).toBeNull();
  });
});

describe('social_frame_wire normalization (moved out of online.ts unchanged)', () => {
  it('defaults every list and the pledge-board fields for an older server frame', () => {
    expect(
      socialInfoFromFrame({
        // biome-ignore lint/suspicious/noExplicitAny: an older server's partial guild record
        guild: { id: 1, name: 'G', rank: 'member', members: [], events: [] } as any,
      }),
    ).toEqual({
      friends: [],
      blocks: [],
      ignores: [],
      guild: {
        id: 1,
        name: 'G',
        rank: 'member',
        members: [],
        events: [],
        pledgeSettings: { enabled: true, minLevel: 1, note: '' },
        pledges: [],
        tier: 0,
      },
      myPledge: null,
    });
    expect(socialInfoFromFrame({}).guild).toBeNull();
  });
});
