// The World Market: the Merchant's auction house. Extracted from sim.ts (session
// L2) as a pure MOVE behind SimContext. This module OWNS the shared listing book,
// the per-seller collections, the listing-id counter, and the Merchant entity id;
// the inventory hub (addItem/removeItem/countItem) STAYS on Sim and is consumed
// through SimContext. Mirrors the A1 PartyMachine / T1 Targeting pattern (state
// moved INTO the class); Sim keeps thin same-named delegates so the server, the
// IWorld surface, and the /listings readout call sites resolve unchanged.
//
// `src/sim`-pure: no DOM/Three/render-ui-game-net imports, no Math.random/Date.now
// (enforced by tests/architecture.test.ts). Only the fee-pool giveaway draw
// (updateFeePool/pickFeePoolReward) draws rng; everything else in this module does not.

import { ITEMS } from './data';
import { formatMoney } from './format_money';
import {
  MARKET_PAGE_SIZE,
  type MarketQuery,
  marketItemMatches,
  sanitizeMarketQuery,
} from './market_query';
import type { PlayerMeta } from './sim';
import type { SimContext } from './sim_context';
import { dist2d, type Entity, INTERACT_RANGE, type InvSlot, type ItemDef } from './types';

const MARKET_RANGE = INTERACT_RANGE + 2; // you must stand at the Merchant to deal
// the /listings readout (still on Sim) reports the seller's count against this cap,
// so it is the one const exported back to sim.ts; the rest are market-internal.
export const MARKET_MAX_LISTINGS = 12; // active player listings per seller
const MARKET_MIN_PRICE = 1; // copper
const MARKET_MAX_PRICE = 5_000_000; // 500g ceiling — guards against overflow / fat-finger
const MARKET_CUT = 0.05; // the Merchant's cut on a completed sale
const MARKET_LISTING_DURATION = 48 * 3600; // sim-seconds an unsold listing lingers before returning
const MARKET_WIRE_LIMIT = 120; // most listings shipped to one client at a time
// RS-style Grand Exchange tax sink: rather than simply destroying the Merchant's cut,
// it accumulates into a shared pool that periodically funds a giveaway (see
// updateFeePool). Roughly a daily cadence in sim time; a quiet trade week just carries
// the pool into the next draw instead of forcing an empty one.
const MARKET_FEE_POOL_DRAW_INTERVAL = 24 * 3600; // sim-seconds between giveaway draws
const MARKET_FEE_POOL_REWARD_KINDS = new Set(['weapon', 'armor']);

// Eligibility for a fee-pool reward: epic/legendary weapon or armor, never a heroic
// remix (those are dungeon-locked) or soulbound gear (those can't be handed out as a
// tradeable prize). Shared by the minimum-draw-threshold calc and the reward roll
// itself so the two can never drift.
function isFeePoolRewardItem(d: ItemDef): boolean {
  return (
    (d.quality === 'epic' || d.quality === 'legendary') &&
    MARKET_FEE_POOL_REWARD_KINDS.has(d.kind) &&
    !d.heroicOf &&
    !d.soulbound
  );
}

// A participant's identity captured at TRADE time (not resolved later from the
// live roster at draw time). This is the fix for a real bug: the pool accumulates
// over a full MARKET_FEE_POOL_DRAW_INTERVAL (24 sim-hours), so a winner who has
// since logged out is the common case, not an edge case. Resolving `name`/`cls`
// from `ctx.players` at draw time meant an offline winner's raw character/entity
// id leaked into the server-wide announcement, and their class-eligible reward
// pool silently shrank to only classless items. Capturing the display name (always
// known, straight off the listing/meta) and class (best effort - only knowable if
// the trader happened to still be online at their OWN trade) at participation time
// removes both failure modes.
interface FeePoolParticipant {
  key: string;
  name: string;
  cls: PlayerMeta['cls'] | undefined;
}

export interface MarketListing {
  id: number;
  sellerKey: string; // stable seller identity (character id string); '' for house stock
  sellerName: string; // display name
  itemId: string;
  count: number;
  price: number; // total copper buyout for the whole stack
  expiresAt: number; // sim.time seconds; Infinity for the Merchant's own stock
  house: boolean; // the Merchant's standing stock: never expires, never depletes, pays no one
}

