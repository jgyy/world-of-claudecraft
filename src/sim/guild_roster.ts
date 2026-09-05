// Guild roster expansion: how many members a guild may seat, and what the
// next seat block costs. The guild-scale sibling of the two slot ladders
// (bank.ts BANK_EXPANSION_PRICES, guild_bank.ts GUILD_BANK_RUNG_PRICES): a
// guild starts at GUILD_ROSTER_BASE_MEMBERS seats and grows in fixed-size
// PAGES the Guild Master buys, one at a time, from their OWN purse. Purse-paid
// on purpose (the guild creation fee precedent, reserve-at-gate and refunded
// on every refusal arm): the roster lives in the server social DB, so a
// treasury-paid page would have to drag the guild bank's escrow ledger into a
// mutation the bank never sees. A guild that wants to pool gold for a page
// withdraws it from the treasury to the Guild Master first.
//
// THE PRICE CURVE (data-as-code, ALWAYS a table lookup by pages already
// bought, never a client-supplied value): page n (1-based) costs
// GUILD_ROSTER_PAGE_BASE_COPPER * n * n, so the first page is 20 gold, the
// second 80, the tenth 2,000, the twentieth 8,000 (500 seats for 57,400 gold
// in total), and the forty-fifth 40,500; every seat on page n costs n squared
// gold. The square keeps the early pages within reach of a guild that has
// just outgrown its base roster while making everything past 500 seats cost
// more than the realm holds: 700 seats (30 pages) is 189,100 gold in total,
// above the whole gold supply in circulation when this shipped.
// tests/guild_roster.test.ts pins the formula, the whole-gold property, and
// the totals.
//
// THE HARD CAP (GUILD_ROSTER_MAX_MEMBERS, 1,000 seats, 45 pages, 627,900 gold
// in total) is an engineering bound, not the design's ceiling: the rename
// fan-out, the admin backoffice reads, the page compare-and-set, and the map
// label budget are all bounded by it, and it sits where the curve has already
// priced the roster far past any purse the realm can assemble.
//
// The persisted count is the number of pages BOUGHT (guilds.roster_pages), not
// the cap: the cap and the next price both derive from it here, so a tampered
// or legacy value can never index a price it did not pay for
// (guildRosterPagesBought floors it into range, the guildBankRungsBought
// idiom).
//
// `src/sim`-pure: no DOM/Three/render-ui-game-net imports, no Math.random or
// Date.now (enforced by tests/architecture.test.ts). Draws NO rng.

import type { SimContext } from './sim_context';

/** Seats every guild has from its founding. */
export const GUILD_ROSTER_BASE_MEMBERS = 100;

/** Seats one bought page adds. */
export const GUILD_ROSTER_PAGE_SEATS = 20;

/** Copper price of the FIRST page (20 gold); page n costs this times n squared. */
export const GUILD_ROSTER_PAGE_BASE_COPPER = 200_000;

/** How many pages the ladder has: the purchase cap (the hard cap in the
 *  header, 1,000 seats). */
export const GUILD_ROSTER_MAX_PAGES = 45;

/** Copper price of each page, indexed by pages ALREADY bought (index 0 is the
 *  first page): the header's formula, materialised once so every price read
 *  stays a table lookup by pages bought (the bank ladder idiom) and never a
 *  client-supplied value. tests/guild_roster.test.ts pins the headline
 *  anchors as literals (20g first, 8,000g twentieth, 40,500g last, and the
 *  57,400g and 627,900g totals), so a drift in the formula reddens there. */
export const GUILD_ROSTER_PAGE_PRICES: readonly number[] = Array.from(
  { length: GUILD_ROSTER_MAX_PAGES },
  (_, index) => GUILD_ROSTER_PAGE_BASE_COPPER * (index + 1) * (index + 1),
);

/** The largest roster any guild can reach (1,000): the absolute bound every
 *  roster read pages at and every fan-out is bounded by. */
export const GUILD_ROSTER_MAX_MEMBERS =
  GUILD_ROSTER_BASE_MEMBERS + GUILD_ROSTER_MAX_PAGES * GUILD_ROSTER_PAGE_SEATS;

/** The ONE load path for a persisted pages-bought count: a non-integer,
 *  negative, or absent value reads as zero pages and a count past the ladder
 *  floors to the ladder's length, so cap and price indexing stay coherent on
 *  a tampered or legacy row. */
export function guildRosterPagesBought(raw: unknown): number {
  if (typeof raw !== 'number' || !Number.isInteger(raw) || raw <= 0) return 0;
  return Math.min(raw, GUILD_ROSTER_MAX_PAGES);
}

/** Seats a guild may fill after `pages` bought pages. */
export function guildRosterCap(pages: number): number {
  return GUILD_ROSTER_BASE_MEMBERS + guildRosterPagesBought(pages) * GUILD_ROSTER_PAGE_SEATS;
}

/** Copper price of the NEXT page after `pages` bought pages, or null once the
 *  ladder is complete. */
export function guildRosterNextPagePrice(pages: number): number | null {
  return GUILD_ROSTER_PAGE_PRICES[guildRosterPagesBought(pages)] ?? null;
}

/** Deduct a page's price from the acting player's purse, returning the copper
 *  actually charged (short when the purse cannot cover it: the caller refunds
 *  and refuses, never seats a discounted page). RESERVE-AT-GATE, the guild
 *  creation fee's flow: the server charges this synchronously BEFORE the DB
 *  write and refunds on every refusal arm (refundGuildRosterPage). Silent by
 *  design: the roster broadcast is the celebration, and the purse delta rides
 *  the normal self snapshot. */
export function chargeGuildRosterPage(ctx: SimContext, pid: number, price: number): number {
  const r = ctx.resolve(pid);
  if (!r) return 0;
  if (!Number.isSafeInteger(price) || price <= 0) return 0;
  const charged = Math.min(r.meta.copper, price);
  if (charged <= 0) return 0;
  r.meta.copper -= charged;
  return charged;
}

/** Return a reserved page price to the acting player's purse (the refusal arm
 *  of the flow above). Clamped so the purse can never exceed the integer-safe
 *  bound; returns the copper actually refunded, and refunds nothing for an
 *  unresolvable pid (the server logs that arm loudly for operator
 *  compensation). */
export function refundGuildRosterPage(ctx: SimContext, pid: number, amount: number): number {
  const r = ctx.resolve(pid);
  if (!r) return 0;
  if (!Number.isSafeInteger(amount) || amount <= 0) return 0;
  const refunded = Math.min(amount, Number.MAX_SAFE_INTEGER - r.meta.copper);
  if (refunded <= 0) return 0;
  r.meta.copper += refunded;
  return refunded;
}
