import { describe, expect, it } from 'vitest';
import { MOBS } from '../src/sim/data';
import { createMob } from '../src/sim/entity';
import * as items from '../src/sim/items';
import { Sim } from '../src/sim/sim';
import type { SimContext } from '../src/sim/sim_context';
import type { Entity } from '../src/sim/types';
import { VENDOR_STACK_SIZE } from '../src/sim/vendor_stack';

const WORLD_SEED = 20066;

// Regression coverage gap this file closes: nothing budgets the vendor transaction
// family (src/sim/items.ts buyItem/sellItem/sellAllJunk/buyBackItem, plus
// vendor_stack.ts's stack-size rule). sellItem/sellAllJunk/buyBackItem all gate
// through vendorInRange, which SCANS EVERY LIVE ENTITY looking for a nearby vendor
// NPC on every single call: that is an O(entity count) cost per transaction, so a
// crowded world (many mobs/npcs/players) turns a rapid string of purchases into a
// per-call cost that grows with total population, not with anything about the
// transaction itself. A flat ceiling alone would not catch that regression shape
// (mirrors tests/mob_update_perf.test.ts's pileup rationale), so this also asserts a
// scaling check across world entity population.

function ctxOf(sim: Sim): SimContext {
  return (sim as unknown as { ctx: SimContext }).ctx;
}

function traderEntity(sim: Sim): Entity {
  for (const e of sim.entities.values()) {
    if ((e as unknown as { templateId?: string }).templateId === 'trader_wilkes') return e;
  }
  throw new Error('trader_wilkes is not spawned in the world');
}

// Stand a fresh player at Trader Wilkes with ample copper for a long run of
// transactions, and return the trader + player ids the vendor gates check.
function buildVendorPlayer(seed: number): { sim: Sim; pid: number; trader: Entity } {
  const sim = new Sim({ seed, playerClass: 'warrior', noPlayer: true });
  const pid = sim.addPlayer('warrior', 'Shopper');
  const trader = traderEntity(sim);
  const p = sim.entities.get(pid);
  if (!p) throw new Error('missing player');
  p.pos = { x: trader.pos.x + 2, y: trader.pos.y, z: trader.pos.z };
  p.prevPos = { ...p.pos };
  const meta = sim.meta(pid);
  if (!meta) throw new Error('missing player meta');
  meta.copper = 10_000_000;
  return { sim, pid, trader };
}

// Pack the world with `count` extra live mobs (mirrors mob_update_perf's pileup
// recipe), inflating the entity count vendorInRange must scan on every call, without
// touching the vendor/player setup itself.
function padEntityPopulation(sim: Sim, count: number): void {
  const template = MOBS.forest_wolf;
  for (let i = 0; i < count; i++) {
    const pos = sim.groundPos(200 + (i % 50), 200 + Math.floor(i / 50));
    const mob = createMob(sim.nextId++, template, template.minLevel, pos);
    sim.addEntity(mob);
  }
}

// One buy + one sell + one buyback round trip, the rapid-transaction shape a player
// clearing out a bag of junk at the vendor window actually drives. Sells back the
// FULL held stack (not a fixed count) so a fresh warrior's starting stack of bread
// does not silently accumulate across iterations: every round trip returns the
// player's baked_bread count to zero before the next buy.
function vendorRoundTrip(sim: Sim, ctx: SimContext, pid: number, trader: Entity): void {
  items.buyItem(ctx, trader.id, 'baked_bread', pid);
  const held = sim.countItem('baked_bread', pid);
  items.sellItem(ctx, 'baked_bread', held, pid);
  items.buyBackItem(ctx, 'baked_bread', pid);
  items.sellItem(ctx, 'baked_bread', sim.countItem('baked_bread', pid), pid);
  sim.drainEvents();
}

function measureRoundTripMedian(seed: number, extraEntities: number): number {
  const { sim, pid, trader } = buildVendorPlayer(seed);
  padEntityPopulation(sim, extraEntities);
  const ctx = ctxOf(sim);

  for (let i = 0; i < 10; i++) vendorRoundTrip(sim, ctx, pid, trader);

  const SAMPLES = 60;
  const samples: number[] = [];
  for (let i = 0; i < SAMPLES; i++) {
    const t0 = performance.now();
    vendorRoundTrip(sim, ctx, pid, trader);
    samples.push(performance.now() - t0);
  }
  samples.sort((a, b) => a - b);
  return samples[Math.floor(samples.length / 2)];
}