// Gold + items awaiting pickup at the Merchant (sale proceeds, expired
// listings), keyed by sellerKey so an offline seller can collect later.
export interface MarketCollection {
  copper: number;
  items: InvSlot[];
}

// Persistable market state. `secondsLeft` is stored instead of an absolute
// expiry because sim.time resets to 0 each server boot — on load it becomes
// `this.time + secondsLeft`, so a restart never silently expires everything.
export interface MarketSave {
  listings: {
    id: number;
    sellerKey: string;
    sellerName: string;
    itemId: string;
    count: number;
    price: number;
    secondsLeft: number;
  }[];
  collections: { key: string; copper: number; items: InvSlot[] }[];
  nextListingId: number;
  // The fee-pool giveaway (see MARKET_FEE_POOL_DRAW_INTERVAL). Optional so an old
  // save (predating this feature) loads with an empty pool and a fresh countdown,
  // exactly like an absent listing/collection field.
  feePoolCopper?: number;
  feePoolDrawSecondsLeft?: number;
}

export class Market {
  // the World Market: one shared listing book, per-seller collections keyed by
  // stable character identity, and the Merchant entity these are anchored to.
  // `marketListings` is read through Sim's public `marketListings` getter (the
  // /listings readout + tests); the rest are market-internal.
  marketListings: MarketListing[] = [];
  private marketCollections = new Map<string, MarketCollection>();
  private nextListingId = 1;
  // Entity ids of every NPC with `market: true`, assigned by the Sim ctor during NPC
  // placement (the NPC loop stays on Sim). The World Market is a single shared book;
  // any of these merchants is a valid place to stand and deal, so a player can use the
  // auction house at whichever auctioneer is closest.
  merchantIds: number[] = [];
  // Fee-pool giveaway state (see MARKET_FEE_POOL_DRAW_INTERVAL). `feePoolParticipants`
  // is every seller/buyer key that traded since the last draw, so the winner is drawn
  // from people who actually used the market, not the whole player roster.
  feePoolCopper = 0;
  // Keyed by seller/buyer key so a repeat trader within one draw cycle only gets one
  // entry (dedupes), but the VALUE is captured at participation time - see
  // FeePoolParticipant above.
  private feePoolParticipants = new Map<string, FeePoolParticipant>();
  // Public like MarketListing.expiresAt: tests force a draw the same way they force a
  // listing expiry, by moving the deadline into the past then ticking.
  feePoolNextDrawAt = 0;
  // The pool must be able to afford at least the cheapest eligible reward before a
  // draw fires at all (finding: a single one-copper-fee trade used to mint raid-tier
  // gear on the next daily tick, regardless of pool size). Derived from the actual
  // item table, not an invented number, and cached once since content is static.
  private readonly feePoolMinDrawCopper = Market.computeMinDrawCopper();

  constructor(private readonly ctx: SimContext) {}

  private static computeMinDrawCopper(): number {
    let min = Infinity;
    for (const d of Object.values(ITEMS)) {
      if (isFeePoolRewardItem(d)) min = Math.min(min, d.sellValue);
    }
    return Number.isFinite(min) ? min : 0;
  }

  // Public ctor-seed entry: the Sim ctor calls this right after the NPC loop sets
  // `merchantId`, replacing the inline `this.seedHouseListings()`.
  seed(): void {
    this.seedHouseListings();
    this.feePoolNextDrawAt = this.ctx.time + MARKET_FEE_POOL_DRAW_INTERVAL;
  }

  // Public tick entry: the Sim tick calls this in the end-of-tick market phase,
  // replacing the inline `this.updateMarket()` (same phase, same call position).
  update(): void {
    this.updateMarket();
    this.updateFeePool();
  }

  private nearMerchant(e: Entity): boolean {
    for (const id of this.merchantIds) {
      const m = this.ctx.entities.get(id);
      if (m && m.kind === 'npc' && dist2d(e.pos, m.pos) <= MARKET_RANGE) return true;
    }
    return false;
  }

  private marketSellerKey(meta: PlayerMeta): string {
    return String(meta.characterId ?? meta.entityId);
  }

  marketListingBelongsTo(listing: MarketListing, meta: PlayerMeta): boolean {
    if (listing.house) return false;
    return listing.sellerKey === this.marketSellerKey(meta) || listing.sellerKey === meta.name;
  }

