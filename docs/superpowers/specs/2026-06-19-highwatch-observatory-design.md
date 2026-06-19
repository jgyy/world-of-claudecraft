# The Highwatch Observatory — a 10-quest star-charting chain

## Summary
A new 10-quest chain for **Zone 3 (Thornpeak Heights, levels 13–20)** given by a
new NPC, **Astronomer Veyra**, Keeper of the Highwatch Observatory. A wyrm-star
is rising over the Gravewyrm Sanctum; Veyra is the only one on the wall who can
read what it portends — but the peaks keep ruining her night sky. Each quest
clears a different source of light, noise, or disturbance so she can take clean
plates, and the survey slowly reveals that the "star" is a thing *falling* toward
the peaks and waking the dead. The chain ties the astronomy framing directly into
the existing Wyrmcult / Nythraxis arc without touching it.

## Why this is a non-duplicate, low-risk addition
- **Fresh theme.** Astronomy / star-charting is distinct from every prior content
  chain (muster, mining, fortification, stormtable cooking, cartography, relics,
  bounty, falconry, beekeeping, salt, courier, etc.). Distinctness here is by
  giver + narrative theme, since all three zones are quest-saturated.
- **Zero new RNG.** Every objective is a `kill` on a mob that is *already camped*
  in `ZONE3_CAMPS` (`ridge_stalker`, `deeprock_kobold`, `old_cragmaw`,
  `stormcrag_elemental`, `shardlord_kazzix`, `thornpeak_ogre`, `ogre_crusher`,
  `brutok_skullsmasher`, `wyrmcult_zealot`, `boneclad_revenant`). No new mobs, no
  new camps, no new spawns → world-gen RNG is untouched and seed-fixed combat
  tests stay green.
- **No item-i18n.** Rewards are XP + copper only (`itemRewards: {}`), so there are
  no new item names to translate — only the quest/NPC text, which auto English-fills
  and is legal English-only at the PR tier.

## The chain
1. **A Clear Horizon** — Ridge Stalker ×12 (ridge noise ruins her plates).
2. **Light in the Burrows** — Deeprock Tunneler ×12 (kobold head-candles fog the west).
3. **The Tripod-Breaker** — Old Cragmaw ×1 (rare beast that wrecked her glass). *Req #1.*
4. **Glare off the Crags** — Stormcrag Elemental ×10 (lightning whites out the sky). *Req #2.*
5. **The Living Lantern** — Shardlord Kazzix ×1 (named elemental; group). *Req #4.*
6. **Bonfires on the Foothills** — Thornpeak Ogre ×12 (war-fires drown the east). *Req #1.*
7. **Stokers of the Pyres** — Thornpeak Crusher ×8 (elites feeding the pyres; group). *Req #6.*
8. **The Beacon-Bull** — Brutok Skullsmasher ×1 (rare ogre's signal-pyre). *Req #7.*
9. **They Watch It Too** — Wyrmcult Zealot ×12 (the cult charts the same star). *Req #4.*
10. **Under the Wyrm-Star** — Boneclad Revenant ×10 (capstone; the dead wake under it; group). *Req #9.*

Levels and `requiresQuest` gates follow the zone's natural L13→L19 difficulty
gradient; no balance numbers were invented.

## Files touched
- `src/sim/content/zone3.ts` — new NPC `astronomer_veyra`, 10 quests, QUEST_ORDER entries.
- `src/ui/world_entity_i18n.ts` — register `astronomer_veyra` + 10 quest ids.
- Regenerated: `i18n.resolved.generated.ts`, `i18n.status.json`, `i18n.resolved.sha256`
  (via `i18n:build` / `i18n:scan` / `i18n:hash --write`).
- `scripts/observatory_quest_shot.mjs` — puppeteer screenshot harness.

## Verification
- `npx vitest run` — full suite **1985 passed** (9 skipped), matching baseline.
- `tsc --noEmit` clean; S3 i18n guard (`localization_fixes.test.ts`) green.
- Screenshots of the quest log, capstone detail pane, and Veyra's gossip dialog
  captured via the harness for the PR.
