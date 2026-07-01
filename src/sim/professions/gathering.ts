// Corpse harvest: a single-use, first-come shared resource, the deliberate opposite
// of a world gathering node (which is per-player: every player who reaches a node can
// harvest their own instance of it). A slain mob's corpse can be salvaged for
// profession components (hide, fang, silk, ...) exactly ONCE: the first player to
// harvest it claims the yield, and every later attempt (same tick or any later tick)
// against that same corpse is denied.
//
// Pure leaf: no Sim/Entity import, no clock, mirroring the loot/loot_ffa.ts
// pattern (reference: format_money.ts, threat.ts, loot/loot_ffa.ts). The single-use
// claim below draws no rng; the #1142 focus-harvest tier roll further down takes an
// explicit `Rng` argument, same pattern as loot/loot_roll.ts. The owning
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
//
// #1142 adds a per-corpse FOCUS PICKER on top of the single-use claim above:
// which of the corpse's tagged component(s) the claiming player extracts, and
// the concentrate-vs-spread tier tradeoff for that choice (see
// resolveCorpseFocusHarvest below). Draws rng, unlike the rest of this file.

import type { Rng } from '../rng';

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

// Per-corpse focus picker (#1142): concentrate vs spread tradeoff.
//
// At a harvestable corpse the player chooses which tagged component(s) to
// extract. Choosing FEWER components concentrates the effort and yields a
// measurably higher tier per component than spreading across every tagged
// type on the same corpse.

/** Component yield tiers, worst to best. Independent of `ItemDef['quality']`
 * (a harvest yield is a raw material, not necessarily an equippable item),
 * but reuses the same classic six-tier naming so it reads consistently. */
export type HarvestTier = 'poor' | 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';

// Exported so professions/focus.ts (#1143) can shift a rolled tier upward by a
// persistent town-focus bonus without redefining the tier order.
export const HARVEST_TIERS: readonly HarvestTier[] = [
  'poor',
  'common',
  'uncommon',
  'rare',
  'epic',
  'legendary',
];

// Base per-tier roll weights (poor..legendary), used unshifted when the player
// spreads across every tagged component on the corpse (zero concentration).
// Tune here, not inline in the roll.
const BASE_TIER_WEIGHTS: readonly number[] = [40, 30, 15, 10, 4, 1];

export interface FocusHarvestYield {
  readonly component: string;
  readonly tier: HarvestTier;
}

/**
 * Resolve a per-corpse focus harvest: one independent tier roll per chosen
 * component, each roll's weight table shifted upward by a concentration bonus.
 *
 * Formula (monotonic, documented, no invented balance numbers beyond the base
 * weight table above): `bonus = taggedComponents.length - effectiveChosen.length`,
 * clamped to `[0, HARVEST_TIERS.length - 1]`. Each component's tier index is
 * `min(rolledIndex + bonus, HARVEST_TIERS.length - 1)`. Choosing every tagged
 * component gives `bonus = 0` (an unshifted roll, the pre-#1142 "spread"
 * behavior); choosing strictly fewer components out of the same tagged set
 * can only raise the shift, never lower it, so concentrating on fewer
 * components always yields an equal-or-higher expected tier per component
 * than spreading wider on the same corpse.
 *
 * Backward compatibility: an empty `chosen` (no selection made) or a `chosen`
 * that covers every tagged component both default to spreading across all of
 * `taggedComponents`, matching the single-harvest behavior from #1141.
 *
 * Pure: draws only from the passed-in `Rng`, one draw per yielded component,
 * in `effectiveChosen` order.
 */
export function resolveCorpseFocusHarvest(
  taggedComponents: readonly string[],
  chosen: readonly string[],
  rng: Rng,
): FocusHarvestYield[] {
  const effectiveChosen =
    chosen.length === 0 || chosen.length >= taggedComponents.length
      ? taggedComponents
      : chosen.filter((c) => taggedComponents.includes(c));
  const bonus = Math.max(
    0,
    Math.min(HARVEST_TIERS.length - 1, taggedComponents.length - effectiveChosen.length),
  );
  return effectiveChosen.map((component) => ({ component, tier: rollFocusTier(rng, bonus) }));
}

/** How many of the mapped item a yielded tier grants: 1 (poor) through 6 (legendary). */
export function harvestTierQuantity(tier: HarvestTier): number {
  return HARVEST_TIERS.indexOf(tier) + 1;
}

function rollFocusTier(rng: Rng, bonus: number): HarvestTier {
  const totalWeight = BASE_TIER_WEIGHTS.reduce((sum, w) => sum + w, 0);
  let roll = rng.next() * totalWeight;
  let index = 0;
  for (; index < BASE_TIER_WEIGHTS.length - 1; index++) {
    roll -= BASE_TIER_WEIGHTS[index];
    if (roll < 0) break;
  }
  const shifted = Math.min(HARVEST_TIERS.length - 1, index + bonus);
  return HARVEST_TIERS[shifted];
}
