import { describe, expect, it } from 'vitest';
import {
  chargeGuildRosterPage,
  GUILD_ROSTER_BASE_MEMBERS,
  GUILD_ROSTER_MAX_MEMBERS,
  GUILD_ROSTER_MAX_PAGES,
  GUILD_ROSTER_PAGE_BASE_COPPER,
  GUILD_ROSTER_PAGE_PRICES,
  GUILD_ROSTER_PAGE_SEATS,
  guildRosterCap,
  guildRosterNextPagePrice,
  guildRosterPagesBought,
  refundGuildRosterPage,
} from '../src/sim/guild_roster';
import { Sim } from '../src/sim/sim';

const GOLD = 10_000;

function freshSim(): Sim {
  return new Sim({ seed: 7, playerClass: 'warrior', autoEquip: true });
}

const meta = (sim: Sim) => {
  const m = sim.players.get(sim.playerId);
  if (!m) throw new Error('missing meta');
  return m;
};

describe('guild roster ladder (data-as-code pins)', () => {
  it('pins the base roster, the page size, and the 500-seat ceiling', () => {
    expect(GUILD_ROSTER_BASE_MEMBERS).toBe(100);
    expect(GUILD_ROSTER_PAGE_SEATS).toBe(20);
    expect(GUILD_ROSTER_MAX_PAGES).toBe(20);
    expect(GUILD_ROSTER_MAX_MEMBERS).toBe(500);
  });

  it('prices page n at 20 gold times n squared, in whole gold, rising every page', () => {
    expect(GUILD_ROSTER_PAGE_BASE_COPPER).toBe(20 * GOLD);
    expect(GUILD_ROSTER_PAGE_PRICES).toHaveLength(GUILD_ROSTER_MAX_PAGES);
    GUILD_ROSTER_PAGE_PRICES.forEach((price, i) => {
      const page = i + 1;
      expect(price, `page ${page}`).toBe(GUILD_ROSTER_PAGE_BASE_COPPER * page * page);
      expect(price % GOLD, `page ${page} is whole gold`).toBe(0);
      if (i > 0) expect(price).toBeGreaterThan(GUILD_ROSTER_PAGE_PRICES[i - 1]);
    });
  });

  it('pins the headline prices: 20g first, 8,000g last, 57,400g for the whole charter', () => {
    expect(GUILD_ROSTER_PAGE_PRICES[0]).toBe(20 * GOLD);
    expect(GUILD_ROSTER_PAGE_PRICES[GUILD_ROSTER_MAX_PAGES - 1]).toBe(8_000 * GOLD);
    const total = GUILD_ROSTER_PAGE_PRICES.reduce((sum, p) => sum + p, 0);
    expect(total).toBe(57_400 * GOLD);
  });
});

describe('guildRosterPagesBought (the one load path)', () => {
  it('floors junk, negative, and fractional counts to zero pages', () => {
    expect(guildRosterPagesBought(undefined)).toBe(0);
    expect(guildRosterPagesBought(null)).toBe(0);
    expect(guildRosterPagesBought('3')).toBe(0);
    expect(guildRosterPagesBought(Number.NaN)).toBe(0);
    expect(guildRosterPagesBought(-1)).toBe(0);
    expect(guildRosterPagesBought(1.5)).toBe(0);
    expect(guildRosterPagesBought(0)).toBe(0);
  });

  it('passes in-range counts through and caps a count past the ladder', () => {
    expect(guildRosterPagesBought(1)).toBe(1);
    expect(guildRosterPagesBought(GUILD_ROSTER_MAX_PAGES)).toBe(GUILD_ROSTER_MAX_PAGES);
    expect(guildRosterPagesBought(GUILD_ROSTER_MAX_PAGES + 7)).toBe(GUILD_ROSTER_MAX_PAGES);
  });
});

