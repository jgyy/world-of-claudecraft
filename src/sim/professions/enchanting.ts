// Enchanting profession: disenchant an eligible weapon/armor piece into arcane
// materials, then spend those materials to apply a permanent stat bonus to a
// SPECIFIC held copy of an item (not the character, not the item id in the
// abstract). An enchanted piece is a fresh, non-stacking instanced copy
// (types.ts ItemInstancePayload.rolled.stats), so it survives equip/unequip
// (src/sim/items.ts) and stays a distinct good, separate from a plain copy of
// the same item id. sellItem/discardItem/trade's drop arm now prefer a
// fungible copy over this one (items.ts removePreferFungible), but market
// listing, mail, and trade do not yet carry the instance payload end to end
// (#1165-style gap): a fully "tradeable good" is a known follow-up, not yet
// true here.
//
// Layered on top of, not a replacement for, the existing everyone-can-salvage
// system (./salvage.ts, issue #1300): salvage still yields the same generic
// materials (bone_fragments/linen_scrap/spider_leg) for anyone, unconditionally.
// disenchantItem here is the Enchanting-specific action: dedicated arcane
// materials, scaling with the item's rarity (strictly better than plain
// salvage from `rare` up; near-identical vendor value at `common`), and is
// the intended reagent source for applyEnchant below.
//
// Scope (v1): no skill-gate beyond the free-floor rule every other common-tier
// craft action in this repo follows (crafting.ts, wheel.ts) - any player can
// disenchant or apply an enchant regardless of craftSkills.enchanting. Both
// actions DO gain flat 'enchanting' skill on success now (#1712 round-3
// review point 3), so the specialization recharge discount (professions/
// tools.ts) and the Enchanter archetype eventually engage; the archetype
// output-quality ceiling crafting.ts's craftItem enforces is NOT wired in
// here yet (this action has no rollable output quality to clamp), matching
// how salvage.ts also does not participate in that half of the wheel. Not
// yet wired onto a server WS
// command or a dedicated UI window (same not-yet-wired status salvageItem
// documents on PlayerMeta.lastSalvageResult): a future issue extends
// IWorldProfessions + ClientWorld + server/game.ts the way craft_item/
// harvest_node already are, plus adds a target-item picker.
//
// This module is `src/sim`-pure: no DOM/browser/Three.js imports, no
// Math.random/Date.now (uses ctx.rng only), host-agnostic so it runs
// offline, on the server, and in the headless RL env unchanged.

import { ENCHANTS } from '../content/enchants';
import { WEAPON_TYPE_BY_ITEM } from '../content/weapon_skin_rules';
import { ITEMS } from '../data';
import { requiredLevelFor } from '../item_level_req';
import type { Rng } from '../rng';
import type { SimContext } from '../sim_context';
import { cloneItemInstancePayload, type ItemDef, type ItemInstancePayload } from '../types';
import { gainCraftSkill } from './wheel';

// #1712 round-3 review: neither action previously called gainCraftSkill, so
// craftSkills.enchanting stayed 0 forever, permanently locking the
// specialization recharge discount (professions/tools.ts) and the Enchanter
// archetype's own craft out of any progression. Flat gain, same shape as
// crafting.ts's CRAFT_SKILL_GAIN: no tier-ceiling clamp on OUTPUT (v1 scope,
// same as salvage.ts, which also does not participate in the archetype
// ceiling machinery), just the skill counter itself moving.
const ENCHANTING_SKILL_GAIN = 1;

const QUALITY_ORDER: readonly NonNullable<ItemDef['quality']>[] = [
  'poor',
  'common',
  'uncommon',
  'rare',
  'epic',
  'legendary',
];

// Which arcane material a disenchant yields, keyed by the disenchanted
// item's rarity: a dedicated Enchanting material rather than a shared junk
// item, feeding the same three tiers applyEnchant's reagents draw from. Only
// strictly better than plain salvage.ts's generic yield from `rare` up
// (arcane_dust and bone_fragments vendor near-identically at `common`; see
// #1712 round-3 review point 12).
const DISENCHANT_MATERIAL_BY_QUALITY: Readonly<Record<string, string>> = {
  common: 'arcane_dust',
  uncommon: 'arcane_dust',
  rare: 'arcane_essence',
  epic: 'arcane_shard',
  legendary: 'arcane_shard',
};

