<!-- Area-scoped: src/ui/hud/loot_explorer/ only. src/ui/CLAUDE.md and
     src/ui/hud/CLAUDE.md stay canonical for the domain-extraction, painter,
     and i18n rules. -->

# src/ui/hud/loot_explorer/: the Loot Explorer window

A searchable, filterable catalog of every item the game can hand a player and
where it comes from, browsable either flat ("By Item", one row per item with
every source it drops from) or grouped ("By Encounter", one card per boss,
vendor, or rift rank listing everything it can pay). Pure view core
(`loot_explorer_view.ts`) + thin painter (`loot_explorer_window.ts`), the
deeds/reliquary/dungeon-finder family exactly.

## Static content only, deliberately
This is a content browser, not live world state: every input is a table
already bundled with the client, mirroring the maintainer-facing
`scripts/export_loot_spreadsheet.mjs`. Per the Dungeon Finder precedent
(`src/ui/dungeon_finder_view.ts`), it needs **no `IWorld`/`world_api` facet
member**. If a future "highlight items I already own" feature needs live
ownership, that alone would need a facet read; do not add one speculatively.

## Source taxonomy
`LootExplorerCategory` mirrors `ReliquarySourceKind` (`src/sim/content/reliquary.ts`)
where the two overlap, so the two systems speak the same vocabulary: `raid` /
`dungeon` classify off the Dungeon Finder's authored `FinderActivity.kind`
(`src/sim/content/dungeon_finder.ts`), never derived from spawn lists;
`delve` off each `DelveDef.bosses` list; `open_world` is the fallback for any
looted mob in neither; `rift` reads the two rank pool functions in
`src/sim/rift/loot_pools.ts` (C = normal pool, B/A/S share the heroic pool).
Normal/heroic difficulty rows mirror the roller's own gate
(`src/sim/loot/loot_difficulty_gate.ts` `lootEntryRollsOnClaim`) so a row here
never advertises a drop the kill cannot actually roll.

## Known scope gaps (documented, not silent)
- Delve trash loot and per-tier `DelveRewardTable` payouts are not
  catalogued, only authored boss drops (`DelveDef.bosses`): delve trash is
  procedurally selected per run, not statically placed, so an exhaustive
  table would drift from what a run actually offers. In today's content both
  delve bosses (`deacon_varric`, `sister_nhalia_drowned_canticle`) drop only
  copper, no `itemId`, so the `delve` category currently catalogues nothing;
  the classification (`buildMobToDelve`) is still correct and will surface a
  row the day either boss's `loot` table gains an item entry.
- The rift legendary chase items (`RIFT_LEGENDARY_ITEM_IDS`,
  `src/sim/content/rift/items.ts`) are not catalogued: their acquisition
  route was not confirmed as a simple chance roll during authoring, so
  asserting one here would risk telling a player something untrue.
