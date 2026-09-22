// The honing tuning leaf (src/sim/progression/honing_policy.ts): the cost
// ladder, the chance curve and floor, the glow tiers, the spendable pool, the
// stat guard, and the inlined payload union. Pure, no Sim.
import { describe, expect, it } from 'vitest';
import {
  HONING_BASE_CHANCE,
  HONING_CHANCE_STEP,
  HONING_COPPER_BASE,
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

describe('honing_policy', () => {
  it('honingCost burns rank + 1 levels and a quadratic fee, monotonic, 55 levels for a walk', () => {
    expect(honingCost(0)).toEqual({ levels: 1, copper: HONING_COPPER_BASE });
    expect(honingCost(9)).toEqual({ levels: 10, copper: HONING_COPPER_BASE * 100 });
    expect(honingCost(-3)).toEqual(honingCost(0));
    expect(honingCost(2.9)).toEqual(honingCost(2));
    let levels = 0;
    let copper = 0;
    for (let rank = 0; rank < HONING_MAX_RANK; rank++) {
      expect(honingCost(rank + 1).levels).toBeGreaterThan(honingCost(rank).levels);
      expect(honingCost(rank + 1).copper).toBeGreaterThan(honingCost(rank).copper);
      levels += honingCost(rank).levels;
      copper += honingCost(rank).copper;
    }
    expect(levels).toBe(55);
    expect(copper).toBe(HONING_COPPER_BASE * 385);
  });

  it('honingChance starts at the base, loses one step per rank, never falls under the floor', () => {
    expect(honingChance(0)).toBe(HONING_BASE_CHANCE);
    expect(honingChance(1)).toBeCloseTo(HONING_BASE_CHANCE - HONING_CHANCE_STEP);
    for (let rank = 1; rank <= HONING_MAX_RANK + 5; rank++) {
      expect(honingChance(rank)).toBeGreaterThanOrEqual(HONING_MIN_CHANCE);
      expect(honingChance(rank)).toBeLessThanOrEqual(honingChance(rank - 1));
    }
    expect(honingChance(1000)).toBe(HONING_MIN_CHANCE);
  });

  it('honingGlowTier lights at the first threshold and blazes at the cap', () => {
    expect(HONING_GLOW_RANKS[HONING_GLOW_RANKS.length - 1]).toBe(HONING_MAX_RANK);
    expect(honingGlowTier(HONING_GLOW_RANKS[0] - 1)).toBe(0);
    expect(honingGlowTier(HONING_GLOW_RANKS[0])).toBe(1);
    expect(honingGlowTier(HONING_GLOW_RANKS[1])).toBe(2);
    expect(honingGlowTier(HONING_MAX_RANK)).toBe(HONING_GLOW_RANKS.length);
  });

  it('unspentVirtualLevels is the levels past the cap minus the ledger, floored at zero', () => {
    expect(unspentVirtualLevels(xpToReachLevel(MAX_LEVEL), 0)).toBe(0);
    expect(unspentVirtualLevels(xpToReachLevel(MAX_LEVEL + 6), 4)).toBe(2);
    expect(unspentVirtualLevels(xpToReachLevel(MAX_LEVEL + 6), 40)).toBe(0);
    expect(unspentVirtualLevels(xpToReachLevel(5), 0)).toBe(0);
    expect(unspentVirtualLevels(xpToReachLevel(MAX_LEVEL + 3), -9)).toBe(3);
  });

  it('isHoningStat admits exactly the five primary stats, and types.ts inlines the same union', () => {
    expect([...HONING_STATS]).toEqual(['str', 'agi', 'sta', 'int', 'spi']);
    for (const stat of HONING_STATS) expect(isHoningStat(stat)).toBe(true);
    for (const bad of ['armor', 'critRating', 1, undefined]) expect(isHoningStat(bad)).toBe(false);
    const stats: Partial<Record<HoningStat, number>> = {};
    const record: NonNullable<ItemInstancePayload['honing']> = { rank: 0, stats };
    for (const stat of HONING_STATS) record.stats[stat] = 1;
    expect(Object.keys(record.stats).sort()).toEqual([...HONING_STATS].sort());
  });
});
