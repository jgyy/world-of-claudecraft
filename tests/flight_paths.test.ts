// Flight paths (src/sim/flight_paths.ts): reserved-id flightmaster spawns,
// discovery on interact, the boarding gates, the paid hands-off ride, the BFS
// route, and the CharacterState round trip of the known-node set.

import { describe, expect, it } from 'vitest';
import {
  FLIGHT_FARE_COPPER,
  FLIGHT_HEIGHT,
  FLIGHT_NODES,
  FLIGHT_SPEED,
  flightmasterEntityId,
  flightNodeById,
} from '../src/sim/content/flight_paths';
import {
  FLIGHT_NO_MONEY_TEXT,
  FLIGHT_TOO_FAR_TEXT,
  FLIGHT_UNKNOWN_NODE_TEXT,
  flightRoute,
} from '../src/sim/flight_paths';
import { Sim } from '../src/sim/sim';
import type { Entity, SimEvent } from '../src/sim/types';
import { groundHeight } from '../src/sim/world';

function world() {
  const sim = new Sim({ seed: 83, playerClass: 'mage', noPlayer: true });
  const pid = sim.addPlayer('mage', 'Skyfarer');
  return { sim, pid, p: sim.entities.get(pid) as Entity };
}

function teleport(sim: Sim, p: Entity, x: number, z: number): void {
  p.pos.x = x;
  p.pos.z = z;
  p.pos.y = groundHeight(x, z, sim.cfg.seed);
  p.prevPos = { ...p.pos };
  sim.tick();
}

function node(id: string) {
  const n = flightNodeById(id);
  if (!n) throw new Error(`missing node ${id}`);
  return n;
}

function flightmaster(sim: Sim, nodeId: string): Entity {
  const e = sim.entities.get(flightmasterEntityId(nodeId) as number);
  if (!e) throw new Error(`missing flightmaster ${nodeId}`);
  return e;
}

