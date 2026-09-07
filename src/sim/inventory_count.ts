// Bag counting, the pure half of the coordinator's inventory hub (root
// Modularity ratchet): the plain count and the fungible-only count over a
// slot list. `fungibleOnly` excludes per-instance slots (#1165): the World
// Market lists/escrows against that reading, never the instanced count, so
// an instanced copy is never sold as if it were a plain stack member.

import type { InvSlot } from './types';

export function countItemIn(
  inventory: readonly InvSlot[],
  itemId: string,
  fungibleOnly = false,
): number {
  let n = 0;
  for (const s of inventory) {
    if (s.itemId !== itemId) continue;
    if (fungibleOnly && s.instance) continue;
    n += s.count;
  }
  return n;
}
