// The Last Keep garrison and town services (src/sim/last_keep_garrison.ts):
// `dynamic: true` NPC records (content/drakelands.ts) stood up AFTER the
// rng-driven roster on reserved singleton ids, so the rebuilt castle's bailey
// has a warden at the Wyrmgate arch, a sutler at the market row, a sergeant by
// the well, a chaplain at the chapel, a paymaster (banker), a World Market
// auctioneer, and an armorer, plus a Ravenpost mailbox on a reserved
// static-service id (content/mailboxes.ts), and no camp mob's, object's, or
// dungeon door's id moved to make room for any of them.
import { describe, expect, it } from 'vitest';
import { resolvePosition } from '../src/sim/colliders';
import { DRAKELANDS_NPCS, DRAKELANDS_PORTALS } from '../src/sim/content/drakelands';
import { MAILBOXES } from '../src/sim/content/mailboxes';
import { NOTICEBOARDS } from '../src/sim/content/noticeboards';
import { FURY_ENTITY_ID } from '../src/sim/content/pvp_honor';
import { NPCS } from '../src/sim/data';
import { EASTBROOK_LAYOUT } from '../src/sim/eastbrook_layout';
import {
  LAST_KEEP_GARRISON_ENTITY_ID_BASE,
  LAST_KEEP_GARRISON_NPC_IDS,
  LAST_KEEP_MAILBOX_ENTITY_ID,
  type LastKeepServiceSinks,
  lastKeepGarrisonEntityId,
  spawnLastKeepGarrison,
} from '../src/sim/last_keep_garrison';
import { Sim } from '../src/sim/sim';
import { type Entity, STATIC_WORLD_SERVICE_ENTITY_ID_MIN } from '../src/sim/types';
import { groundHeight, waterLevel } from '../src/sim/world';

// Bailey inner faces (src/sim/castle_layout.ts CASTLE curtain walls).
const BAILEY = { xMin: 361.5, xMax: 435.3, zMin: 1989.5, zMax: 2070.3 };

function makeWorld(noPlayer = true) {
  return new Sim({ seed: 42, playerClass: 'warrior', noPlayer });
}

const LAST_KEEP_MAILBOX = MAILBOXES.find((m) => m.entityId === LAST_KEEP_MAILBOX_ENTITY_ID)!;

function freshSinks(): LastKeepServiceSinks {
  return { bankerIds: [], merchantIds: [], mailboxIds: [] };
}

/** Stand a player beside an entity (or a point), settled, out of combat. */
function standAt(sim: Sim, pid: number, at: { x: number; z: number }, dx = 1.5) {
  const p = sim.entities.get(pid)!;
  p.pos = sim.groundPos(at.x + dx, at.z);
  p.prevPos = { ...p.pos };
  return p;
}

