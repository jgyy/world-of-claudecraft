// The Wyrmgate Waystone (src/sim/content/drakelands.ts DRAKELANDS_PORTALS):
// a tolled walk-in portal between the Highwatch green (Thornpeak Heights) and
// Wyrmwatch's southeast yard (the Drakelands). src/sim/portals.ts runs the
// trigger; src/sim/portal_toll.ts settles the coin: a traveler with the toll
// is charged and moved, one without is refused ONCE per approach (the
// Entity.portalHoldId latch) and never moved. Both sides stand in open ground,
// so colliders.ts adds no cave flanks; two same-seed worlds stay identical.

import { describe, expect, it } from 'vitest';
import { colliderInternalsForTest } from '../src/sim/colliders';
import { DRAKELANDS_PORTALS, WYRMGATE_WAYSTONE_TOLL_COPPER } from '../src/sim/content/drakelands';
import { PORTALS, ZONES, zoneAt } from '../src/sim/data';
import { settlePortalToll } from '../src/sim/portal_toll';
import { Sim } from '../src/sim/sim';
import type { SimEvent } from '../src/sim/types';
import { groundHeight, waterLevel } from '../src/sim/world';

const PORTAL = DRAKELANDS_PORTALS[0];

function makeWorld() {
  return new Sim({ seed: 42, playerClass: 'warrior', noPlayer: true });
}

function place(sim: Sim, pid: number, x: number, z: number) {
  const e = sim.entities.get(pid)!;
  e.pos.x = x;
  e.pos.z = z;
  e.pos.y = groundHeight(x, z, sim.cfg.seed);
  e.prevPos = { ...e.pos };
}

function logTexts(events: SimEvent[]): string[] {
  return events
    .filter((e): e is Extract<SimEvent, { type: 'log' }> => e.type === 'log')
    .map((e) => e.text);
}

function errorTexts(events: SimEvent[]): string[] {
  return events
    .filter((e): e is Extract<SimEvent, { type: 'error' }> => e.type === 'error')
    .map((e) => e.text);
}

describe('the Wyrmgate Waystone record', () => {
  it('is registered in the merged portal table with a one-gold toll', () => {
    expect(PORTALS.some((p) => p.id === 'wyrmgate_waystone')).toBe(true);
    expect(PORTAL.tollCopper).toBe(WYRMGATE_WAYSTONE_TOLL_COPPER);
    expect(WYRMGATE_WAYSTONE_TOLL_COPPER).toBe(10_000);
    expect(PORTAL.gate).toBe('waystone');
    expect(PORTAL.tollText).toBeTruthy();
  });

  it('stands on dry ground in the two zones it joins, with each landing out of its own trigger', () => {
    expect(zoneAt(PORTAL.a.x, PORTAL.a.z).id).toBe('thornpeak_heights');
    expect(zoneAt(PORTAL.b.x, PORTAL.b.z).id).toBe('drakelands');
    for (const side of [PORTAL.a, PORTAL.b]) {
      expect(groundHeight(side.x, side.z, 42)).toBeGreaterThan(waterLevel());
      expect(groundHeight(side.landing.x, side.landing.z, 42)).toBeGreaterThan(waterLevel());
      const d = Math.hypot(side.landing.x - side.x, side.landing.z - side.z);
      expect(d).toBeGreaterThan(PORTAL.radius + 1);
    }
  });

  it('each side is a named place on its zone map', () => {
    const poiOf = (zoneId: string) =>
      ZONES.find((z) => z.id === zoneId)!.pois.find((p) => p.id === 'wyrmgate_waystone');
    expect(poiOf('thornpeak_heights')).toMatchObject({ x: PORTAL.a.x, z: PORTAL.a.z });
    expect(poiOf('drakelands')).toMatchObject({ x: PORTAL.b.x, z: PORTAL.b.z });
  });

  it('adds no cave-mouth flank colliders (the arch stands in the open)', () => {
    const shapes = colliderInternalsForTest.staticWorldColliders(42);
    for (const side of [PORTAL.a, PORTAL.b]) {
      const near = shapes.filter(
        (s) => s.type === 'circle' && Math.hypot(s.x - side.x, s.z - side.z) < 5,
      );
      expect(near).toEqual([]);
    }
  });
});

