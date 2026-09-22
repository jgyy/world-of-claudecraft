// Honing: spending virtual levels (post-cap lifetime-XP levels) as an
// enchanting resource on WORN gear. One attempt per command: the player names
// a worn slot and one primary stat; the attempt burns the rank's virtual
// levels and gold fee (honing_policy.ts) and rolls once against the rank's
// chance. Success writes one more rank and +1 of the chosen stat onto the
// copy's own `honing` payload record, which item_instance_stats.ts folds into
// the per-copy active stats (so combat, tooltips, compare, and auto-equip all
// read it through the one existing channel; rolled.stats is never touched, so
// the Rift rebuild and the enchant replace-arm stay unaware of it). The first
// honing binds the copy to the player (the Perfecting Maker's Bond reuse of
// boundTo), so honed gear never launders spent progression through the market.
//
// Behind the SimContext seam (src/sim/CLAUDE.md): functions taking (ctx, ...)
// plus pure leaves; never a Sim import (PlayerMeta arrives type-only).
// src/sim-pure: no DOM/render/ui/game/net imports, no Math.random/Date.now.
//
// DRAW CONTRACT (the perfecting.ts header discipline):
//   attempt, resolved ......... EXACTLY 1 ctx.rng draw (the success roll), at
//                               the documented position: after every deny
//                               arm, after the level and fee spend, after the
//                               first-attempt boundTo stamp
//   attempt, every deny arm ... 0, and nothing is spent
//   info reads ................ 0

import { ITEMS } from '../data';
import { recalcPlayerStats } from '../entity';
import { formatMoney } from '../format_money';
import type { PlayerMeta } from '../sim';
import type { SimContext } from '../sim_context';
import { type EquipSlot, isEquipSlot, MAX_LEVEL } from '../types';
import {
  HONING_FAIL_RESETS,
  HONING_MAX_RANK,
  type HoningCost,
  type HoningStat,
  honingChance,
  honingCost,
  isHoningStat,
  unspentVirtualLevels,
} from './honing_policy';

/** The per-copy honing record (ItemInstancePayload.honing): the rank walked
 *  so far and the +1s it placed, keyed by the chosen stat. `rank` always
 *  equals the sum of `stats`; a copy is never written with rank 0 (the record
 *  is deleted instead, so an unhoned copy carries no field and pre-feature
 *  saves load clean). */
export interface HoningRecord {
  rank: number;
  stats: Partial<Record<HoningStat, number>>;
}

/** Read-only projection for the UI: what the next attempt on `slot` would
 *  cost and its chance, plus the worn copy's current rank. Null when the
 *  slot holds nothing. Draws nothing. */
export interface HoningInfo {
  slot: EquipSlot;
  itemId: string;
  rank: number;
  maxed: boolean;
  cost: HoningCost;
  chance: number;
  stats: Partial<Record<HoningStat, number>>;
}

export function honingRankOf(instance: { honing?: HoningRecord } | undefined): number {
  const rank = instance?.honing?.rank;
  return typeof rank === 'number' && Number.isFinite(rank) ? Math.max(0, Math.floor(rank)) : 0;
}

export function honingInfoFrom(
  reads: {
    equipment: Readonly<Partial<Record<EquipSlot, string>>>;
    equipmentInstances: Readonly<Partial<Record<EquipSlot, { honing?: HoningRecord }>>>;
  },
  slot: EquipSlot,
): HoningInfo | null {
  const itemId = reads.equipment[slot];
  if (!itemId) return null;
  const instance = reads.equipmentInstances[slot];
  const rank = honingRankOf(instance);
  return {
    slot,
    itemId,
    rank,
    maxed: rank >= HONING_MAX_RANK,
    cost: honingCost(rank),
    chance: honingChance(rank),
    stats: { ...instance?.honing?.stats },
  };
}

export function honingInfoFor(
  ctx: SimContext,
  pid: number | undefined,
  slot: EquipSlot,
): HoningInfo | null {
  const r = ctx.resolve(pid);
  if (!r) return null;
  return honingInfoFrom(
    { equipment: r.meta.equipment, equipmentInstances: r.meta.equipmentInstance },
    slot,
  );
}