describe('the garrison records', () => {
  it('are dynamic Drakelands NPCs in the merged table, standing inside the curtain walls', () => {
    for (const id of LAST_KEEP_GARRISON_NPC_IDS) {
      const def = NPCS[id];
      expect(def, id).toBeDefined();
      expect(def).toBe(DRAKELANDS_NPCS[id]);
      expect(def.dynamic, id).toBe(true);
      expect(def.questIds).toEqual([]);
      expect(def.pos.x).toBeGreaterThan(BAILEY.xMin + 4);
      expect(def.pos.x).toBeLessThan(BAILEY.xMax - 4);
      expect(def.pos.z).toBeGreaterThan(BAILEY.zMin + 4);
      expect(def.pos.z).toBeLessThan(BAILEY.zMax - 4);
    }
  });

  it('keep four yards from each other (and the mailbox) and off the arch and its landing', () => {
    const defs = LAST_KEEP_GARRISON_NPC_IDS.map((id) => NPCS[id]);
    for (let i = 0; i < defs.length; i++) {
      for (let j = i + 1; j < defs.length; j++) {
        const d = Math.hypot(defs[i].pos.x - defs[j].pos.x, defs[i].pos.z - defs[j].pos.z);
        expect(d, `${defs[i].id} vs ${defs[j].id}`).toBeGreaterThanOrEqual(4);
      }
      expect(
        Math.hypot(defs[i].pos.x - LAST_KEEP_MAILBOX.x, defs[i].pos.z - LAST_KEEP_MAILBOX.z),
        `${defs[i].id} vs the mailbox`,
      ).toBeGreaterThanOrEqual(4);
      const side = DRAKELANDS_PORTALS.find((p) => p.id === 'wyrmgate_waystone')!.b;
      for (const pt of [side, side.landing]) {
        expect(Math.hypot(defs[i].pos.x - pt.x, defs[i].pos.z - pt.z), defs[i].id).toBeGreaterThan(
          DRAKELANDS_PORTALS[0].radius + 2,
        );
      }
    }
  });

  it('stands on clear, dry, walkable ground (no building, stall, well, or wall pushes them)', () => {
    for (const id of LAST_KEEP_GARRISON_NPC_IDS) {
      const def = NPCS[id];
      const { x, z } = def.pos;
      expect(groundHeight(x, z, 42), id).toBeGreaterThan(waterLevel() + 0.6);
      // A banker's strongbox stands solid BEHIND the banker by design
      // (src/sim/banker_chest_layout.ts), so that one sample is the chest, not a trap.
      const behind = { x: -Math.sin(def.facing), z: -Math.cos(def.facing) };
      for (const [dx, dz] of [
        [0, 0],
        [0.6, 0],
        [-0.6, 0],
        [0, 0.6],
        [0, -0.6],
      ]) {
        if (def.banker && dx * behind.x + dz * behind.z > 0.3) continue;
        const r = resolvePosition(42, x + dx, z + dz);
        expect(Math.hypot(r.x - (x + dx), r.z - (z + dz)), `${id} at +${dx},${dz}`).toBeLessThan(
          1e-6,
        );
      }
    }
  });

  it('the sutler stocks the Highwatch larder rows', () => {
    expect(NPCS.provisioner_dunmore.vendorItems).toEqual([
      'trail_hardtack',
      'meltwater_flask',
      'roast_mountain_goat',
      'glacier_melt',
      'healing_potion',
      'mana_potion',
    ]);
  });

  it('the town services are a banker, a World Market desk, and the Highwatch armory rows', () => {
    expect(NPCS.paymaster_edda_thorne.banker).toBe(true);
    expect(NPCS.paymaster_edda_thorne.market).toBeUndefined();
    expect(NPCS.auctioneer_bram_kestrel.market).toBe(true);
    expect(NPCS.auctioneer_bram_kestrel.banker).toBeUndefined();
    expect(NPCS.armorer_tam_rusk.vendorItems).toEqual(NPCS.armorer_hode.vendorItems);
    expect(NPCS.armorer_tam_rusk.vendorItems!.length).toBeGreaterThan(0);
  });

  it('the keep mailbox is a Ravenpost record on the reserved id, inside the walls, on clear ground', () => {
    expect(LAST_KEEP_MAILBOX).toBeDefined();
    expect(LAST_KEEP_MAILBOX.x).toBeGreaterThan(BAILEY.xMin + 4);
    expect(LAST_KEEP_MAILBOX.x).toBeLessThan(BAILEY.xMax - 4);
    expect(LAST_KEEP_MAILBOX.z).toBeGreaterThan(BAILEY.zMin + 4);
    expect(LAST_KEEP_MAILBOX.z).toBeLessThan(BAILEY.zMax - 4);
    // Only the keep's pillar carries a reserved id; every other town stays sequential.
    expect(MAILBOXES.filter((m) => m.entityId !== undefined)).toEqual([LAST_KEEP_MAILBOX]);
    // The pillar's own collider sits at its spot, so sample the approach ring, not the post.
    for (const [dx, dz] of [
      [1.6, 0],
      [-1.6, 0],
      [0, 1.6],
      [0, -1.6],
    ]) {
      const x = LAST_KEEP_MAILBOX.x + dx,
        z = LAST_KEEP_MAILBOX.z + dz;
      expect(groundHeight(x, z, 42)).toBeGreaterThan(waterLevel() + 0.6);
      const r = resolvePosition(42, x, z);
      expect(Math.hypot(r.x - x, r.z - z), `mailbox ring +${dx},${dz}`).toBeLessThan(1e-6);
    }
  });
});

