// Waystone window view core: the destination rows a keeper offers, derived
// from the content stones (src/sim/content/waystones.ts), the character's
// attuned set, their purse, their ticket count and their guild tier. Pure and
// DOM-free; the waystone_window_controller paints it.
//
// A row's `town` is content text (WaystoneDef.town, English map-label source)
// and is rendered through esc() by the painter, the same way zone POI labels
// splice into player text. Rows come sorted by distance, then town, so the
// nearest stones lead the list in every locale. The fee is quoted from the
// SAME leaf the sim charges (src/sim/waystone_fee.ts), so the window can never
// promise a price the hop refuses.

import { WAYSTONES } from '../../../sim/content/waystones';
import { waystoneDistance, waystoneFee, waystoneGuildDiscountPct } from '../../../sim/waystone_fee';

export interface WaystoneViewRow {
  stoneId: string;
  town: string;
  /** Straight-line yards from the origin stone. */
  distanceYd: number;
  /** The gold fee after the guild discount (what the hop charges without a ticket). */
  feeCopper: number;
  /** True when a ticket will pay this hop instead of gold. */
  ticket: boolean;
  /** True when the hop can be paid right now (a ticket, or the purse covers the fee). */
  affordable: boolean;
}

export interface WaystoneView {
  rows: WaystoneViewRow[];
  tickets: number;
  /** The guild discount in play, in percent (0 for no guild or a tier-0 guild). */
  discountPct: number;
}

/** Every ATTUNED stone other than the origin, priced from the origin. */
export function buildWaystoneView(
  originStoneId: string,
  attuned: ReadonlySet<string>,
  copper: number,
  tickets: number,
  guildTier: number,
): WaystoneView {
  const origin = WAYSTONES.find((stone) => stone.id === originStoneId);
  const rows: WaystoneViewRow[] = [];
  if (origin) {
    for (const stone of WAYSTONES) {
      if (stone.id === origin.id || !attuned.has(stone.id)) continue;
      const feeCopper = waystoneFee(origin, stone, guildTier);
      const ticket = tickets > 0;
      rows.push({
        stoneId: stone.id,
        town: stone.town,
        distanceYd: waystoneDistance(origin, stone),
        feeCopper,
        ticket,
        affordable: ticket || copper >= feeCopper,
      });
    }
    rows.sort((a, b) => a.distanceYd - b.distanceYd || a.town.localeCompare(b.town));
  }
  return { rows, tickets, discountPct: waystoneGuildDiscountPct(guildTier) };
}
