// Pure residency-key policy for delve module interiors. DELVE_SLOT_COUNT is a
// fixed, server-wide pool: a slot a finished run vacates is claimed by the
// NEXT party's run, which re-shuffles its own module order (pickDelveModules).
// The same (delveId, slot) origin therefore does not always hold the same
// module chain, so a build tracked only by (delveId, slot, moduleId) can read
// as "already built" for a NEW run whose module order actually differs,
// leaving the previous occupant's rooms parked at that origin forever. This
// mirrors the rift interior reuse the renderer already retires on every
// build (see riftInteriorGroups); delve module slots need the same guard.

/** Tracking key for one built module interior, matching every existing
 * (renderer.ts) `delve:${delveId}:${slot}:${moduleId}` site. */
export function delveModuleInteriorKey(delveId: string, slot: number, moduleId: string): string {
  return `delve:${delveId}:${slot}:${moduleId}`;
}

/** True when `key` belongs to the given delve slot (any moduleId). */
export function isDelveSlotInteriorKey(key: string, delveId: string, slot: number): boolean {
  return key.startsWith(`delve:${delveId}:${slot}:`);
}

/** Stable signature for a run's module ORDER: two runs with the same modules
 * in the same order (a rejoin of the run already in progress) compare equal;
 * a re-shuffled claim (a genuinely new run in a recycled slot) does not. */
export function delveModuleOrderKey(modules: readonly string[]): string {
  return modules.join(',');
}

/** Should a slot's previously-built interiors be retired before rebuilding?
 * Only when the module order actually changed (or this is the slot's first
 * build): a party member simply REJOINING a run in progress fires the same
 * 'delveEntered' event with an UNCHANGED order, and must leave the correct,
 * already-built geometry alone rather than pop it out from under the group
 * already inside. */
export function shouldRetireDelveSlot(
  previousOrderKey: string | undefined,
  currentOrderKey: string,
): boolean {
  return previousOrderKey !== currentOrderKey;
}
