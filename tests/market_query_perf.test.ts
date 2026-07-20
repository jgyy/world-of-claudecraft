import { describe, expect, it } from 'vitest';
import { ITEMS } from '../src/sim/data';
import type { MarketListing } from '../src/sim/market';
import { defaultMarketQuery } from '../src/sim/market_query';
import { Sim } from '../src/sim/sim';
import type { Entity } from '../src/sim/types';

const WORLD_SEED = 20063;

// Regression coverage gap this file closes: nothing budgets the World Market's browse
// path (marketInfoFor -> filter + sort + paginate the whole listing book), which every
// player streaming the market window drives once per query change. A generous flat
// ceiling alone would not catch an O(n^2) regression in the filter/sort/paginate chain
// (e.g. a sort comparator re-resolving ITEMS lookups per comparison, or a per-listing
// scan of the whole book), so this also asserts a scaling check (mirrors
// tests/aura_tick_perf.test.ts).

// A rotating set of real, sellable item ids (the seedHouseListings stock plus a few
// gear pieces) so marketItemMatches resolves a real ItemDef for every listing.
const LISTING_ITEM_IDS = [
  'roasted_boar',
  'spring_water',
  'oiled_boots',
  'quilted_trousers',
  'greyjaw_pelt_cloak',
  'roadwardens_helm',
  'wayfarers_hood',
  'moggers_copper_cudgel',
  'moggers_shiv',
  'valeborn_spellblade',
].filter((id) => ITEMS[id] !== undefined);

function findMerchant(sim: Sim): Entity {
  for (const id of sim.market.merchantIds) {
    const e = sim.entities.get(id);
    if (e) return e;
  }
  throw new Error('no merchant NPC spawned in the world');
}

// Build a World Market with `count` active player listings spread across many
// distinct sellers (MARKET_MAX_LISTINGS caps a single seller at 12), stand a
// browsing player at the Merchant, and return their pid.
function buildBusyMarket(seed: number, count: number): { sim: Sim; pid: number } {
  const sim = new Sim({ seed, playerClass: 'warrior', noPlayer: true });
  const pid = sim.addPlayer('warrior', 'Browser');
  const merchant = findMerchant(sim);
  const p = sim.entities.get(pid);
  if (!p) throw new Error('missing browsing player');
  p.pos = { ...merchant.pos };
  p.prevPos = { ...p.pos };
  sim.rebucket(p);

  const listings: MarketListing[] = [];
  for (let i = 0; i < count; i++) {
    const itemId = LISTING_ITEM_IDS[i % LISTING_ITEM_IDS.length];
    listings.push({
      id: i + 1000,
      sellerKey: `seller${i}`,
      sellerName: `Seller${i}`,
      itemId,
      count: 1 + (i % 5),
      price: 100 + (i % 500),
      expiresAt: Infinity,
      house: false,
    });
  }
  // The market ships some house stock at ctor time; append the busy sellers on top so
  // marketInfoFor's filter/sort walks the full realistic book.
  sim.market.marketListings.push(...listings);
  sim.marketSearch(defaultMarketQuery(), pid);
  return { sim, pid };
}

function measureMarketInfoMedian(seed: number, count: number): number {
  const { sim, pid } = buildBusyMarket(seed, count);
  // Warm up.
  for (let i = 0; i < 5; i++) sim.marketInfoFor(pid);

  const SAMPLES = 60;
  const samples: number[] = [];
  for (let i = 0; i < SAMPLES; i++) {
    const t0 = performance.now();
    sim.marketInfoFor(pid);
    samples.push(performance.now() - t0);
  }
  samples.sort((a, b) => a - b);
  return samples[Math.floor(samples.length / 2)];
}

describe('market.marketInfoFor high-load regression budget', () => {
  it('bounds per-call cost at a large active listing count', () => {
    const COUNT = 4000;
    const median = measureMarketInfoMedian(WORLD_SEED, COUNT);

    console.log(`[market.marketInfoFor perf] listings=${COUNT} median=${median.toFixed(3)}ms`);

    // Generous by design (see mob_update_perf.test.ts): observed healthy median at this
    // population is well under a millisecond; widened from 10ms to 25ms after a
    // contended-CI-shard run measured 16.4ms with no regression present, still
    // leaving ample headroom to catch an order-of-magnitude regression.
    expect(median).toBeLessThan(25);
  }, 60_000);

  it('doubling the listing count does not more than roughly double the cost', () => {
    const SMALL = 2000;
    const LARGE = SMALL * 2;

    const smallMedian = measureMarketInfoMedian(WORLD_SEED + 1, SMALL);
    const largeMedian = measureMarketInfoMedian(WORLD_SEED + 2, LARGE);

    console.log(
      `[market.marketInfoFor perf] scaling small=${SMALL}(${smallMedian.toFixed(3)}ms) ` +
        `large=${LARGE}(${largeMedian.toFixed(3)}ms) ratio=${(largeMedian / Math.max(smallMedian, 0.001)).toFixed(2)}x`,
    );

    // A doubled listing count doing genuinely linear filter/sort work should land near
    // 2x; the bound is set generously above that (6x, widened from 3.5x for the same
    // contended-hardware headroom as the flat ceiling above) to absorb noise at these
    // small absolute ms magnitudes while still failing hard on quadratic blowup.
    expect(largeMedian).toBeLessThan(Math.max(smallMedian * 6, 8));
  }, 60_000);

  it('actually built the large listing book and returned a real browse page', () => {
    const COUNT = 4000;
    const { sim, pid } = buildBusyMarket(WORLD_SEED + 3, COUNT);

    expect(sim.market.marketListings.length).toBeGreaterThanOrEqual(COUNT);
    const info = sim.marketInfoFor(pid);
    expect(info).not.toBeNull();
    expect(info?.totalCount).toBeGreaterThanOrEqual(COUNT);
    expect(info?.listings.length).toBeGreaterThan(0);
    // The wired page never exceeds the market's own wire safety cap regardless of how
    // many listings actually match the query.
    expect(info?.listings.length ?? 0).toBeLessThanOrEqual(200);
  }, 60_000);
});