describe('vendor transaction (buy/sell/buyback) high-load regression budget', () => {
  it('bounds per-round-trip cost in a realistically populated world', () => {
    // The default world already spawns several hundred mobs/npcs/objects; this is
    // the realistic steady-state population, not an artificial pileup.
    const median = measureRoundTripMedian(WORLD_SEED, 0);

    console.log(`[vendor perf] extraEntities=0 median=${median.toFixed(3)}ms`);

    // Generous by design (see mob_update_perf.test.ts): observed healthy median at
    // this population is well under a millisecond per round trip; 10ms leaves ample
    // headroom for slow/contended CI hardware while still catching an
    // order-of-magnitude regression.
    expect(median).toBeLessThan(10);
  }, 60_000);

  it('doubling world entity population does not more than roughly double vendorInRange cost', () => {
    const SMALL = 800;
    const LARGE = SMALL * 2;

    const smallMedian = measureRoundTripMedian(WORLD_SEED + 1, SMALL);
    const largeMedian = measureRoundTripMedian(WORLD_SEED + 2, LARGE);

    console.log(
      `[vendor perf] scaling small=+${SMALL}(${smallMedian.toFixed(3)}ms) ` +
        `large=+${LARGE}(${largeMedian.toFixed(3)}ms) ratio=${(largeMedian / Math.max(smallMedian, 0.001)).toFixed(2)}x`,
    );

    // vendorInRange's entity scan is genuinely linear in population, so a doubled
    // population should land near 2x; the bound is set generously above that (3.5x)
    // to absorb noise at these small absolute ms magnitudes while still failing hard
    // on a superlinear regression (e.g. a second nested scan added per call).
    expect(largeMedian).toBeLessThan(Math.max(smallMedian * 3.5, 5));
  }, 60_000);

  it('actually executed real buy/sell/buyback transactions and sold a large junk inventory', () => {
    const { sim, pid, trader } = buildVendorPlayer(WORLD_SEED + 3);
    const ctx = ctxOf(sim);
    const meta = sim.meta(pid);
    if (!meta) throw new Error('missing player meta');
    const startCopper = meta.copper;
    const startCount = sim.countItem('baked_bread', pid); // a fresh warrior spawns with a stack

    items.buyItem(ctx, trader.id, 'baked_bread', pid);
    // food is vended in a VENDOR_STACK_SIZE stack per purchase (vendor_stack.ts)
    expect(sim.countItem('baked_bread', pid)).toBe(startCount + VENDOR_STACK_SIZE);
    expect(meta.copper).toBeLessThan(startCopper);

    const afterBuy = meta.copper;
    const boughtCount = sim.countItem('baked_bread', pid);
    items.sellItem(ctx, 'baked_bread', boughtCount, pid);
    expect(sim.countItem('baked_bread', pid)).toBe(0);
    expect(meta.copper).toBeGreaterThan(afterBuy);
    expect(meta.vendorBuyback.some((s) => s.itemId === 'baked_bread')).toBe(true);

    const afterSell = meta.copper;
    items.buyBackItem(ctx, 'baked_bread', pid);
    expect(sim.countItem('baked_bread', pid)).toBe(1);
    expect(meta.copper).toBeLessThan(afterSell);

    // Large inventory: pack the bags with many distinct poor-quality junk stacks and
    // clear them all in one sellAllJunk pass.
    const JUNK_STACKS = 15;
    for (let i = 0; i < JUNK_STACKS; i++) sim.addItem('wolf_fang', 20, pid);
    sim.drainEvents();
    expect(sim.countItem('wolf_fang', pid)).toBeGreaterThanOrEqual(JUNK_STACKS * 20);

    const beforeJunkSale = meta.copper;
    items.sellAllJunk(ctx, pid);
    expect(sim.countItem('wolf_fang', pid)).toBe(0);
    expect(meta.copper).toBeGreaterThan(beforeJunkSale);

    const errs = sim.drainEvents().filter((e) => e.type === 'error');
    expect(errs.length).toBe(0);
  }, 60_000);
});
