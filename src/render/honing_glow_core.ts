// The honed-gear world-space identity (src/sim/progression/honing.ts): which
// glow tier a worn set earns, its palette, and how strongly to emit it at a
// viewer distance. The Lineage-style "wow" for highly honed gear: a piece
// starts to shine at rank 4, brightens at 7, and blazes at the cap
// (HONING_GLOW_RANKS in the sim's honing_policy.ts, the ONE source of the
// thresholds; this module only maps a rank to a tier through it).
//
// THE PREDICATE IS A PURE FUNCTION OF THE PEER-WIRE `honing` FIELD ONLY: the
// record deliberately JOINS the eqi allowlist (server/equipped_instance_wire.ts
// and publicInstanceView), so self, peer, offline, and online all compute the
// same tier from the same bytes (the legendary_regalia_core host-parity
// doctrine). Nothing else on the payload is read.
//
// The emit decision reuses the regalia shed verbatim (legendaryRegaliaEmitDt:
// the fixed CHARACTER_LOD_RANGE_SQ anchor, eased, quantized, floored, never 0,
// suppressed under the viewer's prefers-reduced-motion), so the two worn-gear
// identities fade together and the fairness contract is stated once. The
// renderer gates BOTH at the medium effects tier by the STATIC preset stamp,
// never the FPS governor; a honed wearer under the tier is simply unlit,
// which hides nothing a player acts on.
//
// Three/DOM-free and deterministic (a registered RENDER_PURE_CORE).

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