describe('crossing the Wyrmgate Waystone', () => {
  it('charges the toll and carries a paying traveler from Highwatch to Wyrmwatch', () => {
    const sim = makeWorld();
    const a = sim.addPlayer('warrior', 'Aleph');
    sim.tick();
    const meta = sim.players.get(a)!;
    meta.copper = WYRMGATE_WAYSTONE_TOLL_COPPER + 250;
    place(sim, a, PORTAL.a.x, PORTAL.a.z);
    const events = sim.tick();
    const p = sim.entities.get(a)!;
    expect(zoneAt(p.pos.x, p.pos.z).id).toBe('drakelands');
    expect(p.pos.x).toBeCloseTo(PORTAL.b.landing.x, 5);
    expect(p.pos.z).toBeCloseTo(PORTAL.b.landing.z, 5);
    expect(p.facing).toBe(PORTAL.b.landing.facing);
    expect(meta.copper).toBe(250);
    expect(logTexts(events)).toContain(PORTAL.enterText);
    expect(errorTexts(events)).toEqual([]);
  });

  it('charges again on the way back to Highwatch', () => {
    const sim = makeWorld();
    const a = sim.addPlayer('warrior', 'Aleph');
    sim.tick();
    const meta = sim.players.get(a)!;
    meta.copper = WYRMGATE_WAYSTONE_TOLL_COPPER;
    place(sim, a, PORTAL.b.x, PORTAL.b.z);
    const events = sim.tick();
    const p = sim.entities.get(a)!;
    expect(zoneAt(p.pos.x, p.pos.z).id).toBe('thornpeak_heights');
    expect(p.pos.x).toBeCloseTo(PORTAL.a.landing.x, 5);
    expect(meta.copper).toBe(0);
    expect(logTexts(events)).toContain(PORTAL.leaveText);
  });

  it('refuses a traveler one copper short, once, and moves nobody', () => {
    const sim = makeWorld();
    const a = sim.addPlayer('warrior', 'Aleph');
    sim.tick();
    const meta = sim.players.get(a)!;
    meta.copper = WYRMGATE_WAYSTONE_TOLL_COPPER - 1;
    place(sim, a, PORTAL.a.x, PORTAL.a.z);
    const first = sim.tick();
    const p = sim.entities.get(a)!;
    expect(errorTexts(first)).toEqual([PORTAL.tollText]);
    expect(zoneAt(p.pos.x, p.pos.z).id).toBe('thornpeak_heights');
    expect(Math.hypot(p.pos.x - PORTAL.a.x, p.pos.z - PORTAL.a.z)).toBeLessThan(PORTAL.radius);
    expect(meta.copper).toBe(WYRMGATE_WAYSTONE_TOLL_COPPER - 1);
    expect(p.portalHoldId).toBe(PORTAL.id);
    // Standing in the dark waystone: silence, not a toast every tick.
    let later: SimEvent[] = [];
    for (let i = 0; i < 40; i++) later = later.concat(sim.tick());
    expect(errorTexts(later)).toEqual([]);
    expect(logTexts(later)).not.toContain(PORTAL.enterText);
  });

  it('re-arms the refusal once the traveler steps out, and lets them through once paid', () => {
    const sim = makeWorld();
    const a = sim.addPlayer('warrior', 'Aleph');
    sim.tick();
    const meta = sim.players.get(a)!;
    meta.copper = 0;
    place(sim, a, PORTAL.a.x, PORTAL.a.z);
    expect(errorTexts(sim.tick())).toEqual([PORTAL.tollText]);
    const p = sim.entities.get(a)!;
    // Step out (well past the trigger), the latch clears.
    place(sim, a, PORTAL.a.x + 6, PORTAL.a.z);
    sim.tick();
    expect(p.portalHoldId).toBeUndefined();
    // Back in, still broke: the toast fires again, once.
    place(sim, a, PORTAL.a.x, PORTAL.a.z);
    expect(errorTexts(sim.tick())).toEqual([PORTAL.tollText]);
    expect(errorTexts(sim.tick())).toEqual([]);
    // Coin arrives while standing in the arch: the crossing takes hold.
    meta.copper = WYRMGATE_WAYSTONE_TOLL_COPPER;
    const events = sim.tick();
    expect(logTexts(events)).toContain(PORTAL.enterText);
    expect(zoneAt(p.pos.x, p.pos.z).id).toBe('drakelands');
    expect(meta.copper).toBe(0);
  });

  it('never ping-pongs: a paid arrival standing still stays put and pays once', () => {
    const sim = makeWorld();
    const a = sim.addPlayer('warrior', 'Aleph');
    sim.tick();
    const meta = sim.players.get(a)!;
    meta.copper = WYRMGATE_WAYSTONE_TOLL_COPPER * 3;
    place(sim, a, PORTAL.a.x, PORTAL.a.z);
    sim.tick();
    const p = sim.entities.get(a)!;
    const landed = { x: p.pos.x, z: p.pos.z };
    for (let i = 0; i < 100; i++) sim.tick();
    expect(p.pos.x).toBeCloseTo(landed.x, 5);
    expect(p.pos.z).toBeCloseTo(landed.z, 5);
    expect(meta.copper).toBe(WYRMGATE_WAYSTONE_TOLL_COPPER * 2);
  });

  it('addresses the flavor line and the refusal to the traveler only', () => {
    const sim = makeWorld();
    const a = sim.addPlayer('warrior', 'Aleph');
    const b = sim.addPlayer('mage', 'Beth');
    sim.tick();
    sim.players.get(a)!.copper = WYRMGATE_WAYSTONE_TOLL_COPPER;
    sim.players.get(b)!.copper = 0;
    place(sim, a, PORTAL.a.x, PORTAL.a.z);
    place(sim, b, PORTAL.b.x, PORTAL.b.z);
    const events = sim.tick();
    const line = events.find(
      (e): e is Extract<SimEvent, { type: 'log' }> =>
        e.type === 'log' && e.text === PORTAL.enterText,
    );
    expect(line?.pid).toBe(a);
    const refusal = events.find(
      (e): e is Extract<SimEvent, { type: 'error' }> =>
        e.type === 'error' && e.text === PORTAL.tollText,
    );
    expect(refusal?.pid).toBe(b);
    expect(zoneAt(sim.entities.get(b)!.pos.x, sim.entities.get(b)!.pos.z).id).toBe('drakelands');
  });

  it('keeps two same-seed worlds identical through a tolled crossing', () => {
    const run = () => {
      const sim = makeWorld();
      const a = sim.addPlayer('warrior', 'Aleph');
      sim.tick();
      sim.players.get(a)!.copper = WYRMGATE_WAYSTONE_TOLL_COPPER;
      place(sim, a, PORTAL.a.x, PORTAL.a.z);
      for (let i = 0; i < 50; i++) sim.tick();
      const p = sim.entities.get(a)!;
      return [p.pos.x, p.pos.y, p.pos.z, sim.players.get(a)!.copper, sim.rng.next()];
    };
    expect(run()).toEqual(run());
  });
});

describe('settlePortalToll', () => {
  it('waves a free portal through without touching the purse', () => {
    const sim = makeWorld();
    const a = sim.addPlayer('warrior', 'Aleph');
    sim.tick();
    const meta = sim.players.get(a)!;
    meta.copper = 7;
    const free = { ...PORTAL, tollCopper: undefined };
    expect(settlePortalToll((sim as any).ctx, sim.entities.get(a)!, free)).toBe(true);
    expect(meta.copper).toBe(7);
  });
});