  private metaByMarketSellerKey(key: string): PlayerMeta | null {
    if (!key) return null;
    for (const m of this.ctx.players.values()) {
      if (this.marketSellerKey(m) === key || m.name === key) return m;
    }
    return null;
  }

  private addFeePoolParticipant(
    key: string,
    name: string,
    cls: PlayerMeta['cls'] | undefined,
  ): void {
    if (!key) return;
    this.feePoolParticipants.set(key, { key, name, cls });
  }

  private collectionFor(key: string): MarketCollection {
    let c = this.marketCollections.get(key);
    if (!c) {
      c = { copper: 0, items: [] };
      this.marketCollections.set(key, c);
    }
    return c;
  }

  private mergeMarketCollections(fromKey: string, toKey: string): boolean {
    if (!fromKey || fromKey === toKey) return false;
    const from = this.marketCollections.get(fromKey);
    if (!from) return false;
    const to = this.collectionFor(toKey);
    to.copper += from.copper;
    to.items.push(...from.items.map((s) => ({ ...s })));
    this.marketCollections.delete(fromKey);
    return true;
  }

  private collectionForSeller(meta: PlayerMeta): MarketCollection | undefined {
    const key = this.marketSellerKey(meta);
    this.mergeMarketCollections(meta.name, key);
    return this.marketCollections.get(key);
  }

  rekeyMarketSeller(characterId: number, oldName: string, newName: string): boolean {
    if (!Number.isFinite(characterId)) return false;
    const key = String(characterId);
    let changed = this.mergeMarketCollections(oldName, key);
    changed = this.mergeMarketCollections(newName, key) || changed;
    for (const listing of this.marketListings) {
      if (listing.house) continue;
      if (
        listing.sellerKey === key ||
        listing.sellerKey === oldName ||
        listing.sellerKey === newName
      ) {
        if (listing.sellerKey !== key || listing.sellerName !== newName) changed = true;
        listing.sellerKey = key;
        listing.sellerName = newName;
      }
    }
    return changed;
  }

  // The Merchant always keeps a little stock so the market is never empty —
  // standing consignments that never expire, never deplete, and pay no one.
  private seedHouseListings(): void {
    const stock: { itemId: string; count: number; price: number }[] = [
      { itemId: 'roasted_boar', count: 5, price: 700 },
      { itemId: 'spring_water', count: 5, price: 160 },
      { itemId: 'oiled_boots', count: 1, price: 1900 },
      { itemId: 'quilted_trousers', count: 1, price: 2400 },
      { itemId: 'greyjaw_pelt_cloak', count: 1, price: 2900 },
      // Quartermaster's Consignment — a standing line of practical travel gear.
      { itemId: 'roadwardens_helm', count: 1, price: 2200 },
      { itemId: 'wayfarers_hood', count: 1, price: 2000 },
      { itemId: 'acolytes_circlet', count: 1, price: 2000 },
      { itemId: 'reinforced_pauldrons', count: 1, price: 2400 },
      { itemId: 'embroidered_mantle', count: 1, price: 1900 },
      { itemId: 'sturdy_belt', count: 1, price: 1700 },
      { itemId: 'silk_sash', count: 1, price: 1700 },
      { itemId: 'roughspun_gloves', count: 1, price: 1500 },
      // Crossroads Outfitters — eight pieces kept in standing stock
      { itemId: 'tradesman_hatchet', count: 1, price: 2300 },
      { itemId: 'drovers_staff', count: 1, price: 2500 },
      { itemId: 'caravan_warden_dirk', count: 1, price: 2400 },
      { itemId: 'outrider_brigandine', count: 1, price: 2600 },
      { itemId: 'caravan_quilted_vest', count: 1, price: 1800 },
      { itemId: 'outrider_legguards', count: 1, price: 2100 },
      { itemId: 'pilgrims_leggings', count: 1, price: 1700 },
      { itemId: 'outrider_sabatons', count: 1, price: 1900 },
    ];
    for (const s of stock) {
      if (!ITEMS[s.itemId]) continue;
      this.marketListings.push({
        id: this.nextListingId++,
        sellerKey: '',
        sellerName: 'The Merchant',
        itemId: s.itemId,
        count: s.count,
        price: s.price,
        expiresAt: Infinity,
        house: true,
      });
    }
  }

