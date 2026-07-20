// Coverage for the tradesRemaining primitive (types.ts ItemInstancePayload):
// a generic "tradeable exactly N times, then locked to whoever holds it"
// instance field, introduced for the disenchant epic-reagent economy
// (typed reagents and the ON_DEMAND_RECIPES they craft both mint
// tradesRemaining:1 instances) and enforced generically in
// src/sim/social/trade.ts, not special-cased per item.

import { describe, expect, it } from 'vitest';
import { Sim } from '../src/sim/sim';
import { groundHeight } from '../src/sim/world';

function makeWorld() {
  return new Sim({ seed: 42, playerClass: 'warrior', noPlayer: true });
}

function teleport(sim: Sim, pid: number, x: number, z: number) {
  const e = sim.entities.get(pid);
  if (!e) throw new Error(`missing entity ${pid}`);
  e.pos.x = x;
  e.pos.z = z;
  e.pos.y = groundHeight(x, z, sim.cfg.seed);
  e.prevPos = { ...e.pos };
}

function openTrade(sim: Sim, a: number, b: number) {
  teleport(sim, a, 0, -40);
  teleport(sim, b, 3, -40);
  sim.tradeRequest(b, a);
  sim.tradeAccept(b);
}

describe('trade-once-then-bound (tradesRemaining)', () => {
  it('a tradesRemaining:1 instance trades once, then is refused a second trade and carries boundTo', () => {
    const sim = makeWorld();
    const a = sim.addPlayer('mage', 'Aleph');
    const b = sim.addPlayer('warrior', 'Bet');
    const c = sim.addPlayer('priest', 'Gimel');
    sim.addItemInstance('arcane_bound_focus', { tradesRemaining: 1 }, a);

    // First trade: a -> b. Offerable and transfers.
    openTrade(sim, a, b);
    sim.tradeSetOffer([{ itemId: 'arcane_bound_focus', count: 1 }], 0, a);
    sim.tradeConfirm(a);
    sim.tradeConfirm(b);
    expect(sim.countItem('arcane_bound_focus', a)).toBe(0);
    expect(sim.countItem('arcane_bound_focus', b)).toBe(1);
    const bMeta = sim.meta(b);
    const bSlot = bMeta?.inventory.find((s) => s.itemId === 'arcane_bound_focus');
    expect(bSlot?.instance?.tradesRemaining).toBe(0);
    expect(bSlot?.instance?.boundTo).toBe(sim.entities.get(b)?.id);

    // Second trade attempt: b -> c. The now-locked copy is never offerable.
    teleport(sim, b, 0, -40);
    teleport(sim, c, 3, -40);
    sim.tradeRequest(c, b);
    sim.tradeAccept(c);
    sim.tradeSetOffer([{ itemId: 'arcane_bound_focus', count: 1 }], 0, b);
    sim.tradeConfirm(b);
    sim.tradeConfirm(c);
    expect(sim.countItem('arcane_bound_focus', b)).toBe(1); // still with b
    expect(sim.countItem('arcane_bound_focus', c)).toBe(0);
  });

  it('an instance with no tradesRemaining is completely unaffected (regression guard)', () => {
    const sim = makeWorld();
    const a = sim.addPlayer('mage', 'Aleph');
    const b = sim.addPlayer('warrior', 'Bet');
    sim.addItemInstance('arcane_bound_focus', { signer: 'SomeCrafter' }, a);

    openTrade(sim, a, b);
    sim.tradeSetOffer([{ itemId: 'arcane_bound_focus', count: 1 }], 0, a);
    sim.tradeConfirm(a);
    sim.tradeConfirm(b);
    expect(sim.countItem('arcane_bound_focus', a)).toBe(0);
    expect(sim.countItem('arcane_bound_focus', b)).toBe(1);
    const bSlot = sim.meta(b)?.inventory.find((s) => s.itemId === 'arcane_bound_focus');
    expect(bSlot?.instance?.tradesRemaining).toBeUndefined();
    expect(bSlot?.instance?.boundTo).toBeUndefined();
    expect(bSlot?.instance?.signer).toBe('SomeCrafter');
  });

  it('a tradesRemaining:2 instance survives one trade at count 1, still offerable', () => {
    const sim = makeWorld();
    const a = sim.addPlayer('mage', 'Aleph');
    const b = sim.addPlayer('warrior', 'Bet');
    sim.addItemInstance('arcane_bound_focus', { tradesRemaining: 2 }, a);

    openTrade(sim, a, b);
    sim.tradeSetOffer([{ itemId: 'arcane_bound_focus', count: 1 }], 0, a);
    sim.tradeConfirm(a);
    sim.tradeConfirm(b);
    const bSlot = sim.meta(b)?.inventory.find((s) => s.itemId === 'arcane_bound_focus');
    expect(bSlot?.instance?.tradesRemaining).toBe(1);
    expect(bSlot?.instance?.boundTo).toBeUndefined();
  });
});
