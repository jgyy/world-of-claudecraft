// Flight window view core: the destination rows a flightmaster offers, derived
// from the content graph (src/sim/content/flight_paths.ts) and the character's
// known nodes. Pure and DOM-free; the flight_window_controller paints it.
//
// A row's `town` is content text (FlightNodeDef.town, English map-label source)
// and is rendered through esc() by the painter, the same way zone POI labels
// splice into player text. Rows come sorted by hops, then town, so the nearest
// destinations lead the list in every locale.

import { FLIGHT_FARE_COPPER, FLIGHT_LINKS, FLIGHT_NODES } from '../../../sim/content/flight_paths';

export interface FlightViewRow {
  nodeId: string;
  town: string;
  /** Town-to-town links flown on the BFS-shortest route from the origin. */
  hops: number;
  fareCopper: number;
  affordable: boolean;
}

let adjacency: Map<string, string[]> | null = null;

function links(): Map<string, string[]> {
  if (adjacency) return adjacency;
  adjacency = new Map();
  for (const [a, b] of FLIGHT_LINKS) {
    if (!adjacency.has(a)) adjacency.set(a, []);
    if (!adjacency.has(b)) adjacency.set(b, []);
    adjacency.get(a)?.push(b);
    adjacency.get(b)?.push(a);
  }
  return adjacency;
}

/** Fewest links between two nodes over FLIGHT_LINKS (BFS), or null when no
 *  route joins them. Zero for a node and itself. */
export function flightHops(from: string, to: string): number | null {
  if (from === to) return 0;
  const graph = links();
  const seen = new Set<string>([from]);
  let frontier = [from];
  let depth = 0;
  while (frontier.length) {
    depth += 1;
    const next: string[] = [];
    for (const node of frontier) {
      for (const neighbor of graph.get(node) ?? []) {
        if (seen.has(neighbor)) continue;
        if (neighbor === to) return depth;
        seen.add(neighbor);
        next.push(neighbor);
      }
    }
    frontier = next;
  }
  return null;
}

/** Every KNOWN node other than the origin that a route reaches, priced per hop. */
export function buildFlightView(
  originNodeId: string,
  known: ReadonlySet<string>,
  copper: number,
): FlightViewRow[] {
  const rows: FlightViewRow[] = [];
  for (const node of FLIGHT_NODES) {
    if (node.id === originNodeId || !known.has(node.id)) continue;
    const hops = flightHops(originNodeId, node.id);
    if (hops === null || hops === 0) continue;
    const fareCopper = hops * FLIGHT_FARE_COPPER;
    rows.push({
      nodeId: node.id,
      town: node.town,
      hops,
      fareCopper,
      affordable: copper >= fareCopper,
    });
  }
  rows.sort((a, b) => a.hops - b.hops || a.town.localeCompare(b.town));
  return rows;
}