describe('guildRosterCap / guildRosterNextPagePrice', () => {
  it('grows the cap by one page of seats per bought page up to the ceiling', () => {
    expect(guildRosterCap(0)).toBe(100);
    expect(guildRosterCap(1)).toBe(120);
    expect(guildRosterCap(5)).toBe(200);
    expect(guildRosterCap(GUILD_ROSTER_MAX_PAGES)).toBe(GUILD_ROSTER_MAX_MEMBERS);
    expect(guildRosterCap(GUILD_ROSTER_MAX_PAGES + 1)).toBe(GUILD_ROSTER_MAX_MEMBERS);
    expect(guildRosterCap(-3)).toBe(100);
  });

  it('looks the next price up by pages bought and goes null once the ladder is done', () => {
    expect(guildRosterNextPagePrice(0)).toBe(20 * GOLD);
    expect(guildRosterNextPagePrice(1)).toBe(80 * GOLD);
    expect(guildRosterNextPagePrice(GUILD_ROSTER_MAX_PAGES - 1)).toBe(8_000 * GOLD);
    expect(guildRosterNextPagePrice(GUILD_ROSTER_MAX_PAGES)).toBeNull();
    expect(guildRosterNextPagePrice(GUILD_ROSTER_MAX_PAGES + 4)).toBeNull();
  });
});

describe('chargeGuildRosterPage / refundGuildRosterPage (the purse half)', () => {
  it('charges exactly the price when the purse covers it', () => {
    const sim = freshSim();
    meta(sim).copper = 50 * GOLD;
    expect(chargeGuildRosterPage(sim.ctx, sim.playerId, 20 * GOLD)).toBe(20 * GOLD);
    expect(meta(sim).copper).toBe(30 * GOLD);
  });

  it('charges only what the purse holds when it is short (the caller refunds and refuses)', () => {
    const sim = freshSim();
    meta(sim).copper = 12 * GOLD;
    expect(chargeGuildRosterPage(sim.ctx, sim.playerId, 20 * GOLD)).toBe(12 * GOLD);
    expect(meta(sim).copper).toBe(0);
  });

  it('charges nothing for an empty purse, a bad price, or an unknown pid', () => {
    const sim = freshSim();
    meta(sim).copper = 0;
    expect(chargeGuildRosterPage(sim.ctx, sim.playerId, 20 * GOLD)).toBe(0);
    meta(sim).copper = 5 * GOLD;
    expect(chargeGuildRosterPage(sim.ctx, sim.playerId, 0)).toBe(0);
    expect(chargeGuildRosterPage(sim.ctx, sim.playerId, -1)).toBe(0);
    expect(chargeGuildRosterPage(sim.ctx, sim.playerId, Number.NaN)).toBe(0);
    expect(chargeGuildRosterPage(sim.ctx, 999_999, 20 * GOLD)).toBe(0);
    expect(meta(sim).copper).toBe(5 * GOLD);
  });

  it('refunds a reserved charge back to the purse, exactly once per call', () => {
    const sim = freshSim();
    meta(sim).copper = 30 * GOLD;
    const charged = chargeGuildRosterPage(sim.ctx, sim.playerId, 20 * GOLD);
    expect(refundGuildRosterPage(sim.ctx, sim.playerId, charged)).toBe(20 * GOLD);
    expect(meta(sim).copper).toBe(30 * GOLD);
  });

  it('refunds nothing for a bad amount or an unknown pid, and clamps at the safe bound', () => {
    const sim = freshSim();
    meta(sim).copper = 10;
    expect(refundGuildRosterPage(sim.ctx, sim.playerId, 0)).toBe(0);
    expect(refundGuildRosterPage(sim.ctx, sim.playerId, -5)).toBe(0);
    expect(refundGuildRosterPage(sim.ctx, 999_999, 5)).toBe(0);
    expect(meta(sim).copper).toBe(10);
    meta(sim).copper = Number.MAX_SAFE_INTEGER - 3;
    expect(refundGuildRosterPage(sim.ctx, sim.playerId, 10)).toBe(3);
    expect(meta(sim).copper).toBe(Number.MAX_SAFE_INTEGER);
  });
});
