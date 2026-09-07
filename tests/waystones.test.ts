// Waystones (src/sim/waystones.ts): reserved-id keeper spawns, attunement on
// interact, the hop gates, the instant paid hop (gold or a ticket, with the
// guild discount), and the CharacterState round trip of the attuned set.

import { describe, expect, it } from 'vitest';
import {
  WAYSTONE_TICKET_ITEM_ID,
  WAYSTONES,
  waystoneById,
  waystoneKeeperEntityId,
} from '../src/sim/content/waystones';
import { Sim } from '../src/sim/sim';
import type { Entity, SimEvent } from '../src/sim/types';
import { waystoneFee } from '../src/sim/waystone_fee';
import {
  WAYSTONE_ALREADY_THERE_TEXT,
  WAYSTONE_NO_MONEY_TEXT,
  WAYSTONE_TOO_FAR_TEXT,
  WAYSTONE_UNKNOWN_TEXT,
} from '../src/sim/waystones';
import { groundHeight } from '../src/sim/world';

function world() {
  const sim = new Sim({ seed: 83, playerClass: 'mage', noPlayer: true });
  const pid = sim.addPlayer('mage', 'Stonewalker');
  return { sim, pid, p: sim.entities.get(pid) as Entity };
}

function teleport(sim: Sim, p: Entity, x: number, z: number): void {
  p.pos.x = x;
  p.pos.z = z;
  p.pos.y = groundHeight(x, z, sim.cfg.seed);
  p.prevPos = { ...p.pos };
  sim.tick();
}

function stone(id: string) {
  const s = waystoneById(id);
  if (!s) throw new Error(`missing stone ${id}`);
  return s;
}

function keeper(sim: Sim, stoneId: string): Entity {
  const e = sim.entities.get(waystoneKeeperEntityId(stoneId) as number);
  if (!e) throw new Error(`missing keeper ${stoneId}`);
  return e;
}

function standAt(sim: Sim, p: Entity, stoneId: string): void {
  const k = keeper(sim, stoneId);
  teleport(sim, p, k.pos.x + 1, k.pos.z + 1);
}

function errors(events: SimEvent[]): string[] {
  return events
    .filter((e): e is Extract<SimEvent, { type: 'error' }> => e.type === 'error')
    .map((e) => e.text);
}

function logs(events: SimEvent[]): string[] {
  return events
    .filter((e): e is Extract<SimEvent, { type: 'log' }> => e.type === 'log')
    .map((e) => e.text);
}

describe('keeper spawns', () => {
  it('every stone has its keeper on the reserved id, never a sequential one', () => {
    const { sim } = world();
    for (const s of WAYSTONES) {
      const e = keeper(sim, s.id);
      expect(e.kind).toBe('npc');
      expect(e.templateId).toBe(s.npcId);
      expect(e.id).toBeGreaterThan(sim.nextId);
    }
  });
});

describe('attunement', () => {
  it('talking to a keeper attunes the stone and asks for the waystone window', () => {
    const { sim, pid, p } = world();
    standAt(sim, p, 'eastbrook');
    const k = keeper(sim, 'eastbrook');
    sim.drainEvents();
    sim.targetEntity(k.id, pid);
    sim.interact(pid);
    const events = sim.drainEvents();
    expect(sim.waystonesAttuned.has('eastbrook')).toBe(true);
    expect(logs(events)).toContain('Waystone attuned: Eastbrook.');
    const open = events.find((e) => e.type === 'waystone');
    expect(open).toMatchObject({ type: 'waystone', npcId: k.id, stoneId: 'eastbrook', pid });
    // A second talk re-opens the window without a second attunement line.
    sim.interact(pid);
    const again = sim.drainEvents();
    expect(logs(again)).not.toContain('Waystone attuned: Eastbrook.');
    expect(again.some((e) => e.type === 'waystone')).toBe(true);
  });
});

describe('waystoneTeleport refusals', () => {
  it('refuses far from any keeper', () => {
    const { sim, pid, p } = world();
    const meta = sim.meta(pid);
    if (!meta) throw new Error('missing meta');
    meta.waystonesAttuned.add('eastbrook').add('fenbridge');
    meta.copper = 100_000;
    teleport(sim, p, 0, 0);
    const before = { ...p.pos };
    sim.drainEvents();
    sim.waystoneTeleport('fenbridge');
    expect(errors(sim.drainEvents())).toContain(WAYSTONE_TOO_FAR_TEXT);
    expect(p.pos).toEqual(before);
    expect(meta.copper).toBe(100_000);
  });

  it('refuses an unattuned destination', () => {
    const { sim, pid, p } = world();
    const meta = sim.meta(pid);
    if (!meta) throw new Error('missing meta');
    meta.waystonesAttuned.add('eastbrook');
    meta.copper = 100_000;
    standAt(sim, p, 'eastbrook');
    sim.drainEvents();
    sim.waystoneTeleport('fenbridge');
    expect(errors(sim.drainEvents())).toContain(WAYSTONE_UNKNOWN_TEXT);
    expect(meta.copper).toBe(100_000);
  });

  it('refuses the stone you stand at', () => {
    const { sim, pid, p } = world();
    const meta = sim.meta(pid);
    if (!meta) throw new Error('missing meta');
    meta.waystonesAttuned.add('eastbrook');
    standAt(sim, p, 'eastbrook');
    sim.drainEvents();
    sim.waystoneTeleport('eastbrook');
    expect(errors(sim.drainEvents())).toContain(WAYSTONE_ALREADY_THERE_TEXT);
  });

  it('refuses without the fee and charges nothing', () => {
    const { sim, pid, p } = world();
    const meta = sim.meta(pid);
    if (!meta) throw new Error('missing meta');
    meta.waystonesAttuned.add('eastbrook').add('fenbridge');
    const fee = waystoneFee(stone('eastbrook'), stone('fenbridge'), 0);
    meta.copper = fee - 1;
    standAt(sim, p, 'eastbrook');
    const before = { ...p.pos };
    sim.drainEvents();
    sim.waystoneTeleport('fenbridge');
    expect(errors(sim.drainEvents())).toContain(WAYSTONE_NO_MONEY_TEXT);
    expect(p.pos).toEqual(before);
    expect(meta.copper).toBe(fee - 1);
  });
});

