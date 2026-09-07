// The waystone fee leaf (src/sim/waystone_fee.ts): distance pricing per started
// 100 yards over a floor, the guild-tier discount ladder (clamped), and the
// single end rounding both the sim and the HUD quote from.

import { describe, expect, it } from 'vitest';
import {
  WAYSTONE_FEE_MIN_COPPER,
  WAYSTONE_FEE_PER_100YD_COPPER,
  WAYSTONE_GUILD_DISCOUNT_PCT,
  WAYSTONES,
  type WaystoneDef,
  waystoneById,
} from '../src/sim/content/waystones';
import { GUILD_TIER_COUNT } from '../src/sim/guild_tier';
import {
  waystoneBaseFee,
  waystoneDistance,
  waystoneFee,
  waystoneGuildDiscountPct,
} from '../src/sim/waystone_fee';

function stone(id: string): WaystoneDef {
  const s = waystoneById(id);
  if (!s) throw new Error(`missing stone ${id}`);
  return s;
}

describe('waystoneBaseFee', () => {
  it('prices per STARTED 100 yards and never below the floor', () => {
    expect(waystoneBaseFee(0)).toBe(WAYSTONE_FEE_MIN_COPPER);
    expect(waystoneBaseFee(99)).toBe(WAYSTONE_FEE_MIN_COPPER);
    expect(waystoneBaseFee(250)).toBe(3 * WAYSTONE_FEE_PER_100YD_COPPER);
    expect(waystoneBaseFee(300)).toBe(3 * WAYSTONE_FEE_PER_100YD_COPPER);
    expect(waystoneBaseFee(300.01)).toBe(4 * WAYSTONE_FEE_PER_100YD_COPPER);
  });

  it('is a real gold sink: every cross-map hop costs more than a classic 5 silver hop fare', () => {
    for (const a of WAYSTONES) {
      for (const b of WAYSTONES) {
        if (a.id === b.id) continue;
        expect(waystoneFee(a, b, 0)).toBeGreaterThanOrEqual(WAYSTONE_FEE_MIN_COPPER);
        expect(waystoneFee(a, b, 0)).toBeGreaterThan(500);
      }
    }
  });
});

describe('waystoneGuildDiscountPct', () => {
  it('covers exactly the guild tier ladder and clamps outside it', () => {
    expect(WAYSTONE_GUILD_DISCOUNT_PCT).toHaveLength(GUILD_TIER_COUNT);
    expect(waystoneGuildDiscountPct(0)).toBe(0);
    for (let tier = 1; tier < GUILD_TIER_COUNT; tier++) {
      expect(waystoneGuildDiscountPct(tier)).toBeGreaterThan(waystoneGuildDiscountPct(tier - 1));
    }
    expect(waystoneGuildDiscountPct(-3)).toBe(0);
    expect(waystoneGuildDiscountPct(99)).toBe(WAYSTONE_GUILD_DISCOUNT_PCT[GUILD_TIER_COUNT - 1]);
    expect(waystoneGuildDiscountPct(1.9)).toBe(WAYSTONE_GUILD_DISCOUNT_PCT[1]);
  });
});

describe('waystoneFee', () => {
  it('applies the discount to the distance fee with one end rounding', () => {
    const from = stone('eastbrook');
    const to = stone('fenbridge');
    const base = waystoneBaseFee(waystoneDistance(from, to));
    expect(waystoneFee(from, to, 0)).toBe(base);
    expect(waystoneFee(from, to, 1)).toBe(Math.round((base * 90) / 100));
    expect(waystoneFee(from, to, GUILD_TIER_COUNT - 1)).toBe(
      Math.round((base * (100 - WAYSTONE_GUILD_DISCOUNT_PCT[GUILD_TIER_COUNT - 1])) / 100),
    );
  });

  it('is symmetric and grows with distance', () => {
    const eastbrook = stone('eastbrook');
    const fenbridge = stone('fenbridge');
    const lanternmere = stone('lanternmere');
    expect(waystoneFee(eastbrook, fenbridge, 0)).toBe(waystoneFee(fenbridge, eastbrook, 0));
    expect(waystoneFee(eastbrook, lanternmere, 0)).toBeGreaterThan(
      waystoneFee(eastbrook, fenbridge, 0),
    );
  });
});
