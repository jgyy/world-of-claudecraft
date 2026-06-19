# The Mirefen Saltern — 10-quest content chain

**Date:** 2026-06-19 · **Branch:** feature/mirefen-saltern · **Target:** upstream/release/v0.10.0

## Goal
Add a fresh, non-duplicate 10-quest chain to the Mirefen Marsh (zone2) on a brand-new
NPC, the saltmaster of the brine pans (salt-harvesting theme — unused vs the ~22 open
content PRs).

## Design (constraints satisfied)
- **Zero new RNG:** all objectives are `kill` on *already-camped* zone2 mobs. No new
  mobs, camps, or spawns ⇒ world-gen RNG draw order is unchanged ⇒ seed-fixed combat
  tests stay green.
- **Zero item-i18n:** rewards are copper + XP only. No new items, so no
  `entities.items.*` overlays / coverage burden. All-kill (no collect items).
- **i18n surface:** 1 new NPC (`saltmaster_calla`) + 10 new quest ids registered in
  `src/ui/world_entity_i18n.ts` (NPC_IDS, QUEST_IDS). English-only is legal at PR tier;
  the build English-fills the 13 locale overlays and marks them `pending`.

## The chain (giver/turn-in = saltmaster_calla)
1. q_saltern_pansward — kill mire_prowler×10 (minLevel 6)
2. q_saltern_foulpans — kill bog_bloat×8
3. q_saltern_snappers — kill deepfen_murloc×12 (requires 1)
4. q_saltern_webs — kill mire_widow×10
5. q_saltern_panbreaker — kill grubjaw×1 rare (requires 3, minLevel 7)
6. q_saltern_drowned — kill drowned_dead×12 (requires 3)
7. q_saltern_reedburners — kill fen_troll×10 (requires 6)
8. q_saltern_cursers — kill gravecaller_cultist×12 (minLevel 8)
9. q_saltern_menders — kill gravecaller_mender×8 (requires 8)
10. q_saltern_brinedevil — kill mirejaw_the_ravenous×1 rare capstone (requires 9, minLevel 9)

## Files touched
- `src/sim/content/zone2.ts` — new NPC, 10 quests, QUEST_ORDER entries.
- `src/ui/world_entity_i18n.ts` — register `saltmaster_calla` + 10 quest ids.
- Regenerated: `i18n.resolved.generated.ts`, `i18n.status.json` (via i18n:build/scan/hash).

## Verification
- `npx vitest run` full suite green (target ~1985 pass).
- Screenshot of the saltmaster quest dialog via a puppeteer harness for the PR.
