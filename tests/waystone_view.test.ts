// The waystone window's pure view core (src/ui/hud/waystone/waystone_view.ts):
// the attuned/origin filters, the fee quoted from the shared leaf, the ticket
// and guild-discount readouts, affordability, and the distance-then-town sort.

import { describe, expect, it } from 'vitest';
import { WAYSTONES, waystoneById } from '../src/sim/content/waystones';
import { waystoneDistance, waystoneFee } from '../src/sim/waystone_fee';
import { buildWaystoneView } from '../src/ui/hud/waystone/waystone_view';

const origin = waystoneById('eastbrook')!;
const fenbridge = waystoneById('fenbridge')!;
const highwatch = waystoneById('highwatch')!;

describe('buildWaystoneView', () => {
  it('lists only ATTUNED stones other than the origin, priced from the fee leaf', () => {
    const view = buildWaystoneView(
      'eastbrook',
      new Set(['eastbrook', 'fenbridge', 'highwatch']),
      1_000_000,
      0,
      0,
    );
    expect(view.rows.map((r) => r.stoneId)).toEqual(['fenbridge', 'highwatch']);
    expect(view.rows[0]).toMatchObject({
      town: 'Fenbridge',
      distanceYd: waystoneDistance(origin, fenbridge),
      feeCopper: waystoneFee(origin, fenbridge, 0),
      ticket: false,
      affordable: true,
    });
    expect(view.rows[1].feeCopper).toBe(waystoneFee(origin, highwatch, 0));
    expect(view.discountPct).toBe(0);
    expect(view.tickets).toBe(0);
  });

  it('omits unknown ids and returns no rows when only the origin is attuned', () => {
    expect(buildWaystoneView('eastbrook', new Set(['eastbrook', 'nowhere']), 0, 0, 0).rows).toEqual(
      [],
    );
    expect(buildWaystoneView('nowhere', new Set(['eastbrook']), 0, 0, 0).rows).toEqual([]);
  });

  it('flags affordability against the purse, exact fee included', () => {
    const fee = waystoneFee(origin, fenbridge, 0);
    const attuned = new Set(['eastbrook', 'fenbridge']);
    expect(buildWaystoneView('eastbrook', attuned, fee, 0, 0).rows[0].affordable).toBe(true);
    expect(buildWaystoneView('eastbrook', attuned, fee - 1, 0, 0).rows[0].affordable).toBe(false);
  });

  it('a ticket makes every row affordable and marks it as ticket-paid', () => {
    const attuned = new Set(['eastbrook', 'fenbridge']);
    const view = buildWaystoneView('eastbrook', attuned, 0, 2, 0);
    expect(view.tickets).toBe(2);
    expect(view.rows[0]).toMatchObject({ ticket: true, affordable: true });
    // The gold fee is still quoted so the row can show what a ticket saves.
    expect(view.rows[0].feeCopper).toBe(waystoneFee(origin, fenbridge, 0));
  });

  it('quotes the guild discount and the discounted fee', () => {
    const attuned = new Set(['eastbrook', 'fenbridge']);
    const view = buildWaystoneView('eastbrook', attuned, 0, 0, 3);
    expect(view.discountPct).toBeGreaterThan(0);
    expect(view.rows[0].feeCopper).toBe(waystoneFee(origin, fenbridge, 3));
    expect(view.rows[0].feeCopper).toBeLessThan(waystoneFee(origin, fenbridge, 0));
  });

  it('sorts by distance, then by town name', () => {
    const all = new Set(WAYSTONES.map((s) => s.id));
    const view = buildWaystoneView('eastbrook', all, 0, 0, 0);
    expect(view.rows).toHaveLength(WAYSTONES.length - 1);
    for (let i = 1; i < view.rows.length; i++) {
      const a = view.rows[i - 1];
      const b = view.rows[i];
      expect(
        a.distanceYd < b.distanceYd || (a.distanceYd === b.distanceYd && a.town <= b.town),
      ).toBe(true);
    }
  });
});
