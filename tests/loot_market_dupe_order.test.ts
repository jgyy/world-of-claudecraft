import { describe, expect, it } from 'vitest';
import { MOBS } from '../src/sim/data';
import { createGroundObject, createMob } from '../src/sim/entity';
import { Sim } from '../src/sim/sim';
import type { Entity } from '../src/sim/types';
import { groundHeight } from '../src/sim/world';

// Regression guard for the loot/market dupe invariant: every path that moves an
// item into a player's bags must CLEAR the source (loot slot / object / listing)
// BEFORE calling addItem. The credit-then-clear order is only safe because the
// sim is non-reentrant; a future reentrant/async addItem would let the same
// source be looted or bought twice. These tests fail on the old order by checking
// the source is already empty at the moment addItem is invoked.

function makeWorld() {
  return new Sim({ seed: 42, playerClass: 'warrior', noPlayer: true });
}

function teleport(sim: Sim, e: Entity, x: number, z: number) {
  e.pos.x = x;
  e.pos.z = z;
  e.pos.y = groundHeight(x, z, sim.cfg.seed);
  e.prevPos = { ...e.pos };
}

// Stand the player on top of the target so the INTERACT_RANGE gate passes.
function standOn(sim: Sim, pid: number, target: Entity) {
  teleport(sim, sim.entities.get(pid)!, target.pos.x, target.pos.z);
}

describe('loot/market dupe invariant: clear the source before crediting bags', () => {
  it('lootCorpse zeroes the open loot slot before addItem credits it', () => {
    const sim = makeWorld();
    const pid = sim.addPlayer('warrior', 'Looter');
    const looter = sim.entities.get(pid)!;
    teleport(sim, looter, 0, 0);

    // A dead, lootable corpse sitting under the looter with a 2-stack open slot.
    const template = Object.values(MOBS)[0];
    const mob = createMob(9999, template, template.minLevel, { ...looter.pos });
    mob.dead = true;
    mob.lootable = true;
    mob.tappedById = null;
    mob.loot = { copper: 0, items: [{ itemId: 'wolf_fang', count: 2, openToAll: true }] };
    sim.entities.set(mob.id, mob);

    const seen: number[] = [];
    const realAdd = sim.addItem.bind(sim);
    sim.addItem = (itemId: string, count: number, p?: number) => {
      // The slot being looted must already read 0 when we are credited.
      seen.push(mob.loot?.items[0]?.count ?? -1);
      return realAdd(itemId, count, p);
    };

    sim.lootCorpse(mob.id, pid);

    // Credited once per unit, and each time the source slot was already cleared.
    expect(seen).toEqual([0, 0]);
    expect(sim.countItem('wolf_fang', pid)).toBe(2);
  });

  it('pickUpObject closes the object before addItem credits it', () => {
    const sim = makeWorld();
    const pid = sim.addPlayer('warrior', 'Gatherer');

    const node = createGroundObject(9998, 'wolf_fang', 'Wolf Fang', {
      x: 5,
      y: groundHeight(5, 5, sim.cfg.seed),
      z: 5,
    });
    sim.entities.set(node.id, node);
    standOn(sim, pid, node);

    let lootableAtCredit: boolean | null = null;
    const realAdd = sim.addItem.bind(sim);
    sim.addItem = (itemId: string, count: number, p?: number) => {
      lootableAtCredit = node.lootable;
      return realAdd(itemId, count, p);
    };

    sim.pickUpObject(node.id, pid);

    expect(lootableAtCredit).toBe(false);
    expect(sim.countItem('wolf_fang', pid)).toBe(1);
  });

  it('marketBuy removes the listing before addItem credits the buyer', () => {
    const sim = makeWorld();
    const merchant = [...sim.entities.values()].find((e) => e.templateId === 'the_merchant')!;
    const seller = sim.addPlayer('warrior', 'Seller');
    const buyer = sim.addPlayer('warrior', 'Buyer');

    // List one Wolf Fang from the seller, standing on the Merchant for both.
    standOn(sim, seller, merchant);
    sim.addItem('wolf_fang', 1, seller);
    sim.marketList('wolf_fang', 1, 100, seller);
    standOn(sim, buyer, merchant);
    sim.players.get(buyer)!.copper = 1000;

    const listing = sim.marketListings.find((l) => l.itemId === 'wolf_fang' && !l.house)!;

    let listingPresentAtCredit: boolean | null = null;
    const realAdd = sim.addItem.bind(sim);
    sim.addItem = (itemId: string, count: number, p?: number) => {
      if (p === buyer) listingPresentAtCredit = sim.marketListings.some((l) => l.id === listing.id);
      return realAdd(itemId, count, p);
    };

    sim.marketBuy(listing.id, buyer);

    expect(listingPresentAtCredit).toBe(false);
    expect(sim.countItem('wolf_fang', buyer)).toBe(1);
    // No dupe left behind: the listing is gone exactly once.
    expect(sim.marketListings.some((l) => l.id === listing.id)).toBe(false);
  });
});