describe('spawnLastKeepGarrison', () => {
  it('takes reserved singleton ids clear of FURY and below the static-service band', () => {
    const ids = LAST_KEEP_GARRISON_NPC_IDS.map(lastKeepGarrisonEntityId);
    expect(ids).toEqual(
      LAST_KEEP_GARRISON_NPC_IDS.map((_, i) => LAST_KEEP_GARRISON_ENTITY_ID_BASE + i),
    );
    for (const id of ids) {
      expect(id).toBeGreaterThan(FURY_ENTITY_ID);
      expect(id).toBeLessThan(STATIC_WORLD_SERVICE_ENTITY_ID_MIN);
    }
  });

  it('gives the mailbox a static-service id clear of every noticeboard and the monument', () => {
    expect(LAST_KEEP_MAILBOX_ENTITY_ID).toBeGreaterThanOrEqual(STATIC_WORLD_SERVICE_ENTITY_ID_MIN);
    expect(LAST_KEEP_MAILBOX_ENTITY_ID).not.toBe(EASTBROOK_LAYOUT.civic.monument.entityId);
    for (const board of NOTICEBOARDS) expect(board.entityId).not.toBe(LAST_KEEP_MAILBOX_ENTITY_ID);
    // Clear of the append-only noticeboard band's headroom too.
    expect(LAST_KEEP_MAILBOX_ENTITY_ID).toBeGreaterThan(
      Math.max(...NOTICEBOARDS.map((b) => b.entityId)) + 50,
    );
  });

  it('stands all four up in a live world without touching the sequential allocator', () => {
    for (const noPlayer of [true, false]) {
      const sim = makeWorld(noPlayer);
      for (const npcId of LAST_KEEP_GARRISON_NPC_IDS) {
        const e = sim.entities.get(lastKeepGarrisonEntityId(npcId));
        expect(e, npcId).toBeDefined();
        expect(e!.kind).toBe('npc');
        expect(e!.templateId).toBe(npcId);
        expect(Math.hypot(e!.pos.x - NPCS[npcId].pos.x, e!.pos.z - NPCS[npcId].pos.z)).toBeLessThan(
          0.01,
        );
      }
      // The generic loop skipped them (dynamic): no other entity wears the template.
      const surface = [...sim.entities.values()].filter(
        (e) =>
          e.kind === 'npc' &&
          (LAST_KEEP_GARRISON_NPC_IDS as readonly string[]).includes(e.templateId) &&
          e.id < LAST_KEEP_GARRISON_ENTITY_ID_BASE,
      );
      expect(surface).toEqual([]);
      // The services joined the live registries the ctor loops feed.
      expect(sim.bankerIds).toContain(lastKeepGarrisonEntityId('paymaster_edda_thorne'));
      expect(sim.market.merchantIds).toContain(lastKeepGarrisonEntityId('auctioneer_bram_kestrel'));
      // The mailbox stands on its reserved id, once, and is the post office's.
      const box = sim.entities.get(LAST_KEEP_MAILBOX_ENTITY_ID);
      expect(box?.kind).toBe('object');
      expect(box?.templateId).toBe('mailbox');
      expect(box?.facing).toBe(LAST_KEEP_MAILBOX.facing);
      expect(Math.hypot(box!.pos.x - LAST_KEEP_MAILBOX.x, box!.pos.z - LAST_KEEP_MAILBOX.z)).toBe(
        0,
      );
      expect(sim.postOffice.mailboxIds).toContain(LAST_KEEP_MAILBOX_ENTITY_ID);
      expect(sim.postOffice.mailboxIds).toHaveLength(MAILBOXES.length);
      // Every authored record has a live pillar at its spot (sequential or reserved).
      const at = new Set(
        sim.postOffice.mailboxIds.map((id) => {
          const e = sim.entities.get(id)!;
          return `${Math.round(e.pos.x * 100)},${Math.round(e.pos.z * 100)}`;
        }),
      );
      for (const m of MAILBOXES)
        expect(at.has(`${m.x * 100},${m.z * 100}`), `${m.x},${m.z}`).toBe(true);
      const pillars = [...sim.entities.values()].filter((e) => e.templateId === 'mailbox');
      expect(pillars).toHaveLength(MAILBOXES.length);
      expect(pillars.filter((e) => e.id >= STATIC_WORLD_SERVICE_ENTITY_ID_MIN)).toHaveLength(1);
    }
  });

  it('consumes no sequential id and draws no rng', () => {
    const added: Entity[] = [];
    const ctx = {
      entities: new Map<number, Entity>(),
      addEntity: (e: Entity) => {
        added.push(e);
        ctx.entities.set(e.id, e);
      },
      groundPos: (x: number, z: number) => ({ x, y: 0, z }),
    };
    const sinks = freshSinks();
    spawnLastKeepGarrison(ctx, NPCS, sinks, MAILBOXES);
    expect(added.map((e) => e.id)).toEqual([
      ...LAST_KEEP_GARRISON_NPC_IDS.map(lastKeepGarrisonEntityId),
      LAST_KEEP_MAILBOX_ENTITY_ID,
    ]);
    expect(sinks).toEqual({
      bankerIds: [lastKeepGarrisonEntityId('paymaster_edda_thorne')],
      merchantIds: [lastKeepGarrisonEntityId('auctioneer_bram_kestrel')],
      mailboxIds: [LAST_KEEP_MAILBOX_ENTITY_ID],
    });
    // Twice: the reserved slot is taken, which is a content bug, not a retry.
    expect(() => spawnLastKeepGarrison(ctx, NPCS, freshSinks(), MAILBOXES)).toThrow(
      /Duplicate static service/,
    );
  });

  it('claims every reserved-id mailbox and leaves the sequential ones to the ctor loop', () => {
    const added: Entity[] = [];
    const sinks = freshSinks();
    spawnLastKeepGarrison(
      {
        entities: new Map<number, Entity>(),
        addEntity: (e: Entity) => added.push(e),
        groundPos: (x: number, z: number) => ({ x, y: 0, z }),
      },
      {},
      sinks,
      MAILBOXES,
    );
    expect(added.map((e) => e.id)).toEqual([LAST_KEEP_MAILBOX_ENTITY_ID]);
    expect(sinks.mailboxIds).toEqual([LAST_KEEP_MAILBOX_ENTITY_ID]);
    // A future town's reserved pillar rides the same contract, unnamed.
    const more: Entity[] = [];
    const s2 = freshSinks();
    spawnLastKeepGarrison(
      {
        entities: new Map<number, Entity>(),
        addEntity: (e: Entity) => more.push(e),
        groundPos: (x: number, z: number) => ({ x, y: 0, z }),
      },
      {},
      s2,
      [
        { x: 1, z: 2 },
        { x: 3, z: 4, entityId: 2_000_000_111 },
      ],
    );
    expect(more.map((e) => e.id)).toEqual([2_000_000_111]);
    expect(s2.mailboxIds).toEqual([2_000_000_111]);
  });

  it('stands nobody up on a map without the records', () => {
    const added: Entity[] = [];
    spawnLastKeepGarrison(
      {
        entities: new Map<number, Entity>(),
        addEntity: (e: Entity) => added.push(e),
        groundPos: (x: number, z: number) => ({ x, y: 0, z }),
      },
      {},
      freshSinks(),
      [],
    );
    expect(added).toEqual([]);
  });

  it('keeps two same-seed worlds identical with the garrison standing', () => {
    const run = () => {
      const sim = makeWorld();
      const a = sim.addPlayer('warrior', 'Aleph');
      for (let i = 0; i < 30; i++) sim.tick();
      const p = sim.entities.get(a)!;
      return [a, p.pos.x, p.pos.z, sim.nextId, sim.rng.next()];
    };
    expect(run()).toEqual(run());
  });

  it("sells the sutler's rations to a player standing at the stall", () => {
    const sim = makeWorld();
    const a = sim.addPlayer('warrior', 'Aleph');
    sim.tick();
    const meta = sim.players.get(a)!;
    const dunmore = sim.entities.get(lastKeepGarrisonEntityId('provisioner_dunmore'))!;
    const p = sim.entities.get(a)!;
    p.pos = sim.groundPos(dunmore.pos.x + 1.5, dunmore.pos.z);
    p.prevPos = { ...p.pos };
    meta.copper = 100_000;
    sim.buyItem(dunmore.id, 'roast_mountain_goat', undefined, a);
    const events = sim.tick();
    expect(events.filter((e) => e.type === 'error')).toEqual([]);
    expect(meta.copper).toBeLessThan(100_000);
    expect(sim.countItem('roast_mountain_goat', a)).toBeGreaterThan(0);
  });

  it('opens the bank to a player standing at the paymaster, and refuses one across the bailey', () => {
    const sim = makeWorld();
    const a = sim.addPlayer('warrior', 'Aleph');
    sim.tick();
    const meta = sim.players.get(a)!;
    const paymaster = sim.entities.get(lastKeepGarrisonEntityId('paymaster_edda_thorne'))!;
    sim.addItem('healing_potion', 1, a);
    // Across the bailey (the chapel end): too far from any banker.
    standAt(sim, a, NPCS.chaplain_ondrey.pos);
    const slot = meta.inventory.findIndex((s) => s.itemId === 'healing_potion');
    expect(slot).toBeGreaterThanOrEqual(0);
    sim.drainEvents();
    sim.bankDeposit(slot, undefined, a);
    expect(sim.drainEvents().some((e) => e.type === 'error')).toBe(true);
    expect(meta.bank.inventory.some((s) => s.itemId === 'healing_potion')).toBe(false);
    // Beside the paymaster: the deposit lands.
    standAt(sim, a, paymaster.pos);
    sim.bankDeposit(slot, undefined, a);
    expect(sim.drainEvents().filter((e) => e.type === 'error')).toEqual([]);
    expect(meta.bank.inventory.some((s) => s.itemId === 'healing_potion')).toBe(true);
  });

  it('lets a player at the auctioneer list on the World Market', () => {
    const sim = makeWorld();
    const a = sim.addPlayer('warrior', 'Aleph');
    sim.tick();
    const auctioneer = sim.entities.get(lastKeepGarrisonEntityId('auctioneer_bram_kestrel'))!;
    sim.addItem('healing_potion', 1, a);
    standAt(sim, a, NPCS.chaplain_ondrey.pos);
    sim.drainEvents();
    sim.marketList('healing_potion', 1, 500, a);
    expect(sim.drainEvents().some((e) => e.type === 'error')).toBe(true);
    expect(sim.marketListings.some((l) => l.itemId === 'healing_potion')).toBe(false);
    standAt(sim, a, auctioneer.pos);
    sim.marketList('healing_potion', 1, 500, a);
    expect(sim.drainEvents().filter((e) => e.type === 'error')).toEqual([]);
    expect(sim.marketListings.some((l) => l.itemId === 'healing_potion')).toBe(true);
  });

  it('sells the armorer steel to a player at the forge door', () => {
    const sim = makeWorld();
    const a = sim.addPlayer('warrior', 'Aleph');
    sim.tick();
    const meta = sim.players.get(a)!;
    const armorer = sim.entities.get(lastKeepGarrisonEntityId('armorer_tam_rusk'))!;
    standAt(sim, a, armorer.pos);
    meta.copper = 1_000_000;
    sim.buyItem(armorer.id, 'highwatch_warblade', undefined, a);
    const events = sim.tick();
    expect(events.filter((e) => e.type === 'error')).toEqual([]);
    expect(sim.countItem('highwatch_warblade', a)).toBe(1);
  });

  it('opens the Ravenpost to a player at the keep mailbox', () => {
    const sim = makeWorld();
    const a = sim.addPlayer('warrior', 'Aleph');
    sim.tick();
    const box = sim.entities.get(LAST_KEEP_MAILBOX_ENTITY_ID)!;
    // mailRevFor is the mailbox-viewer read: a revision beside a pillar, null away from every one.
    standAt(sim, a, box.pos);
    expect(sim.postOffice.mailRevFor(a)).not.toBeNull();
    standAt(sim, a, NPCS.chaplain_ondrey.pos);
    expect(sim.postOffice.mailRevFor(a)).toBeNull();
  });
});
