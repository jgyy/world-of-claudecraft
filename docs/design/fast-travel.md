# Fast travel: the Grand Teleport and the Hellgate

Two class gates that carry a GROUP, both resolved by the one deterministic
sim. Neither replaces the road: there is no hub-to-hub fast travel of any
kind (no flight paths, no waystones, no taxis), by maintainer ruling on
#3932: players moving through the world is something the game protects. A
mount stays the free option for one traveller; these two spells exist for a
party that has already gathered.

Companion document: the Book of Deeds at `docs/design/deeds.md` owns the
cosmetic obligation this content authored.

## The Grand Teleport (mage)

- **Data:** `src/sim/content/grand_teleports.ts`. ONE destination, Highwatch
  in Thornpeak Heights, as one ordinary mage class spell
  (`grand_teleport_highwatch`) learned at `GRAND_TELEPORT_LEARN_LEVEL` like the
  rest of the kit: no tome, no quest unlock, no per-city variants. The
  destination table is a list so a second city is a data row, never a new
  code path.
- **Cast:** `GRAND_TELEPORT_CAST_TIME` seconds, out of combat, consumes one
  Rune of Passage (`RUNE_OF_PASSAGE_ITEM_ID`, vendor-bought at
  `RUNE_BUY_COPPER` from Trader Wilkes in Eastbrook and Provisioner Hale in
  Fenbridge).
  Opens a Grand Portal that stands for `GRAND_PORTAL_DURATION` seconds and
  admits only members of the mage's group at the moment of casting
  (`src/sim/party_gate.ts`); a member who steps through lands at the authored
  Highwatch landing through `displacePlayer`, so the arrival is settled like
  every other teleport.
- **Cooldown:** `GRAND_TELEPORT_COOLDOWN`, a plain per-ability cooldown.
- **Reagent seam:** `AbilityDef.reagent` (`src/sim/types.ts`). The cast
  refuses without the reagent in the bags, re-checks at completion (a rune
  sold mid-cast refuses instead of firing free), and removes it at the ONE
  spend site beside the resource cost (`combat/casting_lifecycle.ts`).

## The Hellgate (warlock)

- **Data:** `src/sim/content/hellgate.ts`. One ability (`hellgate`) and the
  three-quest pact that teaches it (`HELLGATE_QUEST_ORDER`: Apothecary Lin in
  Eastbrook, Scout Maren in Fenbridge, Loremaster Caddis in Highwatch,
  warlock-only).
- **Cast:** `HELLGATE_CAST_TIME` seconds, out of combat, `HELLGATE_COOLDOWN`
  cooldown. The gate stands for `HELLGATE_DURATION` seconds; clicking it while
  targeting a group member pulls that member to the gate
  (`src/sim/party_gate.ts`). Only the warlock who opened it can use it.
- **The toll:** while the gate stands the warlock bleeds `HELLGATE_BLEED_PCT`
  of maximum health every second and gains no natural health regen
  (`HELLGATE_BLEED_AURA_ID`, applied by the `selfDotPctMax` effect; the aura's
  `noRegen` flag is read by `combat/auras.ts` updateRegen). A self-sourced
  player dot is a plain hp toll: it never enters combat, never threatens, and
  floors at 1 hp, so the death path stays owned by real attackers. The toll
  ends with the gate (duration, the warlock's death, or a replacement gate).
- **Learning:** completing `HELLGATE_FINAL_QUEST_ID` is the `requiresQuest`
  gate on the ability, so the whole pact must be walked.

## The party gate seam

`src/sim/party_gate.ts` owns both summoned objects: `Entity.partyGate` (runtime
only, server side) records the owner, the party at cast time and the eligible
member ids; `rememberPartyGateEligibility` (called from the party machine on
every join) lets a late joiner use a standing gate; `updatePartyGates` runs
in the tick after despawn decay and ends a Hellgate (and its toll) when its
warlock dies; a Grand Portal deliberately outlives its mage, since the group it
was opened for keeps the exit until the timer lapses. A summon that finds no
footprint refunds the rune and clears the cooldown (`refundFailedSummon` in
`combat/effect_dispatch.ts`). The renderer draws both through
`src/render/summoned_objects.ts` (the Soulwell registry, one procedural prop
per `objectItemId`).

## Content obligations carried by this feature

- **i18n:** ability rows in `src/ui/i18n.catalog/abilities.ts`, the rune's
  item row in `src/ui/i18n.catalog/items.ts`, the pact quest ids in
  `src/ui/world_entity_i18n.ts`, and the sim refusals and log lines in
  `src/ui/sim_i18n.ts`.
- **Item and spell art:** the Rune of Passage icon and the Hellgate spell icon
  are hand-authored SVG scenes rendered by
  `scripts/render_travel_item_icons.mjs`, committed under
  `public/ui/items/rune_of_passage.webp` and
  `public/ui/skills/warlock/hellgate.webp` with provenance rows in each
  directory's `mapping.json`. The Grand Teleport uses a procedural icon recipe
  (`src/ui/icons.ts`).
- **Deeds:** `prog_hellgate_pact` (renown 10, keyed on the pact's final quest).
  The Grand Teleport authors no deed: it is an ordinary level-up spell.
- **Guide:** `npm run wiki:content` regenerates the class ability pages.

## Pinned tests

`tests/party_gate.test.ts`, `tests/summoned_object_visuals.test.ts`,
`tests/line_of_sight_gate.test.ts`, `tests/ability_tooltip_consistency.test.ts`,
`tests/deeds_content.test.ts`, `tests/item_icons.test.ts`,
`tests/ability_icons.test.ts`, `tests/localization_coverage.test.ts`,
`tests/i18n_completeness.test.ts`, `tests/guide.test.ts`.
