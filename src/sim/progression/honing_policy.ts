// Honing (virtual levels as an enchanting resource): the pure tuning leaf.
//
// Past the level cap a character keeps earning virtual levels off lifetime XP
// (types.ts virtualLevel), but those levels never meant anything. Honing gives
// them a use: a worn piece of gear can be honed, one rank at a time, and each
// rank adds +1 to ONE primary stat the player chooses. Every attempt burns
// virtual levels (progressively more per rank, the Rift essence-ladder idea)
// plus a gold fee (the economy sink), and rolls against a success chance that
// falls with every rank already on the piece (the "progressively lower"
// option the request offered; the "reset on fail" option is the
// HONING_FAIL_RESETS knob below, off by default so the default stays the
// grindy, not the gambly, shape).
//
// This file holds NUMBERS and PURE FUNCTIONS only: no SimContext, no state.
// progression/honing.ts owns the attempt itself. Pinned by
// tests/honing_policy.test.ts.
import { MAX_LEVEL, virtualLevel } from '../types';

/** The primary stats a honing rank may raise (CoreStats minus armor, which is
 *  an item-kind property, never a chosen bonus). */
export const HONING_STATS = ['str', 'agi', 'sta', 'int', 'spi'] as const;
export type HoningStat = (typeof HONING_STATS)[number];

export function isHoningStat(value: unknown): value is HoningStat {
  return typeof value === 'string' && (HONING_STATS as readonly string[]).includes(value);
}

/** Highest honing rank a copy can carry: ten ranks is +10 to one stat on a
 *  level-20 item budget, a visible but bounded post-cap power ceiling. */
export const HONING_MAX_RANK = 10;

/** Gold fee for the FIRST rank, in copper (50 silver); the fee then grows
 *  quadratically with the rank being attempted (see honingCost). */
export const HONING_COPPER_BASE = 5_000;

/** Success chance for the first rank, the step it loses per rank already on
 *  the piece, and the floor it never falls under. Rank 1 always lands (the
 *  first honing is a sure thing, so the sink has an on-ramp); the tenth
 *  attempt sits at 28%, so the floor is headroom for a steeper retune, not a
 *  value the shipped ladder reaches. */
export const HONING_BASE_CHANCE = 1;
export const HONING_CHANCE_STEP = 0.08;
export const HONING_MIN_CHANCE = 0.2;

/** Option 1 of the request ("failing enchant drops the item back to 0"):
 *  when true a failed roll clears every rank and its stats; when false (the
 *  default, option 2) a failed roll only spends the levels and the fee and
 *  the piece keeps what it had. Data, so a maintainer flips one literal. */
export const HONING_FAIL_RESETS = false;

/** Glow tier for the worn-gear VFX (src/render/honing_glow_core.ts): 0 is no
 *  glow; a piece starts to shine at rank 4, brightens at 7, and blazes at the
 *  cap. Cosmetic identity only, never power. */
export const HONING_GLOW_RANKS = [4, 7, 10] as const;

export interface HoningCost {
  /** Virtual levels burned by the attempt. */
  levels: number;
  /** Gold fee in copper. */
  copper: number;
}

/** Cost of attempting the NEXT rank on a piece currently at `rank`
 *  (0 = never honed): rank + 1 virtual levels (1, 2, 3, ... 10; 55 for a
 *  full walk) and a quadratic fee (50s, 2g, 4.5g, ... 50g; 192.5g total). */
export function honingCost(rank: number): HoningCost {
  const next = Math.max(0, Math.floor(rank)) + 1;
  return { levels: next, copper: HONING_COPPER_BASE * next * next };
}

/** Success chance for attempting the next rank on a piece at `rank`. */
export function honingChance(rank: number): number {
  const r = Math.max(0, Math.floor(rank));
  return Math.max(HONING_MIN_CHANCE, HONING_BASE_CHANCE - HONING_CHANCE_STEP * r);
}

/** The glow tier (0 to HONING_GLOW_RANKS.length) a copy at `rank` shows. */
export function honingGlowTier(rank: number): number {
  let tier = 0;
  for (const threshold of HONING_GLOW_RANKS) if (rank >= threshold) tier++;
  return tier;
}

/** Virtual levels earned past the cap and not yet spent on honing: the
 *  spendable pool. `spent` is the persisted PlayerMeta.virtualLevelsSpent
 *  ledger; the displayed virtual level itself never falls (bragging rights
 *  and the leaderboard stay pure functions of lifetime XP). */
export function unspentVirtualLevels(lifetimeXp: number, spent: number): number {
  const earned = virtualLevel(lifetimeXp) - MAX_LEVEL;
  return Math.max(0, earned - Math.max(0, Math.floor(spent)));
}
