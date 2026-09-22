// Honing: spending virtual levels (post-cap lifetime-XP levels) as an
// enchanting resource on WORN gear. One attempt per command: the player names
// a worn slot and one primary stat; the attempt burns the rank's virtual
// levels and gold fee (honing_policy.ts) and rolls once against the rank's
// chance. Success writes one more rank and +1 of the chosen stat onto the
// copy's own `honing` record, which item_instance_stats.ts folds into the
// per-copy active stats (rolled.stats is never touched). The first honing
// binds the copy (the Perfecting boundTo reuse), so honed gear never launders
// spent progression through the market.
//
// Behind the SimContext seam (src/sim/CLAUDE.md); src/sim-pure.
// DRAW CONTRACT: a resolved attempt draws EXACTLY once (the success roll,
// after every deny arm, after the spend, after the bind); every deny arm and
// every info read draws 0.
import { ITEMS } from '../data';
import { recalcPlayerStats } from '../entity';
import { formatMoney } from '../format_money';
import type { PlayerMeta } from '../sim';
import type { SimContext } from '../sim_context';
import { type EquipSlot, isEquipSlot, MAX_LEVEL } from '../types';
import {
  HONING_MAX_RANK,
  type HoningCost,
  type HoningStat,
  honingChance,
  honingCost,
  isHoningStat,
  unspentVirtualLevels,
} from './honing_policy';

/** The per-copy record: the rank walked so far and the +1s it placed, keyed
 *  by stat (`rank` equals their sum; never written at rank 0). */
export interface HoningRecord {
  rank: number;
  stats: Partial<Record<HoningStat, number>>;
}

/** Read-only UI projection: the next attempt's cost and chance on `slot`. */
export interface HoningInfo {
  slot: EquipSlot;
  itemId: string;
  rank: number;
  maxed: boolean;
  cost: HoningCost;
  chance: number;
  stats: Partial<Record<HoningStat, number>>;
}

/** The persisted ledger's load bound: a finite, non-negative integer, else 0
 *  (a NaN ledger would make the pool gate pass forever). */
export function loadedVirtualLevelsSpent(value: unknown): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0;
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
 * Resolve one honing attempt. DENY LADDER, first match wins, each arm draws
 * nothing and spends nothing: dead, forged slot or stat, under the cap,
 * empty slot, already at HONING_MAX_RANK, pool short, purse short. Then:
 * spend both, bind on the first attempt, THE ONE DRAW, and either write the
 * rank (+1 stat) or keep the piece. Every resolved attempt re-bakes derived
 * stats (recalcPlayerStats also rebuilds the peer eqi mirror) and bumps
 * wireRev. Returns true only on a landed rank.
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
  // Spend on every resolved attempt, success or not (the Perfecting rule).
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
  } else {
    ctx.notice(meta.entityId, 'The honing fails; the virtual levels and gold are spent.');
  }
  recalcPlayerStats(e, meta.cls, meta.equipment, ctx.playerMods(meta), meta.equipmentInstance);
  meta.wireRev++;
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