// Disenchanting `epic`/`legendary` gear also takes a TYPED branch (the
// on-demand epics economy): the yield is keyed by the piece's armor type or
// weapon subtype instead of only its rarity, so a specific typed reagent
// feeds the matching craft's new top-rung recipe (see
// content/recipes.ts ON_DEMAND_RECIPES). Armor types map 1:1; the four
// one-handed melee weapon subtypes (sword/axe/mace/dagger) share one reagent
// (a dedicated reagent per subtype would be gameplay-identical content, not a
// meaningful distinction), and staff/wand share the caster-focus reagent.
// There is deliberately no bow/crossbow entry: this game has no itemized bow
// (weapon_skin_rules.ts WEAPON_TYPE_BY_ITEM carries zero bow/crossbow rows;
// hunters use an abstract "class ranged weapon" with no equippable mainhand
// item of that type), so there is nothing of that type to ever disenchant.
// Jewelry (kind 'armor' with no armorType) and any weapon subtype absent from
// this map (e.g. 'polearm', which no current polearm item is epic+) have no
// natural type to key on and keep the untyped DISENCHANT_MATERIAL_BY_QUALITY
// path below, unaffected by this branch.
const ARMOR_TYPE_REAGENT: Readonly<Record<string, string>> = {
  cloth: 'arcane_bound_cloth',
  leather: 'arcane_bound_hide',
  mail: 'arcane_bound_chain',
};
const WEAPON_TYPE_REAGENT: Readonly<Record<string, string>> = {
  sword: 'arcane_bound_edge',
  axe: 'arcane_bound_edge',
  mace: 'arcane_bound_edge',
  dagger: 'arcane_bound_edge',
  staff: 'arcane_bound_focus',
  wand: 'arcane_bound_focus',
};

/** The typed epic+ reagent item id for `def`, or undefined when `def` has no
 *  natural type to key on (untyped armor/weapon, or below epic quality). Pure
 *  lookup, no side effect. */
export function typedDisenchantReagent(def: ItemDef): string | undefined {
  if (def.quality !== 'epic' && def.quality !== 'legendary') return undefined;
  if (def.kind === 'armor' && def.armorType) return ARMOR_TYPE_REAGENT[def.armorType];
  if (def.kind === 'weapon') return WEAPON_TYPE_REAGENT[WEAPON_TYPE_BY_ITEM[def.id] ?? ''];
  return undefined;
}

/** The authoritative already-enchanted read for one instance payload: the
 *  explicit `enchant` marker (written by resolveApplyEnchant below), or, for
 *  legacy enchanted copies that predate the marker, bare rolled.stats WITHOUT
 *  rolled.masterwork (before the Phase 2 masterwork model, applyEnchant was
 *  the ONLY writer of rolled.stats, so bare stats meant enchanted; a
 *  masterwork copy carries rolled.stats without being enchanted and must stay
 *  enchantable exactly like a plain copy). This is what the
 *  countEnchantableItem/removeEnchantableItem guards (sim.ts) key on, so
 *  double-enchant prevention holds for both legacy and marker-carrying
 *  copies. */
export function isEnchantedInstance(instance: ItemInstancePayload): boolean {
  return (
    instance.enchant !== undefined || (!!instance.rolled?.stats && !instance.rolled.masterwork)
  );
}

/** Eligible for disenchant: same eligibility as plain salvage (an equippable
 *  weapon or armor piece, at least `common` quality). */
export function isDisenchantable(def: ItemDef | undefined): boolean {
  return (
    !!def &&
    (def.kind === 'weapon' || def.kind === 'armor') &&
    !!def.quality &&
    def.quality !== 'poor'
  );
}

/** The arcane material yield for one disenchant of `def`: scales with rarity
 *  and tier the same way salvage.ts's salvageYield does, plus one rng-rolled
 *  bonus unit, but the material itself is the dedicated, more valuable
 *  Enchanting tier (see DISENCHANT_MATERIAL_BY_QUALITY), not a generic junk
 *  item. Pure aside from the rng draw. */
export function disenchantYield(def: ItemDef, rng: Rng): number {
  const qualityIdx = Math.max(0, QUALITY_ORDER.indexOf(def.quality ?? 'common'));
  const tierBonus = Math.floor(requiredLevelFor(def) / 10);
  const bonus = rng.next() < 0.5 ? 0 : 1;
  return qualityIdx + tierBonus + 1 + bonus;
}

