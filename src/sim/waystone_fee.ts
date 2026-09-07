// Waystone fee math: pure and host-agnostic, so the sim charges and the HUD
// quotes the SAME figure (src/ui/hud/waystone reads this directly).
//
// A hop is priced by straight-line distance between the two stones, per
// started 100 yards, with a floor, then discounted by the character's guild
// tier. Rounding happens once, at the end, so the discount never drifts from
// what the window quoted.

import {
  WAYSTONE_FEE_MIN_COPPER,
  WAYSTONE_FEE_PER_100YD_COPPER,
  WAYSTONE_GUILD_DISCOUNT_PCT,
  type WaystoneDef,
} from './content/waystones';

/** Straight-line yards between two stones. */
export function waystoneDistance(from: WaystoneDef, to: WaystoneDef): number {
  return Math.hypot(to.x - from.x, to.z - from.z);
}

/** Percent off for a guild tier; out-of-range tiers clamp to the ladder ends. */
export function waystoneGuildDiscountPct(guildTier: number): number {
  const index = Math.max(
    0,
    Math.min(WAYSTONE_GUILD_DISCOUNT_PCT.length - 1, Math.floor(guildTier)),
  );
  return WAYSTONE_GUILD_DISCOUNT_PCT[index];
}

/** The undiscounted fee for `distanceYd` yards, in copper. */
export function waystoneBaseFee(distanceYd: number): number {
  const segments = Math.max(1, Math.ceil(distanceYd / 100));
  return Math.max(WAYSTONE_FEE_MIN_COPPER, segments * WAYSTONE_FEE_PER_100YD_COPPER);
}

/** The fee actually charged for a hop, after the guild discount, in copper. */
export function waystoneFee(from: WaystoneDef, to: WaystoneDef, guildTier: number): number {
  const base = waystoneBaseFee(waystoneDistance(from, to));
  return Math.round((base * (100 - waystoneGuildDiscountPct(guildTier))) / 100);
}
