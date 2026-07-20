# Disenchanting epics into soulbound crafting reagents (design)

## Goal

Give Enchanting (and the crafts that consume its output) a real economic reason to
exist: disenchanting an **epic-or-better** weapon or armor piece yields a **typed**
crafting reagent (keyed by the item's armor type or weapon subtype), which is the
*only* way to craft a small set of new "on-demand" epic items — items that are
stronger than anything else craftable, and that can be handed to exactly one other
player (a trade, in person or via the Trade window) before locking to whoever holds
them. This creates targeted demand ("I need a mail disenchanter", "I need a
staff-reagent holder") instead of dumping fungible stacks on the World Market.

## What already exists (do not rebuild)

- `src/sim/professions/enchanting.ts`: `resolveDisenchant`/`isDisenchantable` are
  sim-complete, but **unreachable by players** (no `IWorld` member, no wire command,
  no UI). Today it yields `arcane_dust`/`arcane_essence`/`arcane_shard`, keyed only by
  rarity, for `common..legendary` gear.
- `docs/professions-2/phase-13-enchanting.md` / `state.md`: the maintainer's own plan
  to wire disenchant+enchant+salvage to players (marked "planned", not yet built).
  This feature **subsumes that wiring** for disenchant (enchant-apply and salvage stay
  out of scope here; they are independent actions with their own PR).
- Binding already has two mechanisms: `ItemDef.soulbound` (static, per-definition) and
  `ItemInstancePayload.boundTo` (per-copy). Enforced in `social/trade.ts`
  (`def.soulbound` only today) and `market.ts` (`def.soulbound`, plus instanced items
  are already inert/unlistable on the World Market — no change needed there).
- `ItemInstancePayload` already carries `signer`/`charges`/`rolled`/`enchant`/`boundTo`
  and rides bags/bank/equip/save-load/trade correctly (Phase 3).

## New mechanic: trade-once-then-bound

Neither existing binding primitive expresses "tradeable exactly once." Add:

```ts
// ItemInstancePayload (types.ts)
tradesRemaining?: number; // starts at 1 for reagents/on-demand epics; absent = unlimited
```

Rule: an instance with `tradesRemaining !== undefined` behaves like a normal tradeable
item while `tradesRemaining > 0`. On a successful trade (`resolveTradeConfirm` in
`sim/social/trade.ts`) that transfers such an instance, the server decrements it; when
it reaches 0 it also stamps `boundTo = <recipient entity id>`. `boundTo` (already
enforced pattern in bag/equip flows for its existing masterwork/signer use) plus
`tradesRemaining === 0` together are the "now soulbound" state: `trade.ts`'s offer
builder refuses to offer an instance with `tradesRemaining === 0`, same spot as the
existing `def.soulbound` check (`social/trade.ts:105`).
Mail and the World Market: instanced items are already inert there (per the
professions-2 state.md drift note), so no separate gate is needed; documented as a
deliberate no-op, matching the existing instanced-item posture.

This is a small, generic, reusable primitive — not special-cased per item — so any
future "BoE-once" item can opt in by minting an instance with `tradesRemaining: 1`.

## Reagent taxonomy

Disenchanting `epic` or `legendary` gear takes a **new branch**, keyed by item type
instead of only rarity (existing `common..rare` behavior via
`DISENCHANT_MATERIAL_BY_QUALITY` is untouched):

- Armor (`ArmorType`): `cloth` -> `arcane_bound_cloth`, `leather` ->
  `arcane_bound_hide`, `mail` -> `arcane_bound_chain`.
- Weapon (`WeaponSkinType`): `sword`/`axe`/`mace`/`dagger` -> melee reagents
  (`arcane_bound_edge`, shared across the four one-handed/melee subtypes to keep the
  recipe/test surface sane — see Open scope note), `staff`/`wand` -> `arcane_bound_focus`,
  `bow`/`crossbow` -> `arcane_bound_quiver`.

  (Revisit: the brainstorm asked for full weapon-subtype granularity; collapsing
  sword/axe/mace/dagger into one melee reagent avoids 8 near-duplicate recipes with no
  gameplay difference between, say, a sword-reagent recipe and an axe-reagent recipe.
  Held-offhand items (`held_offhand`, caster stat sticks) are out of scope: they are
  not disenchantable today (`isDisenchantable` requires `kind==='weapon'|'armor'`) and
  this feature does not change that eligibility rule.)

Net: **6 new reagent item ids**, each `soulbound: false`, minted as an
`ItemInstancePayload` with `tradesRemaining: 1` (a *specific copy* is bound-after-one-
trade, not the item definition itself — mirrors how enchant/masterwork output already
works as an instanced copy).

Yield: reuse `disenchantYield` unchanged (rarity + tier + rng bonus) for the count.

## New recipes ("on-demand" epics)

One recipe per reagent type (6 total — the earlier "2 per type" framing from
brainstorming is trimmed to 1 per type in this pass; see Open scope note) craftable
under Enchanting's `CRAFT_RING` neighbor crafts (armorcrafting for the three armor
reagents, weaponcrafting for the three weapon reagents), each:

- Requires the matching typed reagent (a specific count) plus normal high-tier
  vendor/gather reagents (same shape as `LADDER_RECIPES`), `skillReq` at the top of the
  existing ladder (75+, above today's highest `50` rung) so these sit as the new
  ceiling.
- `stationType`: the matching craft's existing station (forge/loom/tannery/toolworks).
- `acquisition: ['trainer']`, taught only at `tier 75+` (a new rung above the existing
  0/25/50 ladder — `training.ts`'s `teachTierMet` predicate already generalizes to any
  tier via `tierForSkill`, so this needs no sim change, only content + the
  `TRAINING_FEE_BY_TIER` array gaining a 4th (75+) entry).
- Output: a brand-new `epic` quality item id (stat budget above the existing
  `LADDER_RECIPES` ceiling, below raid-floor per the locked masterwork power-bounds
  rule), granted via `ctx.addItemInstance` with `tradesRemaining: 1` set at craft time
  (mirrors `resolveApplyEnchant`'s instance-merge call site in shape, not logic).

Item stats follow existing `item_budget.ts` conventions for an item at this level
band; exact numbers are a maintainer/balance follow-up if review flags them, per the
"don't invent balance numbers" rule — this PR uses the same budget function every
other epic-tier item already uses, not new made-up numbers.

## Wiring (completes the Phase 13 disenchant slice, disenchant-only)

- `src/world_api/professions.ts`: `IWorldProfessions.disenchantItem(itemId)` command +
  `lastDisenchantResult` typed view (mirrors the existing planned shape verbatim).
- Both `Sim` and `ClientWorld` implement it live (command over the wire, delta-key
  mirrored result, following the `ncd`/`gprof` self-wire pattern - avoids the #2033
  stub trap).
- `server/game.ts`: `disenchant_item` command dispatch; proximity/ownership/eligibility
  re-checked server-side; replay-safe (a duplicated command cannot double-destroy the
  source item or double-grant the reagent).
- Bags context action "Disenchant" on eligible items (epic+ shows the typed-reagent
  copy in the confirm text so players know what they are giving up), behind the
  existing destructive-confirm dialog family (stronger warning for
  masterwork/signed/enchanted instances, matching the Phase 13 plan).
- Parity pins: `tests/world_api_parity.test.ts`, `ALL_DELTA_KEYS` +
  `TERSE_TO_IWORLD` in `tests/snapshots.test.ts`.

## Out of scope (explicitly deferred)

- `applyEnchant` and `salvageItem` reachability (Phase 13's other two actions): a
  separate, independent PR — this feature only needs `disenchantItem` reachable.
- World Market / mail carriage of instanced items generally (pre-existing "wave 2"
  gap; this feature does not widen or narrow it).
- Batch/disenchant-all UI.
- New weapon-subtype-granular reagents beyond the melee/caster/ranged three-way split
  (see the Reagent taxonomy note); can be split further later without breaking the
  `tradesRemaining` primitive.

## Testing

- `tests/professions_enchanting.test.ts`: extend for the new epic+ branch (reagent
  selection by armor/weapon type, unaffected common..rare path, disenchanting a
  `held_offhand`/`quest`/`poor` item still denies).
- New `tests/professions_ondemand_recipes.test.ts`: each of the 6 recipes crafts end
  to end (ladder_crafting.ts precedent), requires and consumes the typed reagent,
  denies without it, requires the 75+ tier and station.
- New `tests/trade_once.test.ts`: an instance with `tradesRemaining: 1` trades once
  then is refused a second trade (`social/trade.ts` offer-builder path) and carries
  `boundTo` afterward; an instance with no `tradesRemaining` is unaffected (regression
  guard against changing existing trade behavior).
- `tests/professions_enchanting.test.ts` / new command test: `disenchantItem` replay
  safety, proximity/ownership re-check, live `ClientWorld` round trip.
- `tests/world_api_parity.test.ts`, `tests/snapshots.test.ts` pins updated in the same
  change.

## i18n

English-only catalog keys (PR-tier gate): 6 reagent names, 6 new item names, bags
context action label + confirm/stronger-warning copy (reuses the Phase 13 confirm
family), `disenchantResult` toast text as a stable id + values per the S3 rule.
