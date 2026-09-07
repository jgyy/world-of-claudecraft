# Fast travel: Waystones, Grand Teleports, and the Hellgate

Three ways to shorten a journey, each with a different owner and a different
price, all resolved by the one deterministic sim. None of them replaces the
road: a mount stays the free option, the Waystone hop is the paid instant one,
and the two class gates carry a group rather than a single traveller.

Companion documents: the Book of Deeds at `docs/design/deeds.md` and the
Reliquary at `docs/design/reliquary.md` own the cosmetic obligations this
content authored.

## Waystones (everyone)

FF14-style instant teleport between attuned stones, paid by a distance-scaled
gold fee or, for free, by a Waystone Ticket earned from the daily Dungeon
Finder queue. There is no ride: the hop resolves immediately.

- **Data:** `src/sim/content/waystones.ts` (`WAYSTONES`, one `WaystoneDef` per
  zone hub with its keeper's `npcId`, plus the fee and ticket constants and
  the `waystone_ticket` `ItemDef`). One Waystone Keeper NPC per hub town
  (title "Waystone Keeper"), one persisted stone id per town.
- **Attune:** talking to a stone's keeper (`attuneWaystone` in
  `src/sim/waystones.ts`) records the stone in `CharacterState.waystonesAttuned`
  the first time and always opens the client waystone window. A keeper only
  offers hops to stones the character has already attuned.
- **Hop:** `waystoneTeleport` in `src/sim/waystones.ts` is the server-authoritative
  verb: from the keeper currently in reach (`WAYSTONE_KEEPER_RANGE`, the bank
  and Rift Forge's `INTERACT_RANGE + 2`) to any attuned stone, instantly. It
  refuses in combat, refuses an unattuned or same-stone destination, and lands
  through `displacePlayer` so the arrival is settled like every other
  teleport (no carried fall damage).
- **Fee:** `waystoneFee` in `src/sim/waystone_fee.ts` prices a hop by
  straight-line distance between the two stones: `WAYSTONE_FEE_PER_100YD_COPPER`
  per started 100 yards, floored at `WAYSTONE_FEE_MIN_COPPER`, then discounted
  by the traveller's guild tier (`WAYSTONE_GUILD_DISCOUNT_PCT`, indexed by
  `src/sim/guild_tier.ts` tier). Rounding happens once, at the end, so the fee
  the HUD quotes never drifts from what is charged.
- **Waystone Tickets:** `src/sim/waystone_tickets.ts`. A group the Dungeon
  Finder assembled that then clears that dungeon's final boss pays every
  credited participant `WAYSTONE_TICKETS_PER_FINDER_CLEAR` tickets, once per
  realm day (`ctx.resetDay`, tracked in `CharacterState.waystoneTicketDay`); a
  premade that walks in through the door earns none. A ticket in the bags
  pays the next hop instead of gold. `grantWaystoneTickets` is the one seam
  every ticket source goes through, so a future event can grant tickets
  without a new payment path.
- **Reserved-id spawn:** every keeper is a `dynamic` NpcDef spawned at world
  init on `WAYSTONE_KEEPER_ENTITY_ID_BASE + <WAYSTONES index>` (the Warfare
  Quartermaster precedent, `STATIC_WORLD_SERVICE_ENTITY_ID_MIN` in
  `src/sim/types.ts`). Adding a stone therefore never shifts a sequential
  entity id or a parity golden. Append new stones at the END of `WAYSTONES`:
  the index is the id, and stone ids follow the never-rename rule.
- **Client:** the waystone window under `src/ui/hud/waystone/`, reached from
  a keeper's gossip menu.

## Grand Teleports (mage)

- **Data:** `src/sim/content/grand_teleports.ts`. Four destinations, the four
  old-road cities, each ONE hidden mage ability (`grand_teleport_<id>`).
- **Cast:** `GRAND_TELEPORT_CAST_TIME` seconds, out of combat, consumes one
  Rune of Passage (`RUNE_OF_PASSAGE_ITEM_ID`, vendor-bought at
  `RUNE_BUY_COPPER` and also a mage-only raid-boss roll). Opens a Grand Portal
  that stands for `GRAND_PORTAL_DURATION` seconds and admits only members of
  the mage's group at the moment of casting (`src/sim/party_gate.ts`).
- **Cooldown:** every Grand Teleport shares one `GRAND_TELEPORT_COOLDOWN`
  group (`src/sim/combat/ability_cooldown_groups.ts`).
