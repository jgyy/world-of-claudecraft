// Corpse harvest: a single-use, first-come shared resource, the deliberate opposite
// of a world gathering node (which is per-player: every player who reaches a node can
// harvest their own instance of it). A slain mob's corpse can be salvaged for
// profession components (hide, fang, silk, ...) exactly ONCE: the first player to
// harvest it claims the yield, and every later attempt (same tick or any later tick)
// against that same corpse is denied.
//
// Pure leaf: no Sim/Entity import, no rng, no clock, mirroring the loot/loot_ffa.ts
// pattern (reference: format_money.ts, threat.ts, loot/loot_ffa.ts). The owning
// caller (src/sim/interaction.ts) holds the corpse's `harvestClaimedBy` state on the
// Entity and passes it in; resolveCorpseHarvest performs the whole check-and-set in
// one synchronous call, so there is nothing left to race.
//
// Race-freedom argument: the sim tick is single-threaded at 20 Hz (see
// src/sim/CLAUDE.md, "sim.ts coordinator map"). Every player command in a tick's
// batch is processed one at a time, in order, by the SAME synchronous call stack;
// there is no `await` or callback boundary between reading `harvestClaimedBy` and
// writing it back. So two harvest attempts landing in the SAME tick are still
// resolved sequentially, never concurrently: whichever command is processed first
// (deterministic command-batch order) sees `currentClaimedBy === null` and wins;
// the second sees the just-written claim and is denied. No lock is needed because
// there is no interleaving to guard against.

// Component tag -> the existing item this harvest yields. Only tags with a concrete
// profession-material item wired up so far are listed here; a mob whose
// `componentTags` don't map to any of these still becomes single-use claimed, it
// just yields no item yet (future profession-harvest issues wire up the rest).
export const HARVEST_COMPONENT_ITEMS: Readonly<Record<string, string>> = {
  hide: 'boar_hide',
  fang: 'wolf_fang',
  silk: 'webwood_silk',
  venomSac: 'widow_venom_sac',
};

export interface HarvestClaim {
  readonly success: boolean;
  readonly claimedBy: number | null;
}

/** Does this mob's corpse support profession harvest at all? */
export function isHarvestableCorpse(componentTags: readonly string[] | undefined): boolean {
  return !!componentTags && componentTags.length > 0;
}

/**
 * Atomic check-and-set harvest claim: exactly one caller, for a given corpse, ever
 * gets `success: true`. Deterministic and order-independent for a fixed
 * `currentClaimedBy` (null means unclaimed) and requesting `pid`.
 */
export function resolveCorpseHarvest(currentClaimedBy: number | null, pid: number): HarvestClaim {
  if (currentClaimedBy !== null) return { success: false, claimedBy: currentClaimedBy };
  return { success: true, claimedBy: pid };
}

/** The item id this harvest yields, or null if no component tag maps to one yet. */
export function harvestItemFor(componentTags: readonly string[] | undefined): string | null {
  if (!componentTags) return null;
  for (const tag of componentTags) {
    const itemId = HARVEST_COMPONENT_ITEMS[tag];
    if (itemId) return itemId;
  }
  return null;
}
