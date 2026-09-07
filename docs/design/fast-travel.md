# Fast travel: flight paths, Grand Teleports, and the Hellgate

Three ways to shorten a journey, each with a different owner and a different
price, all resolved by the one deterministic sim. None of them replaces the
road: a mount stays the fast option, the flight is the hands-off one, and the
two class gates carry a group rather than a single traveller.

Companion documents: the Book of Deeds at `docs/design/deeds.md` and the
Reliquary at `docs/design/reliquary.md` own the cosmetic obligations this
content authored.

## Flight paths (everyone)

- **Data:** `src/sim/content/flight_paths.ts` (`FLIGHT_NODES`, `FLIGHT_LINKS`,
  `FLIGHTMASTER_NPCS`, the fare, speed and height constants). One flightmaster
  per hub town, one persisted node id per town.
- **Ride:** `src/sim/flight_paths.ts`. A flight is a slow, hands-off ride along
  the hub graph at `FLIGHT_SPEED` (a fixed fraction of the base riding speed),
  carried `FLIGHT_HEIGHT` yards over the sampled ground. A mount is always
  faster; the flight is the AFK option.
- **Fare:** `FLIGHT_FARE_COPPER` per town hop along the shortest known route,
  charged on boarding. No cooldown.
- **Learning:** speaking to a town's flightmaster on foot records its node in
  `CharacterState.flightNodesKnown`. A flightmaster only offers flights to
  nodes the character already knows, so every path is walked once first.
- **Reserved-id spawn:** every flightmaster is a `dynamic` NpcDef spawned at
  world init on `FLIGHTMASTER_ENTITY_ID_BASE + <FLIGHT_NODES index>` (the
  Warfare Quartermaster precedent, `STATIC_WORLD_SERVICE_ENTITY_ID_MIN` in
  `src/sim/types.ts`). Adding a node therefore never shifts a sequential
  entity id or a parity golden. Append new nodes at the END of `FLIGHT_NODES`:
  the index is the id, and node ids follow the never-rename rule.
- **Client:** the flight window under `src/ui/hud/flight/`, reached from the
  flightmaster's gossip menu.

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
  `src/ui/i18n.catalog/items.ts`, the flightmaster and quest ids in
  `src/ui/world_entity_i18n.ts`, and the non-Latin fills (M16) in the
  `src/ui/i18n.locales/` overlays.
- **Looks and voices:** one authored look per flightmaster in
  `src/render/characters/npc_looks.ts`; each borrows a designed hub voice via
  `VOICE_ALIAS` in `scripts/voices/npc_voice_prompts.mjs` until its own voice
  is rendered.
- **Deeds:** `prog_hellgate_pact` (renown 10, keyed on the pact's final quest).
  Flights and Grand Teleport learning author no deed: a flight writes no
  counter or visited mark, and the learn key is a synthetic questsDone entry
  rather than a `QUESTS` id, so neither fits the closed trigger vocabulary.
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

`tests/flight_paths.test.ts`, `tests/flight_view.test.ts`,
`tests/flight_window_hud.test.ts`, `tests/grand_teleport_learning.test.ts`,
`tests/party_gate.test.ts`, `tests/ability_tooltip_consistency.test.ts`,
`tests/deeds_content.test.ts`, `tests/reliquary_content.test.ts`,
`tests/npc_looks.test.ts`, `tests/npc_voice_coverage.test.ts`,
`tests/localization_coverage.test.ts`, `tests/i18n_completeness.test.ts`,
`tests/guide.test.ts`.
