// End-to-end pins for Bind on Equip through a REAL Sim: a green blade trades
// freely while never worn, binds the moment it is equipped (the copy that
// returns to the bags carries the soulbound marker, src/sim/items.ts), and
// from then on refuses every player-to-player pipe (trade, mail, market,
// guild bank) while vendor sale stays open. Pure rule semantics live in
// tests/item_binding.test.ts.
import { describe, expect, it } from 'vitest';
import { groundHeight } from '../src/sim/world';
import { guildBankPipeRefusal } from '../src/sim/guild_bank';
import { type PlayerMeta, Sim } from '../src/sim/sim';
import type { Entity, SimEvent } from '../src/sim/types';
import { expectDefined } from './helpers/defined';
import { EMPTY_TEST_WORLD } from './sim_shared';

const BLADE = 'redbrook_blade'; // uncommon warrior weapon, never soulbound
const WHITE = 'worn_sword'; // common: never binds

const makeWorld = () =>
  new Sim({ seed: 42, playerClass: 'warrior', noPlayer: true, world: EMPTY_TEST_WORLD });

function meta(sim: Sim, pid: number): PlayerMeta {
  const m = sim.ctx.players.get(pid);
  if (!m) throw new Error(`expected player ${pid}`);
  return m;
}

function placeAt(sim: Sim, pid: number, pos: { x: number; z: number }): void {
  const e = sim.entities.get(pid);
  if (!e) throw new Error('missing player');
  e.pos = { x: pos.x, y: groundHeight(pos.x, pos.z, sim.cfg.seed), z: pos.z };
  e.prevPos = { ...e.pos };
  sim.rebucket(e as Entity);
}

function errorTexts(events: SimEvent[]): string[] {
  return events.filter((e) => e.type === 'error').map((e) => (e as { text: string }).text);
}

/** Equip the blade and take it off again: the copy now sits in the bags bound. */
function wearOnce(sim: Sim, pid: number): void {
  sim.equipItem(BLADE, pid);
  expect(meta(sim, pid).equipment.mainhand).toBe(BLADE);
  expect(sim.unequipItem('mainhand', pid)).toBe(true);
}

function bladeSlot(sim: Sim, pid: number) {
  return expectDefined(meta(sim, pid).inventory.find((s) => s.itemId === BLADE));
}

function twoPlayers() {
  const sim = makeWorld();
  const alice = sim.addPlayer('warrior', 'Alice');
  const bob = sim.addPlayer('warrior', 'Bob');
  placeAt(sim, alice, { x: 0, z: 0 });
  placeAt(sim, bob, { x: 0, z: 0 });
  sim.drainEvents();
  return { sim, alice, bob };
}

function runTrade(sim: Sim, from: number, to: number, itemId: string): void {
  sim.tradeRequest(to, from);
  sim.tradeAccept(to);
  sim.tradeSetOffer([{ itemId, count: 1 }], 0, from);
  sim.tradeConfirm(from);
  sim.tradeConfirm(to);
}

describe('bind on equip: the equip path', () => {
  it('a worn green piece needs no payload; the copy that comes off is soulbound', () => {
    const sim = makeWorld();
    const pid = sim.addPlayer('warrior', 'Wearer');
    sim.addItem(BLADE, 1, pid);
    sim.equipItem(BLADE, pid);
    // Worn: bound by the slot, no marker of its own (every pre-existing
    // "plain worn copy" pin stays true).
    expect(meta(sim, pid).equipmentInstance?.mainhand).toBeUndefined();
    expect(sim.unequipItem('mainhand', pid)).toBe(true);
    const slot = bladeSlot(sim, pid);
    expect(slot.count).toBe(1);
    expect(slot.instance).toEqual({ soulbound: true });
  });

  it('a white piece stays a plain stack across the same round trip', () => {
    const sim = makeWorld();
    const pid = sim.addPlayer('warrior', 'Wearer');
    sim.addItem(WHITE, 1, pid);
    sim.equipItem(WHITE, pid);
    expect(sim.unequipItem('mainhand', pid)).toBe(true);
    const slot = expectDefined(meta(sim, pid).inventory.find((s) => s.itemId === WHITE));
    expect(slot.instance).toBeUndefined();
  });

  it('a bound copy never merges into a plain tradeable stack of the same item', () => {
    const sim = makeWorld();
    const pid = sim.addPlayer('warrior', 'Wearer');
    sim.addItem(BLADE, 2, pid);
    wearOnce(sim, pid);
    const slots = meta(sim, pid).inventory.filter((s) => s.itemId === BLADE);
    expect(slots.map((s) => [s.count, s.instance?.soulbound === true])).toEqual([
      [1, false],
      [1, true],
    ]);
  });

  it('swapping a worn piece for another benches the old one bound, and re-equipping keeps the marker', () => {
    const sim = makeWorld();
    const pid = sim.addPlayer('warrior', 'Wearer');
    sim.addItem(BLADE, 1, pid);
    sim.addItem(WHITE, 1, pid);
    sim.equipItem(BLADE, pid);
    sim.equipItem(WHITE, pid); // same slot: the blade comes off
    expect(bladeSlot(sim, pid).instance).toEqual({ soulbound: true });
    sim.equipItem(BLADE, pid);
    // The marker rides the worn payload and comes back with it: bound once,
    // bound for good, never stamped twice.
    expect(meta(sim, pid).equipmentInstance?.mainhand).toEqual({ soulbound: true });
    sim.unequipItem('mainhand', pid);
    expect(bladeSlot(sim, pid).instance).toEqual({ soulbound: true });
  });

  it('the bound copy survives a save/load round trip', () => {
    const sim = makeWorld();
    const pid = sim.addPlayer('warrior', 'Wearer');
    sim.addItem(BLADE, 1, pid);
    wearOnce(sim, pid);
    const state = expectDefined(sim.serializeCharacter(pid));
    const again = makeWorld();
    const loaded = again.addPlayer('warrior', 'Wearer', { state });
    expect(bladeSlot(again, loaded).instance).toEqual({ soulbound: true });
  });
});

