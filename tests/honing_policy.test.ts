// The honing tuning leaf (src/sim/progression/honing_policy.ts): the cost
// ladder, the chance curve and its floor, the glow tiers, the spendable pool
// over the persisted ledger, and the stat guard. Pure, no Sim.
import { describe, expect, it } from 'vitest';
import {
  HONING_BASE_CHANCE,
  HONING_CHANCE_STEP,
  HONING_COPPER_BASE,
  HONING_FAIL_RESETS,
  HONING_GLOW_RANKS,
  HONING_MAX_RANK,
  HONING_MIN_CHANCE,
  HONING_STATS,
  type HoningStat,
  honingChance,
  honingCost,
  honingGlowTier,
  isHoningStat,
  unspentVirtualLevels,
} from '../src/sim/progression/honing_policy';
import { type ItemInstancePayload, MAX_LEVEL, xpToReachLevel } from '../src/sim/types';

describe('honingCost', () => {
  it('burns rank + 1 virtual levels and a quadratic fee', () => {
    expect(honingCost(0)).toEqual({ levels: 1, copper: HONING_COPPER_BASE });
    expect(honingCost(1)).toEqual({ levels: 2, copper: HONING_COPPER_BASE * 4 });
    expect(honingCost(9)).toEqual({ levels: 10, copper: HONING_COPPER_BASE * 100 });
  });

  it('is monotonic across the whole ladder and totals 55 levels for a full walk', () => {
    let levels = 0;
    let copper = 0;
    for (let rank = 0; rank < HONING_MAX_RANK; rank++) {
      const cost = honingCost(rank);
      const next = honingCost(rank + 1);
      expect(next.levels).toBeGreaterThan(cost.levels);
      expect(next.copper).toBeGreaterThan(cost.copper);
      levels += cost.levels;
      copper += cost.copper;
    }
    expect(levels).toBe(55);
    expect(copper).toBe(HONING_COPPER_BASE * 385);
  });

  it('treats a negative or fractional rank as its floor', () => {
    expect(honingCost(-3)).toEqual(honingCost(0));
    expect(honingCost(2.9)).toEqual(honingCost(2));
  });
});

describe('honingChance', () => {
  it('starts at the base, loses one step per rank, and never falls under the floor', () => {
    expect(honingChance(0)).toBe(HONING_BASE_CHANCE);
    expect(honingChance(1)).toBeCloseTo(HONING_BASE_CHANCE - HONING_CHANCE_STEP);
    for (let rank = 0; rank <= HONING_MAX_RANK + 5; rank++) {
      expect(honingChance(rank)).toBeGreaterThanOrEqual(HONING_MIN_CHANCE);
      expect(honingChance(rank)).toBeLessThanOrEqual(HONING_BASE_CHANCE);
      if (rank > 0) expect(honingChance(rank)).toBeLessThanOrEqual(honingChance(rank - 1));
    }
    expect(honingChance(1000)).toBe(HONING_MIN_CHANCE);
  });

  it('ships the grindy default: a failed roll keeps the piece', () => {
    expect(HONING_FAIL_RESETS).toBe(false);
  });
});

describe('honingGlowTier', () => {
  it('lights at the first threshold, brightens at each, and blazes at the cap', () => {
    expect(HONING_GLOW_RANKS[HONING_GLOW_RANKS.length - 1]).toBe(HONING_MAX_RANK);
    expect(honingGlowTier(0)).toBe(0);
    expect(honingGlowTier(HONING_GLOW_RANKS[0] - 1)).toBe(0);
    expect(honingGlowTier(HONING_GLOW_RANKS[0])).toBe(1);
    expect(honingGlowTier(HONING_GLOW_RANKS[1])).toBe(2);
    expect(honingGlowTier(HONING_MAX_RANK)).toBe(HONING_GLOW_RANKS.length);
  });
});

describe('unspentVirtualLevels', () => {
  it('is the virtual levels past the cap minus the ledger, floored at zero', () => {
    const atCap = xpToReachLevel(MAX_LEVEL);
    expect(unspentVirtualLevels(atCap, 0)).toBe(0);
    expect(unspentVirtualLevels(xpToReachLevel(MAX_LEVEL + 6), 0)).toBe(6);
    expect(unspentVirtualLevels(xpToReachLevel(MAX_LEVEL + 6), 4)).toBe(2);
    expect(unspentVirtualLevels(xpToReachLevel(MAX_LEVEL + 6), 40)).toBe(0);
    // a pre-cap character earns nothing to spend
    expect(unspentVirtualLevels(xpToReachLevel(5), 0)).toBe(0);
    // a corrupt negative ledger reads as zero spent, never as a credit
    expect(unspentVirtualLevels(xpToReachLevel(MAX_LEVEL + 3), -9)).toBe(3);
  });
});

describe('isHoningStat', () => {
  it('admits exactly the five primary stats', () => {
    expect([...HONING_STATS]).toEqual(['str', 'agi', 'sta', 'int', 'spi']);
    for (const stat of HONING_STATS) expect(isHoningStat(stat)).toBe(true);
    expect(isHoningStat('armor')).toBe(false);
    expect(isHoningStat('critRating')).toBe(false);
    expect(isHoningStat(1)).toBe(false);
    expect(isHoningStat(undefined)).toBe(false);
  });
});

describe('the payload stat union', () => {
  it('types.ts inlines exactly HONING_STATS (a content -> sim import cycle keeps it inline)', () => {
    const stats: Partial<Record<HoningStat, number>> = {};
    // Compile-time pin: a stat missing from the inlined union would fail to assign.
    const record: NonNullable<ItemInstancePayload['honing']> = { rank: 0, stats };
    for (const stat of HONING_STATS) record.stats[stat] = 1;
    expect(Object.keys(record.stats).sort()).toEqual([...HONING_STATS].sort());
  });
});