function standAt(sim: Sim, p: Entity, nodeId: string): void {
  const fm = flightmaster(sim, nodeId);
  teleport(sim, p, fm.pos.x + 1, fm.pos.z + 1);
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

describe('flightmaster spawns', () => {
  it('every node has its flightmaster on the reserved id, never a sequential one', () => {
    const { sim } = world();
    for (const n of FLIGHT_NODES) {
      const e = flightmaster(sim, n.id);
      expect(e.kind).toBe('npc');
      expect(e.templateId).toBe(n.npcId);
      expect(e.id).toBeGreaterThan(sim.nextId);
    }
  });
});

describe('discovery', () => {
  it('talking to a flightmaster records the node and asks for the flight window', () => {
    const { sim, pid, p } = world();
    standAt(sim, p, 'eastbrook');
    const fm = flightmaster(sim, 'eastbrook');
    sim.drainEvents();
    sim.targetEntity(fm.id, pid);
    sim.interact(pid);
    const events = sim.drainEvents();
    expect(sim.flightNodesKnown.has('eastbrook')).toBe(true);
    expect(logs(events)).toContain('Flight path discovered: Eastbrook.');
    const open = events.find((e) => e.type === 'flightmaster');
    expect(open).toMatchObject({ type: 'flightmaster', npcId: fm.id, nodeId: 'eastbrook', pid });
    // A second talk re-opens the window without a second discovery line.
    sim.interact(pid);
    const again = sim.drainEvents();
    expect(logs(again)).not.toContain('Flight path discovered: Eastbrook.');
    expect(again.some((e) => e.type === 'flightmaster')).toBe(true);
  });
});

describe('the route', () => {
  it('eastbrook to icemantle is the four-hop BFS path', () => {
    expect(flightRoute('eastbrook', 'icemantle')).toEqual([
      'eastbrook',
      'fenbridge',
      'highwatch',
      'eldergleam',
      'icemantle',
    ]);
    expect(flightRoute('eastbrook', 'eastbrook')).toEqual(['eastbrook']);
    expect(flightRoute('eastbrook', 'nowhere')).toBeNull();
  });
});

describe('takeFlight refusals', () => {
  it('refuses far from any flightmaster', () => {
    const { sim, pid, p } = world();
    const meta = sim.meta(pid);
    if (!meta) throw new Error('missing meta');
    meta.flightNodesKnown.add('eastbrook').add('fenbridge');
    meta.copper = 100_000;
    teleport(sim, p, 0, 0);
    sim.drainEvents();
    sim.takeFlight('fenbridge');
    expect(errors(sim.drainEvents())).toContain(FLIGHT_TOO_FAR_TEXT);
    expect(p.flight ?? null).toBeNull();
    expect(meta.copper).toBe(100_000);
  });

  it('refuses an unlearned destination', () => {
    const { sim, pid, p } = world();
    const meta = sim.meta(pid);
    if (!meta) throw new Error('missing meta');
    meta.flightNodesKnown.add('eastbrook');
    meta.copper = 100_000;
    standAt(sim, p, 'eastbrook');
    sim.drainEvents();
    sim.takeFlight('fenbridge');
    expect(errors(sim.drainEvents())).toContain(FLIGHT_UNKNOWN_NODE_TEXT);
    expect(p.flight ?? null).toBeNull();
  });

  it('refuses without the fare', () => {
    const { sim, pid, p } = world();
    const meta = sim.meta(pid);
    if (!meta) throw new Error('missing meta');
    meta.flightNodesKnown.add('eastbrook').add('fenbridge');
    meta.copper = FLIGHT_FARE_COPPER - 1;
    standAt(sim, p, 'eastbrook');
    sim.drainEvents();
    sim.takeFlight('fenbridge');
    expect(errors(sim.drainEvents())).toContain(FLIGHT_NO_MONEY_TEXT);
    expect(p.flight ?? null).toBeNull();
    expect(meta.copper).toBe(FLIGHT_FARE_COPPER - 1);
  });
});

describe('a paid flight', () => {
  it('charges per hop, ignores input, hovers, and lands at the destination node', () => {
    const { sim, pid, p } = world();
    const meta = sim.meta(pid);
    if (!meta) throw new Error('missing meta');
    meta.flightNodesKnown.add('eastbrook').add('fenbridge');
    meta.copper = 10_000;
    // The ride is not aggro-immune (mob aggro is x/z-only and reach ignores
    // the hover height), so a level-1 rider dies to the vale wolves under the
    // route; the classic trivial-con gap keeps a seasoned rider unbothered.
    sim.setPlayerLevel(40, pid);
    standAt(sim, p, 'eastbrook');
    sim.drainEvents();
    sim.takeFlight('fenbridge');
    const boarded = sim.drainEvents();
    expect(errors(boarded)).toEqual([]);
    expect(logs(boarded)).toContain('Flight to Fenbridge: 5s.');
    expect(meta.copper).toBe(10_000 - FLIGHT_FARE_COPPER);
    expect(p.flight).toMatchObject({ destination: 'fenbridge', index: 0, speed: FLIGHT_SPEED });
    expect(p.flight?.path).toEqual([{ x: node('fenbridge').x, z: node('fenbridge').z }]);

    // Input is ignored: the body follows the route toward Fenbridge (north,
    // +z) even while the player holds a key that would move it otherwise.
    const start = { x: p.pos.x, z: p.pos.z };
    meta.moveInput.forward = true;
    meta.moveInput.strafeLeft = true;
    for (let i = 0; i < 20; i++) sim.tick();
    const dist = Math.hypot(p.pos.x - start.x, p.pos.z - start.z);
    expect(dist).toBeCloseTo(FLIGHT_SPEED, 3);
    expect(p.pos.z).toBeGreaterThan(start.z);
    expect(p.pos.y).toBeCloseTo(groundHeight(p.pos.x, p.pos.z, sim.cfg.seed) + FLIGHT_HEIGHT, 3);
    expect(p.onGround).toBe(false);

    // Long enough for the whole leg, plus slack.
    const fb = node('fenbridge');
    const ticks = Math.ceil((Math.hypot(fb.x - start.x, fb.z - start.z) / FLIGHT_SPEED) * 20) + 5;
    let arrived: string[] = [];
    for (let i = 0; i < ticks && p.flight; i++) arrived = arrived.concat(logs(sim.tick()));
    expect(p.flight ?? null).toBeNull();
    expect(p.pos.x).toBeCloseTo(fb.x, 3);
    expect(p.pos.z).toBeCloseTo(fb.z, 3);
    expect(p.onGround).toBe(true);
    expect(p.fallStartY).toBe(p.pos.y);
    expect(arrived).toContain('You have arrived in Fenbridge.');
    expect(p.hp).toBe(p.maxHp);
  });

  it('a rider killed mid-air ends the ride on spirit release, never resuming it', () => {
    const { sim, pid, p } = world();
    const meta = sim.meta(pid);
    if (!meta) throw new Error('missing meta');
    meta.flightNodesKnown.add('eastbrook').add('fenbridge');
    meta.copper = 10_000;
    standAt(sim, p, 'eastbrook');
    sim.takeFlight('fenbridge');
    for (let i = 0; i < 40; i++) sim.tick();
    expect(p.flight).not.toBeNull();
    p.dead = true;
    p.ghost = true;
    sim.tick();
    expect(p.flight ?? null).toBeNull();
  });
});

describe('persistence', () => {
  it('round-trips the known-node set and omits the key when empty', () => {
    const { sim, pid } = world();
    const empty = sim.serializeCharacter(pid);
    expect(empty).not.toHaveProperty('flightNodesKnown');
    const meta = sim.meta(pid);
    if (!meta) throw new Error('missing meta');
    meta.flightNodesKnown.add('eastbrook').add('highwatch');
    const saved = sim.serializeCharacter(pid);
    expect(saved?.flightNodesKnown).toEqual(['eastbrook', 'highwatch']);
    const other = new Sim({ seed: 83, playerClass: 'mage', noPlayer: true });
    const pid2 = other.addPlayer('mage', 'Skyfarer', { state: saved ?? undefined });
    expect([...(other.meta(pid2)?.flightNodesKnown ?? [])].sort()).toEqual([
      'eastbrook',
      'highwatch',
    ]);
  });
});

describe('flight aggro immunity', () => {
  it('a rider mid-flight is never picked by the idle aggro scan', async () => {
    const { Sim } = await import('../src/sim/sim');
    const { MOBS } = await import('../src/sim/data');
    const sim = new Sim({ seed: 83, playerClass: 'mage', noPlayer: true });
    const pid = sim.addPlayer('mage', 'Rider');
    const p = sim.entities.get(pid)!;
    const wolf = [...sim.entities.values()].find(
      (e) => e.kind === 'mob' && MOBS[e.templateId]?.aggroRadius > 0 && !e.dead,
    )!;
    p.pos = { x: wolf.pos.x + 2, y: wolf.pos.y, z: wolf.pos.z + 2 };
    p.flight = {
      path: [{ x: wolf.pos.x + 200, z: wolf.pos.z }],
      index: 0,
      destination: 'fenbridge',
      speed: 0,
    };
    for (let i = 0; i < 40; i++) sim.tick();
    expect(wolf.targetId).not.toBe(pid);
  });
});