  // List a stack from your bags for sale. The goods are escrowed (pulled from
  // your bags immediately) and held by the Merchant until bought or reclaimed.
  // Set the player's session-only World Market browse query (search + type/subtype/
  // rarity filters + page). Purely a display/query narrowing (no gameplay effect), so
  // it needs no proximity or liveness gate; the next marketInfoFor snapshot reflects it.
  marketSearch(query: MarketQuery, pid?: number): void {
    const r = this.ctx.resolve(pid);
    if (!r) return;
    r.meta.marketQuery = sanitizeMarketQuery(query);
  }

  marketList(itemId: string, count: number, price: number, pid?: number): void {
    const r = this.ctx.resolve(pid);
    if (!r) return;
    const { meta, e: p } = r;
    if (p.dead) return;
    if (!this.nearMerchant(p)) {
      this.ctx.error(meta.entityId, 'You must bring your goods to the Merchant.');
      return;
    }
    const def = ITEMS[itemId];
    if (!def) return;
    if (def.kind === 'quest') {
      this.ctx.error(meta.entityId, 'The Merchant will not broker quest items.');
      return;
    }
    if (def.noMarketList || def.soulbound) {
      this.ctx.error(meta.entityId, 'That item cannot be listed on the World Market.');
      return;
    }
    if (!Number.isFinite(count)) {
      this.ctx.error(meta.entityId, 'Name how many you wish to sell.');
      return;
    }
    const want = Math.max(1, Math.floor(count));
    // Per-instance copies (#1165: signer/charges/rolled/boundTo) are inert on the
    // World Market for now: count and escrow only the fungible stock, so a signed
    // or bound item is never swept into a listing. (#1146 wires real handling later.)
    if (this.ctx.countFungibleItem(itemId, meta.entityId) < want) {
      this.ctx.error(meta.entityId, 'You do not have that many to sell.');
      return;
    }
    const ask = Math.floor(price);
    if (!Number.isFinite(ask) || ask < MARKET_MIN_PRICE) {
      this.ctx.error(meta.entityId, 'Name a price of at least 1 copper.');
      return;
    }
    if (ask > MARKET_MAX_PRICE) {
      this.ctx.error(meta.entityId, 'That price is beyond what the Merchant will broker.');
      return;
    }
    const sellerKey = this.marketSellerKey(meta);
    const mine = this.marketListings.reduce(
      (n, l) => n + (this.marketListingBelongsTo(l, meta) ? 1 : 0),
      0,
    );
    if (mine >= MARKET_MAX_LISTINGS) {
      this.ctx.error(
        meta.entityId,
        `You may keep at most ${MARKET_MAX_LISTINGS} goods on the market at once.`,
      );
      return;
    }
    this.ctx.removeFungibleItem(itemId, want, meta.entityId); // escrow (fungible-only, #1165)
    this.marketListings.push({
      id: this.nextListingId++,
      sellerKey,
      sellerName: meta.name,
      itemId,
      count: want,
      price: ask,
      expiresAt: this.ctx.time + MARKET_LISTING_DURATION,
      house: false,
    });
    this.ctx.emit({
      type: 'loot',
      // biome-ignore lint/style/useTemplate: keep this scanner-friendly shape for i18n extraction.
      text: `Listed ${def.name}${want > 1 ? ' x' + want : ''} on the World Market for ${formatMoney(ask)}.`,
      pid: meta.entityId,
    });
  }

