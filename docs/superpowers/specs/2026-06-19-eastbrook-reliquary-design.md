# The Eastbrook Reliquary — design

A new 10-quest archaeology/relic-recovery chain for Zone 1 (Eastbrook Vale),
given by a new NPC, the Antiquarian. Distinct in narrative theme from all prior
quest chains (fortification, angling, mining, harvest-feast, cartography,
bounty, culling, muster, glade-warden).

## Goals / constraints
- **Determinism-safe:** reuse only EXISTING camped Zone 1 mobs. No new mobs, no
  new camps → no world-gen RNG shift → seed-fixed combat tests stay green.
- **No item-i18n:** rewards are XP + copper only. No new item names → no 13-locale
  burden. Quest/NPC English text auto-fills at PR tier (`pending` locales allowed).
- **One new NPC** (`antiquarian_veska`) placed near Eastbrook town, clear of every
  spawn camp radius.

## New NPC
`antiquarian_veska` — "Antiquarian Veska", title "Vale Antiquarian". Placed at a
free spot near town (`{ x: 8, z: 8 }`), away from all camp centers. `questIds`
lists the 10 quests in chain order.

## Quests (all `type: 'kill'`, linearly chained via `requiresQuest`)
| id | name | mob | count |
|---|---|---|---|
| q_relic_dust | Dust of Ages | restless_bones | 8 |
| q_relic_robbers | Grave-Robbers of the Vale | vale_bandit | 10 |
| q_relic_tunnels | Below the Old Dig | tunnel_rat | 12 |
| q_relic_web | The Cobwebbed Reliquary | webwood_spider | 10 |
| q_relic_matriarch | Keeper of the Web | sableweb_matriarch | 1 |
| q_relic_drowned | Drowned Antiquities | mudfin_murloc | 10 |
| q_relic_field | The Rooted Field | wild_boar | 10 |
| q_relic_custodian | The Hollow Custodian | captain_verlan | 1 |
| q_relic_gorrak | Gorrak's Plunder | gorrak | 1 |
| q_relic_looterking | The Looter-King | mogger | 1 |

All mobs verified present in `ZONE1_CAMPS`. Rewards scale with the zone's [1,7]
band: XP 450→1100, copper 180→500, capstones higher. `minLevel: 5` on the opener.

## i18n
Register the new NPC id in `NPC_IDS` and the 10 quest ids in `QUEST_IDS` in
`src/ui/world_entity_i18n.ts`; regenerate the resolved table + hash. English-only
is legal at PR tier.

## Verification
- `npx vitest run` full suite green (no RNG/seed test breakage).
- Screenshot harness boots offline, talks to Veska, opens the quest log.
