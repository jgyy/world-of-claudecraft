# Soul Keys and the Heroic Mark tier upgrade

Status: living
Owns: `src/sim/item_binding.ts`, `src/sim/soul_key.ts`,
`src/sim/instances/heroic_upgrade.ts`, `buildHeroicTierVariants` in
`src/sim/content/heroic_variants.ts`
Pinned by: `tests/soul_key.test.ts`, `tests/soul_key_ui.test.ts`,
`tests/heroic_upgrade.test.ts`, the ladder arms in `tests/combat_rating.test.ts`
and `tests/item_icons.test.ts`

## Why

Bind on pickup (`ItemDef.soulbound`) protects reward tokens and keeps raid tier on
the character who earned it. It also strands a drop that went to the wrong spec and
gives gold nothing to buy at the top of the game. Soul Keys keep the bond as the
default and sell a gated, expensive way out of it, so gear can still move and the
coin leaves the economy at a counter.

## Soul Key

- `soul_key` (content/items.ts): a gold-priced tool item sold by Quartermaster Bree
  in Highwatch (`buyValue` is the sink). The key itself trades, mails, sells, and
  lists like any other good; only its EFFECT is gated.
- Right-click a bound paperdoll piece (weapon, armor, held offhand) in the bags
  while holding a key: the `soulKey` row (bag_item_context_menu.ts) opens a
  confirm, then `IWorld.useSoulKey(itemId, { slotIndex })` names the exact copy.
- The sim (`soul_key.ts useSoulKey`) re-validates everything and stamps
  `ItemInstancePayload.unbound: true` on that copy for good, then debits one key.
  The target is stamped BEFORE the key leaves the bags, because `removeItem` can
  splice the key's slot and shift every index above it.
- The allowance: `SOUL_KEY_USES_PER_WEEK` releases per character per weekly reset,
  on the realm's weekly raid-reset clock (`SimContext.weeklyRaidResetMs`), kept on
  `PlayerMeta.soulKeyWeek` and persisted in `CharacterState`. Absent means a fresh
  window.
- Reward tokens (Heroic Marks, sigils: kind `tool`), mounts, and quest items are
  never eligible, so a key can never launder a currency.

### The one predicate

Every gate reads `isSoulboundCopy(def, instance)` (`item_binding.ts`): the def flag
minus the per-copy release. Trade (`social/trade.ts`, through the soulbound offer
skip), mail (`mail/post_office.ts`, send and the load-time return sweep), the World
Market (`market.ts` instanced listing and the load-time reclaim sweep), the guild
bank (`guild_bank.ts`), vendor sale (`items.ts sellItem`, through the bound-copy
tally), the $WOC exchange (`exchange_eligibility.ts`), and the HUD mirrors
(`bags_view.ts`, `guild_bank_view.ts`, `market_view.ts`, the tooltip binding line
in `item_instance_tooltip.ts`) all go through it. A plain fungible stack of a
soulbound def still refuses everywhere: only an instanced copy can carry the release.

The marker rides `publicInstanceView` (it is what lets a listed copy be bought) and
`wornTooltipInstance` (the paperdoll shows the release line), and survives the load
sanitizer as an ordinary boolean field.

## Heroic Mark tier upgrade

- At Quartermaster Vex (the Heroic Quartermaster), the window's upgrade section
  lists every bagged Crucible tier set piece (`ignivar_loot.ts IGNIVAR_SET_ITEMS`)
  with the flat `HEROIC_UPGRADE_MARKS` price. `IWorld.heroicUpgradeItem(itemId,
  { slotIndex })` names the copy; the sim (`instances/heroic_upgrade.ts`) checks
  eligibility, the copy, range, and the marks balance in that order.
- The upgrade consumes the tier copy, debits the marks, and grants the generated
  heroic variant `heroic_<id>` (`buildHeroicTierVariants`): the same two-source-level
  heroic step every variant family takes (26 to 28, still with the raid bonus, so
  item level 37 against 35), primary stats re-budgeted at the new level, armor and
  the Crucible dual rating (60 + 25) carried through, `set` and `requiredClass`
  kept, and NOT soulbound. The copy's own payload (an enchant, a Maker's Bond, the
  player lock) rides across; a party window or a Soul Key release is dropped
  because the variant has no bond to qualify.
- The variants share their base item's name (the `[HEROIC]` tooltip tag is the
  distinction) and its painting: `icons.ts` resolves a tier variant to the base
  WebP instead of requiring 145 more paintings (`tests/item_icons.test.ts` H2).
  Deeds and Reliquary already fold a `heroicOf` variant to its base.

## Wire

Both commands are `send + dispatch` pairs (`soul_key_unbind`, `heroic_upgrade`)
dispatched through `server/counter_service_wire.ts` beside `unbind_item` and
`heroic_buy`; the outcomes are the text-free `soulKeyResult` and
`heroicUpgradeResult` events (`HEAVY_SELF_EVENTS` members, so the stamped or swapped
copy re-diffs the self inventory mirror), rendered by
`src/ui/counter_service_lines.ts`.

## Knobs

`SOUL_KEY_USES_PER_WEEK` (soul_key.ts), the key's `buyValue` (items.ts),
`HEROIC_UPGRADE_MARKS` (heroic_upgrade.ts), and
`IGNIVAR_HEROIC_TIER_SOURCE_LEVEL` (heroic_variants.ts). Restricting which
bind-on-pickup families a key may release is one `isSoulKeyEligible` arm.