describe('bind on equip: the pipes', () => {
  it('trades freely while never worn, never again once worn', () => {
    const { sim, alice, bob } = twoPlayers();
    sim.addItem(BLADE, 1, alice);
    runTrade(sim, alice, bob, BLADE);
    expect(sim.countItem(BLADE, alice)).toBe(0);
    expect(sim.countItem(BLADE, bob)).toBe(1);

    wearOnce(sim, bob);
    runTrade(sim, bob, alice, BLADE);
    expect(sim.countItem(BLADE, bob)).toBe(1);
    expect(sim.countItem(BLADE, alice)).toBe(0);
  });

  it('a bound copy never rides a raven', () => {
    const sim = makeWorld();
    const sender = sim.addPlayer('warrior', 'Sender');
    sim.addPlayer('mage', 'Rex');
    const box = expectDefined(sim.entities.get(sim.postOffice.mailboxIds[0]));
    placeAt(sim, sender, box.pos);
    meta(sim, sender).copper = 10000;
    sim.addItem(BLADE, 1, sender);
    wearOnce(sim, sender);
    sim.drainEvents();
    sim.mailSend(
      'Rex',
      'gift',
      'no',
      0,
      [{ itemId: BLADE, count: 1, instance: { soulbound: true } }],
      sender,
    );
    const codes = sim
      .drainEvents()
      .filter((e) => e.type === 'mailResult')
      .map((e) => (e as { code: string }).code);
    expect(codes).toContain('noMailBound');
    expect(sim.countItem(BLADE, sender)).toBe(1);
  });

  it('a bound copy never lists on the World Market', () => {
    // The full world: the Merchant is an ambient NPC the empty world strips.
    const sim = new Sim({ seed: 42, playerClass: 'warrior', noPlayer: true });
    const pid = sim.addPlayer('warrior', 'Lister');
    let merchant: Entity | undefined;
    for (const e of sim.entities.values()) if (e.templateId === 'the_merchant') merchant = e;
    placeAt(sim, pid, expectDefined(merchant).pos);
    sim.addItem(BLADE, 1, pid);
    wearOnce(sim, pid);
    sim.drainEvents();
    sim.marketListInstance(BLADE, 500, { soulbound: true }, pid);
    expect(errorTexts(sim.drainEvents())).toContain('That item is bound and cannot be listed.');
    expect(sim.marketListings.filter((l) => !l.house)).toHaveLength(0);
    expect(sim.countItem(BLADE, pid)).toBe(1);
  });

  it('the guild bank refuses the bound copy and accepts the never-worn one', () => {
    expect(guildBankPipeRefusal({ itemId: BLADE, count: 1 })).toBeNull();
    expect(guildBankPipeRefusal({ itemId: BLADE, count: 1, instance: { soulbound: true } })).toBe(
      'That item cannot be stored in the guild bank.',
    );
  });

  it("vendor sale stays open: the bound copy is still the owner's to sell", () => {
    const sim = new Sim({ seed: 42, playerClass: 'warrior', noPlayer: true });
    const pid = sim.addPlayer('warrior', 'Seller');
    let vendor: Entity | undefined;
    for (const e of sim.entities.values()) if (e.kind === 'npc' && e.vendorItems.length > 0) vendor = e;
    placeAt(sim, pid, expectDefined(vendor).pos);
    sim.addItem(BLADE, 1, pid);
    wearOnce(sim, pid);
    const before = meta(sim, pid).copper;
    sim.sellItem(BLADE, pid);
    expect(sim.countItem(BLADE, pid)).toBe(0);
    expect(meta(sim, pid).copper).toBeGreaterThan(before);
  });
});