  // Buy a listing outright. Coin leaves the buyer, goods enter their bags, and
  // the seller's proceeds (less the Merchant's cut) wait in their collection.
  marketBuy(listingId: number, pid?: number): void {
    const r = this.ctx.resolve(pid);
    if (!r) return;
    const { meta, e: p } = r;
    if (p.dead) return;
    if (!this.nearMerchant(p)) {
      this.ctx.error(meta.entityId, 'You are too far from the Merchant.');
      return;
    }
    const idx = this.marketListings.findIndex((l) => l.id === listingId);
    if (idx < 0) {
      this.ctx.error(meta.entityId, 'That listing is no longer available.');
      return;
    }
    const listing = this.marketListings[idx];
    const def = ITEMS[listing.itemId];
    if (!def) {
      // The item id is no longer known (a content edit). Do not silently delete
      // the listing: that destroys the seller's escrowed goods with no refund.
      // Leave it intact so the owner can cancel/reclaim it; just refuse the buy.
      this.ctx.error(meta.entityId, 'That listing is no longer available.');
      return;
    }
    if (this.marketListingBelongsTo(listing, meta)) {
      this.ctx.error(meta.entityId, 'That is your own listing — cancel it to reclaim it.');
      return;
    }
    if (meta.copper < listing.price) {
      this.ctx.error(meta.entityId, 'You cannot afford that.');
      return;
    }
    if (!this.ctx.canAddItem(listing.itemId, listing.count, meta.entityId)) {
      this.ctx.error(meta.entityId, 'Your bags are full.');
      return;
    }
    meta.copper -= listing.price;
    this.ctx.addItem(listing.itemId, listing.count, meta.entityId);
    if (!listing.house) {
      const proceeds = Math.max(0, Math.floor(listing.price * (1 - MARKET_CUT)));
      const cut = listing.price - proceeds;
      this.collectionFor(listing.sellerKey).copper += proceeds;
      if (cut > 0) {
        this.feePoolCopper += cut;
        // The buyer is resolved right here (they're the one acting), so their class
        // is always known. The seller's listing already carries their display name
        // (sellerName), so that never degrades to a raw key even when the seller is
        // offline at sale time; their class is best-effort (only known if they're
        // still online right now).
        this.addFeePoolParticipant(
          listing.sellerKey,
          listing.sellerName,
          this.metaByMarketSellerKey(listing.sellerKey)?.cls,
        );
        this.addFeePoolParticipant(this.marketSellerKey(meta), meta.name, meta.cls);
      }
      this.marketListings.splice(idx, 1);
      const sellerMeta = this.metaByMarketSellerKey(listing.sellerKey);
      if (sellerMeta) {
        this.ctx.emit({
          type: 'loot',
          text: `${meta.name} bought your ${def.name} for ${formatMoney(listing.price)} - collect ${formatMoney(proceeds)} from the Merchant.`,
          pid: sellerMeta.entityId,
        });
      }
    }
    this.ctx.emit({
      type: 'loot',
      // biome-ignore lint/style/useTemplate: keep this scanner-friendly shape for i18n extraction.
      text: `Bought ${def.name}${listing.count > 1 ? ' x' + listing.count : ''} for ${formatMoney(listing.price)}.`,
      pid: meta.entityId,
    });
  }

  // Reclaim your own listing; the escrowed goods go straight back to your bags.
  marketCancel(listingId: number, pid?: number): void {
    const r = this.ctx.resolve(pid);
    if (!r) return;
    const { meta, e: p } = r;
    if (!this.nearMerchant(p)) {
      this.ctx.error(meta.entityId, 'You are too far from the Merchant.');
      return;
    }
    const idx = this.marketListings.findIndex((l) => l.id === listingId);
    if (idx < 0) return;
    const listing = this.marketListings[idx];
    if (!this.marketListingBelongsTo(listing, meta)) {
      this.ctx.error(meta.entityId, 'That is not your listing.');
      return;
    }
    if (!this.ctx.canAddItem(listing.itemId, listing.count, meta.entityId)) {
      this.ctx.error(meta.entityId, 'Your bags are full.');
      return;
    }
    this.marketListings.splice(idx, 1);
    this.ctx.addItem(listing.itemId, listing.count, meta.entityId);
    const def = ITEMS[listing.itemId];
    this.ctx.emit({
      type: 'loot',
      // biome-ignore lint/style/useTemplate: keep this scanner-friendly shape for i18n extraction.
      text: `Reclaimed ${def?.name ?? listing.itemId}${listing.count > 1 ? ' x' + listing.count : ''} from the market.`,
      pid: meta.entityId,
    });
  }

  // Take everything waiting for you at the Merchant: sale gold and any items
  // returned from expired listings.
  marketCollect(pid?: number): void {
    const r = this.ctx.resolve(pid);
    if (!r) return;
    const { meta, e: p } = r;
    if (!this.nearMerchant(p)) {
      this.ctx.error(meta.entityId, 'You are too far from the Merchant.');
      return;
    }
    const col = this.collectionForSeller(meta);
    if (!col || (col.copper <= 0 && col.items.length === 0)) {
      this.ctx.error(meta.entityId, 'You have nothing to collect.');
      return;
    }
    if (col.copper > 0) {
      meta.copper += col.copper;
      this.ctx.emit({
        type: 'loot',
        text: `You collect ${formatMoney(col.copper)} from the Merchant.`,
        pid: meta.entityId,
      });
      // Collection copper is exclusively sale proceeds, so all of it counts.
      this.ctx.bumpDeedStat(meta, 'marketSaleCopper', col.copper);
      col.copper = 0;
    }
    // Capacity gate: items that don't fit stay in the collection box (never
    // destroyed); the gold above is always collected.
    const kept: typeof col.items = [];
    for (const s of col.items) {
      if (this.ctx.canAddItem(s.itemId, s.count, meta.entityId)) {
        this.ctx.addItem(s.itemId, s.count, meta.entityId);
      } else {
        kept.push(s);
      }
    }
    if (kept.length > 0) {
      col.items = kept;
      this.ctx.error(meta.entityId, 'Your bags are full.');
      return;
    }
    this.marketCollections.delete(this.marketSellerKey(meta));
  }