describe('a paid hop', () => {
  it('charges the distance fee and lands instantly beside the destination keeper', () => {
    const { sim, pid, p } = world();
    const meta = sim.meta(pid);
    if (!meta) throw new Error('missing meta');
    meta.waystonesAttuned.add('eastbrook').add('fenbridge');
    meta.copper = 1_000_000;
    standAt(sim, p, 'eastbrook');
    sim.drainEvents();
    sim.waystoneTeleport('fenbridge');
    const events = sim.drainEvents();
    expect(errors(events)).toEqual([]);
    const fee = waystoneFee(stone('eastbrook'), stone('fenbridge'), 0);
    expect(fee).toBeGreaterThan(0);
    expect(meta.copper).toBe(1_000_000 - fee);
    expect(logs(events).some((line) => line.startsWith('Waystone to Fenbridge: '))).toBe(true);
    const fb = stone('fenbridge');
    expect(Math.hypot(p.pos.x - fb.x, p.pos.z - fb.z)).toBeLessThan(6);
    expect(p.onGround).toBe(true);
    expect(p.fallStartY).toBe(p.pos.y);
    expect(p.hp).toBe(p.maxHp);
    // The hop is instant: the next tick does not move the body.
    const landed = { ...p.pos };
    sim.tick();
    expect(p.pos.x).toBeCloseTo(landed.x, 6);
    expect(p.pos.z).toBeCloseTo(landed.z, 6);
  });

  it('applies the guild-tier discount to the fee', () => {
    const { sim, pid, p } = world();
    const meta = sim.meta(pid);
    if (!meta) throw new Error('missing meta');
    meta.waystonesAttuned.add('eastbrook').add('fenbridge');
    meta.copper = 1_000_000;
    p.guildTier = 2;
    standAt(sim, p, 'eastbrook');
    sim.drainEvents();
    sim.waystoneTeleport('fenbridge');
    const discounted = waystoneFee(stone('eastbrook'), stone('fenbridge'), 2);
    expect(discounted).toBeLessThan(waystoneFee(stone('eastbrook'), stone('fenbridge'), 0));
    expect(meta.copper).toBe(1_000_000 - discounted);
  });

  it('spends one Waystone Ticket instead of gold when the bags hold one', () => {
    const { sim, pid, p } = world();
    const meta = sim.meta(pid);
    if (!meta) throw new Error('missing meta');
    meta.waystonesAttuned.add('eastbrook').add('fenbridge');
    meta.copper = 0;
    sim.addItem(WAYSTONE_TICKET_ITEM_ID, 2, pid);
    standAt(sim, p, 'eastbrook');
    sim.drainEvents();
    sim.waystoneTeleport('fenbridge');
    const events = sim.drainEvents();
    expect(errors(events)).toEqual([]);
    expect(logs(events)).toContain('Waystone to Fenbridge: 1 ticket.');
    expect(meta.copper).toBe(0);
    expect(sim.countItem(WAYSTONE_TICKET_ITEM_ID, pid)).toBe(1);
    const fb = stone('fenbridge');
    expect(Math.hypot(p.pos.x - fb.x, p.pos.z - fb.z)).toBeLessThan(6);
  });
});

describe('persistence', () => {
  it('round-trips the attuned set and the ticket day, omitting both while unset', () => {
    const { sim, pid } = world();
    const empty = sim.serializeCharacter(pid);
    expect(empty).not.toHaveProperty('waystonesAttuned');
    expect(empty).not.toHaveProperty('waystoneTicketDay');
    const meta = sim.meta(pid);
    if (!meta) throw new Error('missing meta');
    meta.waystonesAttuned.add('eastbrook').add('highwatch');
    meta.waystoneTicketDay = '2026-09-07';
    const saved = sim.serializeCharacter(pid);
    expect(saved?.waystonesAttuned).toEqual(['eastbrook', 'highwatch']);
    expect(saved?.waystoneTicketDay).toBe('2026-09-07');
    const other = new Sim({ seed: 83, playerClass: 'mage', noPlayer: true });
    const pid2 = other.addPlayer('mage', 'Stonewalker', { state: saved ?? undefined });
    const meta2 = other.meta(pid2);
    expect([...(meta2?.waystonesAttuned ?? [])].sort()).toEqual(['eastbrook', 'highwatch']);
    expect(meta2?.waystoneTicketDay).toBe('2026-09-07');
  });
});