export interface DisenchantResult {
  ok: boolean;
  itemId: string;
  materialItemId?: string;
  count?: number;
  /** True when materialItemId is the new typed epic+ reagent (minted as a
   *  tradesRemaining:1 instance) rather than the untyped fungible dust/
   *  essence/shard stack. */
  typed?: boolean;
  reason?: 'unknown_item' | 'not_disenchantable' | 'not_held';
}

/** Resolve one disenchant attempt: denies (no side effect) if the item id is
 *  unknown, ineligible, or the player does not hold an eligible copy (a plain
 *  fungible copy, OR an instanced copy that has NOT itself been enchanted -
 *  e.g. crafting.ts's single-copy rare+ craft grant, which instances every
 *  rare-or-better craft for its signer/rolled-quality payload without
 *  applying an enchant; see countEnchantableItem). Consumes exactly one such
 *  copy on success (never an already-enchanted copy, via removeEnchantableItem).
 *  Grants EITHER the typed epic+ reagent (typedDisenchantReagent above, fixed
 *  at one bound-after-one-trade instance: the reagent is meant to be a
 *  precious, individually tracked good, not a stacking yield) OR, when `def`
 *  has no natural type, the untyped rolled arcane material yield exactly as
 *  before (DISENCHANT_MATERIAL_BY_QUALITY, unaffected by this feature). */
export function resolveDisenchant(ctx: SimContext, pid: number, itemId: string): DisenchantResult {
  const def = ITEMS[itemId];
  if (!def) return { ok: false, itemId, reason: 'unknown_item' };
  if (!isDisenchantable(def)) return { ok: false, itemId, reason: 'not_disenchantable' };
  if (ctx.countEnchantableItem(itemId, pid) < 1) return { ok: false, itemId, reason: 'not_held' };
  ctx.removeEnchantableItem(itemId, 1, pid);
  const meta = ctx.players.get(pid);
  const typedReagent = typedDisenchantReagent(def);
  let result: DisenchantResult;
  if (typedReagent) {
    ctx.addItemInstance(typedReagent, { tradesRemaining: 1 }, pid);
    result = { ok: true, itemId, materialItemId: typedReagent, count: 1, typed: true };
  } else {
    const materialItemId = DISENCHANT_MATERIAL_BY_QUALITY[def.quality ?? 'common'] ?? 'arcane_dust';
    const count = disenchantYield(def, ctx.rng);
    ctx.addItem(materialItemId, count, pid);
    result = { ok: true, itemId, materialItemId, count };
  }
  if (meta) {
    gainCraftSkill(meta.craftSkills, 'enchanting', ENCHANTING_SKILL_GAIN);
    // The skill gain feeds the craftSkill deed triggers, so the site marks
    // the player dirty itself (the crafting.ts craftItem contract).
    ctx.markDeedsDirty(meta.entityId);
  }
  return result;
}

/** Command entry point, mirroring professions/salvage.ts's salvageItem shape
 *  exactly: resolves the caller's own player entity via ctx.resolve, then
 *  delegates to resolveDisenchant. Runs on the deterministic tick the
 *  command arrives on, never off-tick. */
export function disenchantItem(ctx: SimContext, itemId: string, pid?: number): DisenchantResult {
  const r = ctx.resolve(pid);
  if (!r) return { ok: false, itemId, reason: 'unknown_item' };
  return resolveDisenchant(ctx, r.meta.entityId, itemId);
}

export interface ApplyEnchantResult {
  ok: boolean;
  itemId: string;
  enchantId: string;
  reason?:
    | 'unknown_item'
    | 'unknown_enchant'
    | 'wrong_slot'
    | 'not_held'
    | 'insufficient_materials';
}

