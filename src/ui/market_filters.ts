// Client re-exports of the host-agnostic market query module (src/sim/market_query.ts):
// the filter option lists drive the browse-tab dropdowns, and the shared predicate
// keeps any client-side filtering identical to the server's authoritative filter.
// The live browse path filters + paginates on the SERVER (so a player can page through
// the whole market); these helpers remain for the filter chrome and unit tests.

import {
  MARKET_PAGE_SIZE,
  type MarketItemTypeFilter,
  type MarketQuery,
  type MarketRarityFilter,
  type MarketSubtypeFilter,
  marketItemMatches,
} from '../sim/market_query';
import type { MarketListingView } from '../world_api';

export {
  defaultMarketQuery,
  MARKET_ARMOR_TYPE_FILTERS,
  MARKET_ITEM_TYPE_FILTERS,
  MARKET_PAGE_SIZE,
  MARKET_RARITY_FILTERS,
  MARKET_WEAPON_TYPE_FILTERS,
  type MarketArmorTypeFilter,
  type MarketItemTypeFilter,
  type MarketQuery,
  type MarketRarityFilter,
  type MarketSubtypeFilter,
  type MarketWeaponTypeFilter,
  sanitizeMarketQuery,
} from '../sim/market_query';

/** The three browse-tab dropdown filters (no search / page; that lives in MarketQuery). */
export interface MarketFilters {
  itemType: MarketItemTypeFilter;
  subtype?: MarketSubtypeFilter;
  rarity: MarketRarityFilter;
}

/** Filter listings by the type/subtype/rarity chrome, reusing the shared predicate. */
export function filterMarketListings(
  listings: readonly MarketListingView[],
  filters: MarketFilters,
): MarketListingView[] {
  const query: MarketQuery = {
    search: '',
    itemType: filters.itemType,
    subtype: filters.subtype ?? 'all',
    rarity: filters.rarity,
    page: 0,
  };
  return listings.filter((listing) => marketItemMatches(listing.itemId, query));
}

export interface MarketListingPage<T extends MarketListingView = MarketListingView> {
  items: T[];
  page: number;
  pageCount: number;
  total: number;
  start: number;
  end: number;
}

export function paginateMarketListings<T extends MarketListingView>(
  listings: readonly T[],
  requestedPage: number,
  pageSize = MARKET_PAGE_SIZE,
): MarketListingPage<T> {
  const total = listings.length;
  const safePageSize = Number.isFinite(pageSize)
    ? Math.max(1, Math.floor(pageSize))
    : MARKET_PAGE_SIZE;
  const pageCount = Math.max(1, Math.ceil(total / safePageSize));
  const requested = Number.isFinite(requestedPage) ? Math.floor(requestedPage) : 0;
  const page = Math.max(0, Math.min(pageCount - 1, requested));
  const start = page * safePageSize;
  const end = Math.min(total, start + safePageSize);
  return { items: listings.slice(start, end), page, pageCount, total, start, end };
}