  // Once a second: return expired player listings to their seller's collection.
  private updateMarket(): void {
    if (this.ctx.tickCount % 20 !== 0) return;
    for (let i = this.marketListings.length - 1; i >= 0; i--) {
      const l = this.marketListings[i];
      if (l.house || this.ctx.time < l.expiresAt) continue;
      this.marketListings.splice(i, 1);
      this.collectionFor(l.sellerKey).items.push({ itemId: l.itemId, count: l.count });
      const sellerMeta = this.metaByMarketSellerKey(l.sellerKey);
      if (sellerMeta) {
        const def = ITEMS[l.itemId];
        this.ctx.emit({
          type: 'log',
          text: `Your market listing of ${def?.name ?? l.itemId} expired and waits at the Merchant.`,
          color: '#caa472',
          pid: sellerMeta.entityId,
        });
      }
    }
  }

  // Roughly once a day: if the pool has matured past feePoolMinDrawCopper and at
  // least one participant traded since the last draw, pick a random participant and
  // hand them a reward the pool can actually afford (see pickFeePoolReward), funded
  // entirely by the pool. A pool that hasn't matured yet is left untouched to carry
  // into the next check (same "quiet week just carries the pool forward" idea as
  // before, just gated on value now instead of firing regardless of size); once a
  // draw actually pays out, the pool always drains and reschedules, win or not, so
  // fees can never pile up unbounded once they're large enough to matter.
  private updateFeePool(): void {
    if (this.ctx.tickCount % 20 !== 0) return;
    if (this.ctx.time < this.feePoolNextDrawAt) return;
    if (this.feePoolCopper < this.feePoolMinDrawCopper || this.feePoolParticipants.size === 0) {
      this.feePoolNextDrawAt = this.ctx.time + MARKET_FEE_POOL_DRAW_INTERVAL;
      return;
    }
    this.feePoolNextDrawAt = this.ctx.time + MARKET_FEE_POOL_DRAW_INTERVAL;
    const spent = this.feePoolCopper;
    const participants = [...this.feePoolParticipants.values()];
    this.feePoolCopper = 0;
    this.feePoolParticipants.clear();
    const winner = this.ctx.rng.pick(participants);
    const rewardId = this.pickFeePoolReward(winner.cls, spent);
    if (!rewardId) return;
    this.collectionFor(winner.key).items.push({ itemId: rewardId, count: 1 });
    const def = ITEMS[rewardId];
    for (const m of this.ctx.players.values()) {
      this.ctx.emit({
        type: 'log',
        text: `${winner.name} won ${def.name} from the World Market's fee giveaway, funded by ${formatMoney(spent)} in trading fees!`,
        color: '#ffd35c',
        pid: m.entityId,
      });
    }
  }