/** Resolve one apply-enchant attempt against a HELD (bagged, not currently
 *  equipped) eligible copy of `itemId`: a plain fungible copy, or an
 *  instanced copy that has NOT itself been enchanted yet (crafted rare+ gear;
 *  see countEnchantableItem). Denies (no side effect) if the item or enchant
 *  id is unknown, the enchant does not target this item's slot, the player
 *  holds no eligible copy, or any reagent is short (all-or-nothing, same
 *  reagent-availability discipline crafting.ts's craftItem uses).
 *  On success: consumes exactly one eligible copy (removeEnchantableItem, so
 *  an already-enchanted copy of the same item is never silently overwritten)
 *  and every reagent, then grants a freshly-instanced copy carrying the
 *  enchant's stat bonus (ctx.addItemInstance): equipping THAT copy is what
 *  carries the bonus into recalcPlayerStats (see items.ts equipItem). If the
 *  consumed copy was itself instanced (a crafted rare+ piece carrying a
 *  signer payload, a Phase 2 masterwork copy carrying baked bonus stats, or a
 *  legacy rolled.quality copy), that payload is merged into the new instance
 *  rather than dropped (stats sum ADDITIVELY), so enchanting a crafted or
 *  masterwork item does not erase its crafter attribution
 *  (battlefield_xp.ts), its masterwork bonus, or legacy rolled.quality
 *  (#1712 round-3 review). */
export function resolveApplyEnchant(
  ctx: SimContext,
  pid: number,
  itemId: string,
  enchantId: string,
): ApplyEnchantResult {
  const itemDef = ITEMS[itemId];
  if (!itemDef) return { ok: false, itemId, enchantId, reason: 'unknown_item' };
  const enchant = ENCHANTS[enchantId];
  if (!enchant) return { ok: false, itemId, enchantId, reason: 'unknown_enchant' };
  if (itemDef.slot !== enchant.itemSlot) {
    return { ok: false, itemId, enchantId, reason: 'wrong_slot' };
  }
  if (ctx.countEnchantableItem(itemId, pid) < 1) {
    return { ok: false, itemId, enchantId, reason: 'not_held' };
  }
  for (const reagent of enchant.reagents) {
    if (ctx.countItem(reagent.itemId, pid) < reagent.count) {
      return { ok: false, itemId, enchantId, reason: 'insufficient_materials' };
    }
  }
  const [consumed] = ctx.removeEnchantableItem(itemId, 1, pid);
  for (const reagent of enchant.reagents) ctx.removeItem(reagent.itemId, reagent.count, pid);
  const merged: ItemInstancePayload = consumed
    ? cloneItemInstancePayload(consumed)
    : ({} as ItemInstancePayload);
  // ADDITIVE stat merge (Phase 2): a masterwork copy's baked bonus
  // (rolled.stats alongside rolled.masterwork) and the enchant's bonus must
  // BOTH survive on the enchanted copy, so the enchant sums into any existing
  // record instead of replacing it. signer, rolled.masterwork, and legacy
  // rolled.quality ride through the clone above untouched. A consumed copy is
  // never already enchanted (removeEnchantableItem guards on
  // isEnchantedInstance), so this never stacks one enchant onto another.
  const mergedStats: Record<string, number> = { ...merged.rolled?.stats };
  for (const [stat, value] of Object.entries(enchant.statBonus)) {
    if (value === undefined) continue;
    mergedStats[stat] = (mergedStats[stat] ?? 0) + value;
  }
  merged.rolled = { ...merged.rolled, stats: mergedStats };
  // The explicit already-enchanted marker (isEnchantedInstance above): keyed
  // on the enchant itself rather than bare stats presence, so masterwork
  // copies stay enchantable while double-enchant stays blocked.
  merged.enchant = enchant.id;
  ctx.addItemInstance(itemId, merged, pid);
  const meta = ctx.players.get(pid);
  if (meta) {
    gainCraftSkill(meta.craftSkills, 'enchanting', ENCHANTING_SKILL_GAIN);
    // The skill gain feeds the craftSkill deed triggers, so the site marks
    // the player dirty itself (the crafting.ts craftItem contract).
    ctx.markDeedsDirty(meta.entityId);
  }
  return { ok: true, itemId, enchantId };
}

/** Command entry point, same shape as disenchantItem/salvageItem above. */
export function applyEnchant(
  ctx: SimContext,
  itemId: string,
  enchantId: string,
  pid?: number,
): ApplyEnchantResult {
  const r = ctx.resolve(pid);
  if (!r) return { ok: false, itemId, enchantId, reason: 'unknown_item' };
  return resolveApplyEnchant(ctx, r.meta.entityId, itemId, enchantId);
}
