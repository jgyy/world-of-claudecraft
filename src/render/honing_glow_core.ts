// The honed-gear world-space identity (src/sim/progression/honing.ts): the
// glow tier a worn set earns, its palette, and how strongly to emit it at a
// viewer distance. Rank thresholds live in the sim's HONING_GLOW_RANKS.
//
// THE PREDICATE READS ONLY THE PEER-WIRE `honing` FIELD (it joins the eqi
// allowlist), so self, peer, offline, and online compute the same tier. The
// emit decision reuses the regalia shed verbatim (legendaryRegaliaEmitDt:
// fixed anchor, floored, reduced-motion suppressed) and the renderer gates
// both at the medium effects tier by the STATIC preset stamp, never the FPS
// governor. Three/DOM-free (a registered RENDER_PURE_CORE).

import { honingGlowTier } from '../sim/progression/honing_policy';
import type { ItemInstancePayload } from '../sim/types';
import { legendaryRegaliaEmitDt } from './legendary_regalia_core';

/** Per-tier mote colors (index = tier - 1): a cool steel blue for a shining
 *  piece, violet for a bright one, pale gold-white for a blazing one. */
export const HONING_GLOW_COLORS = [0x4fb8ff, 0xb46bff, 0xfff2a8] as const;
/** Per-tier emit rates, sparse like the regalia drift (1.8/s) and climbing so
 *  the top tier reads as a clearly brighter piece without becoming a pillar. */
export const HONING_GLOW_RATES_PER_SEC = [1.2, 2.2, 3.6] as const;

/** The highest honing glow tier across every worn slot (0 = no glow). */
export function honingGlowTierOf(instances: Partial<Record<string, ItemInstancePayload>>): number {
  let tier = 0;
  for (const slot in instances) {
    const rank = instances[slot]?.honing?.rank;
    if (typeof rank !== 'number' || !Number.isFinite(rank)) continue;
    tier = Math.max(tier, honingGlowTier(rank));
  }
  return tier;
}

/** The whole emit decision for one wearer on one frame: the dt the pooled
 *  emitter should advance by, or 0 when nothing may emit (no tier, reduced
 *  motion, or a non-positive frame). The regalia shed, reused. */
export function honingGlowEmitDt(
  tier: number | undefined,
  reducedMotion: boolean,
  dt: number,
  distanceSq: number,
): number {
  if (!tier || tier <= 0) return 0;
  return legendaryRegaliaEmitDt(true, reducedMotion, dt, distanceSq);
}

/** The palette and rate for a tier (clamped into the table). */
export function honingGlowStyle(tier: number): { color: number; ratePerSec: number } {
  const i = Math.max(0, Math.min(HONING_GLOW_COLORS.length - 1, Math.floor(tier) - 1));
  return { color: HONING_GLOW_COLORS[i], ratePerSec: HONING_GLOW_RATES_PER_SEC[i] };
}