  // Reward pool: epic/legendary gear the pool can actually afford (sellValue <= the
  // banked fees), preferring pieces the winner can equip (no requiredClass, or one
  // that lists their class) so the giveaway is never wasted on an off-class drop;
  // falls back to any classless affordable piece if the winner's class has none
  // (still exciting, just not equippable by them specifically - tradeable on the
  // World Market like any other item). Among what's affordable, the roll is weighted
  // toward the pricier half so a well-fed pool tends to buy something worth the wait
  // instead of always defaulting to the cheapest eligible item.
  private pickFeePoolReward(cls: PlayerMeta['cls'] | undefined, poolCopper: number): string | null {
    const affordable = (pool: ItemDef[]): ItemDef[] =>
      pool.filter((d) => d.sellValue <= poolCopper);
    const weightedPick = (pool: ItemDef[]): ItemDef | null => {
      const items = affordable(pool);
      if (items.length === 0) return null;
      const maxValue = Math.max(...items.map((d) => d.sellValue));
      const topTier = items.filter((d) => d.sellValue >= maxValue / 2);
      return this.ctx.rng.pick(topTier.length > 0 ? topTier : items);
    };
    const forClass = Object.values(ITEMS).filter(
      (d) => isFeePoolRewardItem(d) && (!d.requiredClass || (cls && d.requiredClass.includes(cls))),
    );
    const classPick = weightedPick(forClass);
    if (classPick) return classPick.id;
    const classless = Object.values(ITEMS).filter(
      (d) => isFeePoolRewardItem(d) && !d.requiredClass,
    );
    const classlessPick = weightedPick(classless);
    return classlessPick ? classlessPick.id : null;
  }

  marketInfoFor(pid: number): import('../world_api').MarketInfo | null {
    const meta = this.ctx.players.get(pid);
    const e = this.ctx.entities.get(pid);
    if (!meta || !e) return null;
    // the World Market is a place you visit — only stream it while standing by
    // the Merchant, which also bounds the per-snapshot wire cost
    if (!this.nearMerchant(e)) return null;
    // Server-side browse: filter the WHOLE book by the player's query (search
    // substring + type/subtype/rarity), sort, then paginate. Doing this here (not on
    // the client over a single wire window) is what lets a player page through and
    // filter every listing, not just the first MARKET_WIRE_LIMIT.
    const query: MarketQuery = meta.marketQuery;
    const matched = this.marketListings.filter((l) => marketItemMatches(l.itemId, query));
    const sorted = [...matched].sort((a, b) => {
      const na = ITEMS[a.itemId]?.name ?? a.itemId;
      const nb = ITEMS[b.itemId]?.name ?? b.itemId;
      return na.localeCompare(nb) || a.price - b.price;
    });
    // The viewer's own listings are always wired (so they can reclaim from the Browse
    // tab without hunting for the right page); other sellers' listings are paged. Own
    // count (<= MARKET_MAX_LISTINGS = 12) plus one page (MARKET_PAGE_SIZE = 50) stays
    // well under MARKET_WIRE_LIMIT, which remains a hard safety bound on wire size.
    const isMine = (l: MarketListing) => this.marketListingBelongsTo(l, meta);
    const mineSorted = sorted.filter(isMine);
    const others = sorted.filter((l) => !isMine(l));
    const pageCount = Math.max(1, Math.ceil(others.length / MARKET_PAGE_SIZE));
    const page = Math.max(0, Math.min(pageCount - 1, query.page));
    const othersPage = others.slice(
      page * MARKET_PAGE_SIZE,
      page * MARKET_PAGE_SIZE + MARKET_PAGE_SIZE,
    );
    const wired = [...mineSorted, ...othersPage].slice(0, MARKET_WIRE_LIMIT);
    const listings = wired.map((l) => ({
      id: l.id,
      sellerName: isMine(l) ? meta.name : l.sellerName,
      itemId: l.itemId,
      count: l.count,
      price: l.price,
      mine: isMine(l),
      house: l.house,
    }));
    const col = this.collectionForSeller(meta);
    const myListingCount = this.marketListings.reduce(
      (n, l) => n + (this.marketListingBelongsTo(l, meta) ? 1 : 0),
      0,
    );
    return {
      listings,
      // Every listing matching the filter (the viewer's own plus all others), so the
      // SELL/notes read true counts; `pageCount` below paginates the others.
      totalCount: matched.length,
      filter: query.search,
      page,
      pageCount,
      collectionCopper: col?.copper ?? 0,
      collectionItems: col ? col.items.map((s) => ({ ...s })) : [],
      cutPct: Math.round(MARKET_CUT * 100),
      maxListings: MARKET_MAX_LISTINGS,
      myListingCount,
      feePoolCopper: this.feePoolCopper,
    };
  }