/**
 * Resolve one honing attempt. DENY LADDER, in order, first match wins, every
 * denial draws ZERO rng and spends nothing:
 *   1. dead player
 *   2. malformed slot or stat (a forged frame; the server validates shape
 *      first, the sim re-validates)
 *   3. under the level cap (virtual levels only exist past it)
 *   4. nothing worn in that slot
 *   5. the copy is already at HONING_MAX_RANK
 *   6. not enough unspent virtual levels
 *   7. not enough gold
 * Then: spend both, bind on the first attempt, THE ONE DRAW, and either
 * write the rank (+1 stat) or, on a miss, keep the piece (or reset it whole
 * when HONING_FAIL_RESETS). Every resolved attempt re-bakes the wearer's
 * derived stats (the worn-mutation recipe: recalcPlayerStats is also the one
 * site the peer eqi mirror is rebuilt) and bumps wireRev so the owner's
 * heavy self mirrors re-diff. Returns true only on a landed rank.
 */
export function resolveHoningAttempt(
  ctx: SimContext,
  pid: number | undefined,
  slot: string,
  stat: string,
): boolean {
  const r = ctx.resolve(pid);
  if (!r) return false;
  const meta: PlayerMeta = r.meta;
  const e = r.e;
  if (e.dead) {
    ctx.error(meta.entityId, "You can't do that while dead.");
    return false;
  }
  if (!isEquipSlot(slot) || !isHoningStat(stat)) {
    ctx.error(meta.entityId, 'You cannot hone that.');
    return false;
  }
  if (e.level < MAX_LEVEL) {
    ctx.error(meta.entityId, 'You must be at the level cap to hone gear.');
    return false;
  }
  const itemId = meta.equipment[slot];
  const def = itemId ? ITEMS[itemId] : undefined;
  if (!itemId || !def) {
    ctx.error(meta.entityId, 'You have nothing worn in that slot to hone.');
    return false;
  }
  let payload = meta.equipmentInstance[slot];
  const rank = honingRankOf(payload);
  if (rank >= HONING_MAX_RANK) {
    ctx.error(meta.entityId, 'That item is already fully honed.');
    return false;
  }
  const cost = honingCost(rank);
  if (unspentVirtualLevels(meta.lifetimeXp, meta.virtualLevelsSpent) < cost.levels) {
    ctx.error(meta.entityId, `You need ${cost.levels} unspent virtual levels to hone that.`);
    return false;
  }
  if (meta.copper < cost.copper) {
    ctx.error(meta.entityId, `You need ${formatMoney(cost.copper)} to hone that.`);
    return false;
  }
  // Spend: the ledger and the purse move on every resolved attempt, success
  // or not (the Perfecting materials rule).
  meta.virtualLevelsSpent += cost.levels;
  meta.copper -= cost.copper;
  // First attempt: a plain worn copy gains a payload, and the copy binds.
  if (payload === undefined) {
    payload = {};
    meta.equipmentInstance[slot] = payload;
  }
  if (payload.boundTo === undefined) {
    payload.boundTo = meta.entityId;
    ctx.notice(meta.entityId, `Honing begins: ${def.name} is now bound to you.`);
  }
  // THE ONE DRAW (see the module header's draw contract).
  const roll = ctx.rng.next();
  let landed = false;
  if (roll < honingChance(rank)) {
    const record: HoningRecord = payload.honing ?? { rank: 0, stats: {} };
    record.rank = rank + 1;
    record.stats[stat] = (record.stats[stat] ?? 0) + 1;
    payload.honing = record;
    landed = true;
    const next = record.rank;
    ctx.notice(meta.entityId, `Honing: ${def.name} is now honed +${next}.`, '#ffd100');
  } else if (HONING_FAIL_RESETS && payload.honing) {
    delete payload.honing;
    ctx.notice(meta.entityId, `The honing fails and ${def.name} loses every hone.`);
  } else {
    ctx.notice(meta.entityId, 'The honing fails; the virtual levels and gold are spent.');
  }
  recalcPlayerStats(e, meta.cls, meta.equipment, ctx.playerMods(meta), meta.equipmentInstance);
  meta.wireRev++;
  // Text-free signal so an open character sheet repaints its honing card
  // (the prestige event's job for the rank line).
  ctx.emit({
    type: 'honed',
    pid: e.id,
    slot,
    rank: honingRankOf(payload),
    landed,
    spent: meta.virtualLevelsSpent,
  });
  return landed;
}