- **Learn paths** (`src/sim/grand_teleport_learning.ts`): either read the
  destination's Tome of Passage (a mage-only drop off the raid bosses in
  `GRAND_TELEPORT_BOOK_BOSSES`, rolled by `src/sim/loot/loot_roll.ts` only
  when a mage is among the eligible recipients, personal to the mages), or
  clear every quest handed out in that city. Learning writes the synthetic
  questsDone key from `grandTeleportLearnKey` so the existing `requiresQuest`
  kit gate, persistence and wire mirror carry it with no new seam.

## The Hellgate (warlock)

- **Data:** `src/sim/content/hellgate.ts`. One ability (`hellgate`) and the
  three-quest pact that teaches it (`HELLGATE_QUEST_ORDER`: Apothecary Lin in
  Eastbrook, Scout Maren in Fenbridge, Loremaster Caddis in Highwatch,
  warlock-only).
- **Cast:** `HELLGATE_CAST_TIME` seconds, out of combat, `HELLGATE_COOLDOWN`
  cooldown. The gate stands for `HELLGATE_DURATION` seconds; clicking it while
  targeting a group member pulls that member to the gate
  (`src/sim/party_gate.ts`).
- **The toll:** while the gate stands the warlock bleeds `HELLGATE_BLEED_PCT`
  of maximum health every second and gains no natural health regen
  (`HELLGATE_BLEED_AURA_ID`, applied by the `selfDotPctMax` effect).
- **Learning:** completing `HELLGATE_FINAL_QUEST_ID` is the `requiresQuest`
  gate on the ability, so the whole pact must be walked.

## Content obligations carried by this feature

- **i18n:** ability rows in `src/ui/i18n.catalog/abilities.ts`, item rows in
  `src/ui/i18n.catalog/items.ts` (including the Waystone Ticket), the
  Waystone Keeper and quest ids in `src/ui/world_entity_i18n.ts`, and the
  non-Latin fills (M16) in the `src/ui/i18n.locales/` overlays.
- **Looks and voices:** one authored look per Waystone Keeper in
  `src/render/characters/npc_looks.ts`; each borrows a designed hub voice via
  `VOICE_ALIAS` in `scripts/voices/npc_voice_prompts.mjs` until its own voice
  is rendered.
- **Item art:** the `waystone_ticket` icon is a hand-authored SVG scene
  rendered by `scripts/render_travel_item_icons.mjs` (a parchment ticket
  stamped with a glowing rune-ring sigil), committed under
  `public/ui/items/waystone_ticket.webp` with its provenance row in
  `public/ui/items/mapping.json`.
- **Deeds:** `prog_hellgate_pact` (renown 10, keyed on the pact's final quest).
  Waystone attunement and Grand Teleport learning author no deed: attuning a
  stone writes no counter or visited mark, and the Grand Teleport learn key is
  a synthetic questsDone entry rather than a `QUESTS` id, so neither fits the
  closed trigger vocabulary.
- **Reliquary:** `horizons_tomes_of_passage`, the four tomes on the Horizons
  shelf flagged `personal` (the roll is mage-only, so the page sits outside
  completion like the Riftbound bands). Its slots carry no source hint and
  are recorded in `SOURCE_PENDING_RULING` because the drop is a separate
  per-boss roll table rather than a `MobTemplate.loot` row the boss-hint
  verifier can walk; growing the verifier an arm for
  `GRAND_TELEPORT_BOSS_ROLLS` is a maintainer decision.
- **Guide:** the world page's travel prose in `src/ui/i18n.catalog/guide.ts`
  names the three systems; `npm run wiki:content` regenerates the catalog.

## Pinned tests

`tests/waystones.test.ts`, `tests/waystone_fee.test.ts`,
`tests/waystone_tickets.test.ts`, `tests/waystone_view.test.ts`,
`tests/waystone_window_hud.test.ts`, `tests/grand_teleport_learning.test.ts`,
`tests/party_gate.test.ts`, `tests/ability_tooltip_consistency.test.ts`,
`tests/deeds_content.test.ts`, `tests/reliquary_content.test.ts`,
`tests/npc_looks.test.ts`, `tests/npc_voice_coverage.test.ts`,
`tests/item_icons.test.ts`, `tests/localization_coverage.test.ts`,
`tests/i18n_completeness.test.ts`, `tests/guide.test.ts`.