  // Persist only player listings + collections; house stock is reseeded each
  // boot so content edits take effect. secondsLeft survives the time reset.
  serializeMarket(): MarketSave {
    return {
      listings: this.marketListings
        .filter((l) => !l.house)
        .map((l) => ({
          id: l.id,
          sellerKey: l.sellerKey,
          sellerName: l.sellerName,
          itemId: l.itemId,
          count: l.count,
          price: l.price,
          secondsLeft: Number.isFinite(l.expiresAt)
            ? Math.max(0, Math.round(l.expiresAt - this.ctx.time))
            : MARKET_LISTING_DURATION,
        })),
      collections: [...this.marketCollections.entries()].map(([key, c]) => ({
        key,
        copper: c.copper,
        items: c.items.map((s) => ({ ...s })),
      })),
      nextListingId: this.nextListingId,
      feePoolCopper: this.feePoolCopper,
      feePoolDrawSecondsLeft: Math.max(0, Math.round(this.feePoolNextDrawAt - this.ctx.time)),
    };
  }

  loadMarket(save: MarketSave | null | undefined): void {
    if (!save) return;
    this.feePoolCopper = Math.max(0, Math.floor(save.feePoolCopper ?? 0) || 0);
    // Participants never persist (a session-only eligibility list): a fee earned
    // before a restart still counts toward the pool, but who gets to win it is
    // decided only by trades since the server has been back up.
    this.feePoolNextDrawAt =
      this.ctx.time +
      (Number.isFinite(save.feePoolDrawSecondsLeft)
        ? Math.max(0, save.feePoolDrawSecondsLeft as number)
        : MARKET_FEE_POOL_DRAW_INTERVAL);
    for (const l of save.listings ?? []) {
      // Keep a listing whose item id is no longer in ITEMS (a content rename,
      // retirement, or typo). Dropping it would silently destroy every escrowed
      // copy on the next restart and never refund the seller. An unknown id is
      // dormant, recoverable data (the owner can reclaim it into bags, exactly
      // as the character load path keeps unknown ids verbatim); a re-added or
      // corrected id rehydrates it. Display/buy paths already guard on ITEMS[id].
      if (!l || typeof l.itemId !== 'string') continue;
      if (!ITEMS[l.itemId])
        console.warn(`market: keeping listing with unknown item id ${l.itemId}`);
      this.marketListings.push({
        id: l.id,
        sellerKey: String(l.sellerKey ?? ''),
        sellerName: String(l.sellerName ?? l.sellerKey ?? '?'),
        itemId: l.itemId,
        count: Math.max(1, l.count | 0),
        price: Math.max(
          MARKET_MIN_PRICE,
          Math.min(MARKET_MAX_PRICE, Math.floor(l.price) || MARKET_MIN_PRICE),
        ),
        expiresAt:
          this.ctx.time +
          (Number.isFinite(l.secondsLeft) ? Math.max(0, l.secondsLeft) : MARKET_LISTING_DURATION),
        house: false,
      });
    }
    for (const c of save.collections ?? []) {
      if (!c || typeof c.key !== 'string') continue;
      this.marketCollections.set(c.key, {
        copper: Math.max(0, Math.floor(c.copper) || 0),
        // Keep returned/expired-listing items even when their id is unknown, for
        // the same reason as listings above: a content edit must not silently
        // empty a player's pending pickups. The id stays dormant until corrected.
        items: (c.items ?? [])
          .filter((s) => s && typeof s.itemId === 'string')
          .map((s) => ({ itemId: s.itemId, count: Math.max(1, s.count | 0) })),
      });
    }
    const maxId = this.marketListings.reduce((m, l) => Math.max(m, l.id + 1), 1);
    this.nextListingId = Math.max(this.nextListingId, save.nextListingId ?? 1, maxId);
    this.reclaimSoulboundListings();
  }

  // Migration for a listing whose item became SOULBOUND after it was listed (a
  // soulbound item can no longer sit on the World Market). Return each such
  // listing to its seller's collection so the owner reclaims it at the Merchant:
  // a soulbound item cannot be traded or mailed, but a Merchant pickup hands it
  // straight back to the player it is bound to, which is allowed. Mirrors the
  // expired-listing return (updateMarket). Runs once at load and is idempotent
  // (a returned listing is removed, so the next save has none; new listings of a
  // soulbound item are already blocked at list time).
  private reclaimSoulboundListings(): void {
    for (let i = this.marketListings.length - 1; i >= 0; i--) {
      const l = this.marketListings[i];
      if (l.house || !ITEMS[l.itemId]?.soulbound) continue;
      this.marketListings.splice(i, 1);
      this.collectionFor(l.sellerKey).items.push({ itemId: l.itemId, count: l.count });
    }
  }
}
