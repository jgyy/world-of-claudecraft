// The flight window's pure view core (src/ui/hud/flight/flight_view.ts): BFS hop
// counts over FLIGHT_LINKS, the known/unknown and origin filters, the per-hop
// fare and its affordability flag, and the hops-then-town sort.

import { describe, expect, it } from 'vitest';
import { FLIGHT_FARE_COPPER, FLIGHT_NODES } from '../src/sim/content/flight_paths';
import { buildFlightView, flightHops } from '../src/ui/hud/flight/flight_view';

describe('flightHops', () => {
  it('counts one hop per link on the shortest route', () => {
    expect(flightHops('eastbrook', 'fenbridge')).toBe(1);
    expect(flightHops('eastbrook', 'highwatch')).toBe(2);
    // eastbrook -> fenbridge -> highwatch -> eldergleam (3), never the longer
    // detour through wickharbor / hedgewick / gallowmere.
    expect(flightHops('eastbrook', 'eldergleam')).toBe(3);
  });

  it('is symmetric over the undirected links', () => {
    for (const a of FLIGHT_NODES) {
      for (const b of FLIGHT_NODES) {
        expect(flightHops(a.id, b.id), `${a.id} <-> ${b.id}`).toBe(flightHops(b.id, a.id));
      }
    }
  });

  it('returns zero for a node and itself and null when no route exists', () => {
    expect(flightHops('eastbrook', 'eastbrook')).toBe(0);
    expect(flightHops('eastbrook', 'no_such_node')).toBeNull();
    expect(flightHops('no_such_node', 'eastbrook')).toBeNull();
  });

  it('joins every content node to every other (the hub graph is connected)', () => {
    for (const node of FLIGHT_NODES) {
      expect(flightHops('eastbrook', node.id), node.id).not.toBeNull();
    }
  });
});

describe('buildFlightView', () => {
  it('lists only KNOWN nodes other than the origin, priced per hop', () => {
    const rows = buildFlightView(
      'eastbrook',
      new Set(['eastbrook', 'fenbridge', 'highwatch']),
      FLIGHT_FARE_COPPER * 10,
    );
    expect(rows.map((r) => r.nodeId)).toEqual(['fenbridge', 'highwatch']);
    expect(rows[0]).toEqual({
      nodeId: 'fenbridge',
      town: 'Fenbridge',
      hops: 1,
      fareCopper: FLIGHT_FARE_COPPER,
      affordable: true,
    });
    expect(rows[1].hops).toBe(2);
    expect(rows[1].fareCopper).toBe(2 * FLIGHT_FARE_COPPER);
  });

  it('omits unknown node ids and nodes no route reaches', () => {
    const rows = buildFlightView('eastbrook', new Set(['fenbridge', 'ghost_town']), 0);
    expect(rows.map((r) => r.nodeId)).toEqual(['fenbridge']);
  });

  it('returns no rows when only the origin is known', () => {
    expect(buildFlightView('eastbrook', new Set(['eastbrook']), 1_000_000)).toEqual([]);
    expect(buildFlightView('eastbrook', new Set(), 1_000_000)).toEqual([]);
  });

  it('flags affordability against the purse, exact fare included', () => {
    const known = new Set(['fenbridge', 'highwatch']);
    const rows = buildFlightView('eastbrook', known, FLIGHT_FARE_COPPER);
    expect(rows.find((r) => r.nodeId === 'fenbridge')?.affordable).toBe(true);
    expect(rows.find((r) => r.nodeId === 'highwatch')?.affordable).toBe(false);
    expect(buildFlightView('eastbrook', known, FLIGHT_FARE_COPPER - 1)[0].affordable).toBe(false);
  });

  it('sorts by hops, then by town name', () => {
    const rows = buildFlightView('highwatch', new Set(FLIGHT_NODES.map((n) => n.id)), 0);
    expect(rows).toHaveLength(FLIGHT_NODES.length - 1);
    for (let i = 1; i < rows.length; i++) {
      const prev = rows[i - 1];
      const cur = rows[i];
      const ordered = prev.hops < cur.hops || (prev.hops === cur.hops && prev.town <= cur.town);
      expect(ordered, `${prev.town}(${prev.hops}) before ${cur.town}(${cur.hops})`).toBe(true);
    }
    // The three one-hop neighbors of Highwatch lead the list, alphabetically.
    expect(rows.slice(0, 3).map((r) => r.town)).toEqual(['Drifthaven', 'Eldergleam', 'Fenbridge']);
  });
});
