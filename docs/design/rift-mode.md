# Rift Mode architecture

Rift Mode is a shared overworld race whose dungeon runtime remains isolated per
group. A natural portal owns one `RiftEvent`; each solo player or party entering
that event owns a separate `RiftInstance`. Instances share only the immutable
content artifact and the event's atomic first-clear claim.

## Runtime flow

1. `rift/portals.ts` keeps one deterministic C/B/A/S portal open in EVERY
   eligible new-world zone, cycling hourly (a zone's next portal opens one
   cycle after the previous one opened).
2. The existing procedural generator creates the draft and remains authoritative
   for layouts, colliders, mechanics, and safe spawn points.
3. `rift/upgrader_draft.ts` immediately builds a validated heuristic upgrade. The
   live realm may replace it with an AI result before anybody enters.
4. Entry freezes the artifact (`contentLocked`) and allocates one independent
   instance per group. Every competing instance receives the same artifact hash.
5. `rift/race.ts` performs the single-threaded check-and-write first-clear claim.
   The winner receives the race rewards; every other instance keeps running and
   completes as the race loser when its own boss falls, with an egress but NO
   completion loot (no gear ladder, no sealed cache, no first-clear extras): a
   loser keeps only what dropped off the mobs. The first mob kill marks an
   instance PROGRESSED, which binds its members to it WoW-raid style; unspoiled
   instances recycle when their members regroup, so a freshly formed party
   shares one clean run.
6. `rift/persistence.ts` saves portal deadlines, event history, winner metadata,
   scheduler state, and upgrade artifacts. Runtime party instances are never
   restored after a realm restart.

## AI Dungeon Upgrader

The server integration is optional and disabled unless configured. Model output
is untrusted data: `rift/upgrade.ts` rebuilds a bounded manifest and rejects unknown
themes, invented monster IDs, incompatible rosters/bosses, arbitrary stats,
executable content, excessive prose, and excess asset requests. Invalid, timed-out,
over-budget, or late responses leave the deterministic heuristic artifact in use.

The dedicated-service configuration is:

- `RIFT_UPGRADER_URL`
- `RIFT_UPGRADER_API_KEY` (optional when the service uses network identity)
- `RIFT_UPGRADER_TIMEOUT_MS` (2-60 seconds, default 20 seconds)
- `RIFT_UPGRADER_MAX_REQUESTS_PER_HOUR` (1-24, default 4)

Direct OpenAI Responses API mode is selected only when both are present:

- `OPENAI_API_KEY`
- `RIFT_UPGRADER_MODEL`

`RIFT_UPGRADER_OPENAI_URL` may override the official Responses endpoint. Secrets
remain server-side and are never emitted, persisted in Rift state, or sent to a
client.

## Rank difficulty

Rank (C/B/A/S) is the ONLY difficulty axis: a rift never scales with party size,
and mob levels are capped at 22 (23 at S), so all four ranks differ purely
through the spawn-time stat transform in `rift/ranks.ts`, the rank mechanic
budget (C=1 .. S=4 of a boss's `rankMechanics` kit), and the hazard gate.
Rifts are group content at every rank including C.

The ladder is calibrated onto the v0.30 dungeon ladder: C is a normal dungeon
(normal Gravewyrm Sanctum's own line), B is the heroic five-man line at 1.0x, A
is 1.2x heroic, S is 1.33x heroic. Health and damage are split by mob class
(spawn-list trash, boss, boss-summoned add), because one multiplier per rank
cannot serve two classes at once. The full derivation, the Monte Carlo benches,
the decision ledger, and pre-measured fallback options are in
[../rift-rank-monte-carlo-analysis.md](../rift-rank-monte-carlo-analysis.md);
every tuning literal and floor is pinned by
`tests/rift_difficulty_floors.test.ts`. Re-run the benches with
`npm run sim:rift`.

Note that only SPAWN-LIST templates (`RIFT_TRASH_IDS`) may be substituted into a
floor roster by an upgrade manifest. The shared summoned-add templates are
non-boss and appear in the bone, void and citadel theme rosters, but they are
non-elite and carry no loot table, so `applyRiftUpgrade` filters them out.

## Monster and asset safety

`content/rift/monster_index.ts` indexes every static Rift `MobTemplate` by role,
rarity, family, mechanics, lore, theme, biome, and stat profile. The upgrader may
compose encounters from this index, but combat always resolves through static
templates in `MOBS`.

Runtime asset generation is separately opt-in:

- `RIFT_RUNTIME_ASSETS=1`
- `RIFT_ASSET_PIPELINE_URL`
- `RIFT_ASSET_PIPELINE_API_KEY` (optional)
- `RIFT_ASSET_TIMEOUT_MS`
- `RIFT_ASSET_MAX_REQUESTS_PER_EVENT` (1-2, default 1)

The bridge submits bounded GLB jobs and records only an opaque job ID. A generated
binary is not hot-loaded into a live race. It must first pass QA and be promoted to
the immutable asset manifest, preserving graphics fairness, cacheability, and the
rule that no untrusted remote URL enters entity wire data.

## Progression

First-clear loot includes class-appropriate non-fungible Rift gear, Rift Essence,
and rank-dependent gems. Item payloads track source event, tier, power, upgrades,
enchantment, sockets, and gems. Their rolled stats apply while equipped, survive
save/load and wire round-trips, and are rebuilt from bounded inputs at load rather
than trusted from JSONB. Gear can be upgraded, enchanted, socketed, unequipped
without losing its payload, or salvaged back into power-scaled Rift Essence.

Rift Essence and the rank-dependent gems are plain, freely tradeable forge
currency: tradeable in person, mailable, and listable on the World Market and the
guild bank, like any other crafting material. This is deliberate, not an
oversight: unlike the three first-clear Riftbound rings (owner-bound personal
reward gear, `RIFT_GEAR_ITEM_IDS`), the currency is boss loot bound by the
ranked portal spawn cadence, never a re-grantable faucet, so closing its market
and mail routes (the way a re-grantable faucet or a store SKU is closed
elsewhere in the item catalog) has no exploit to guard against.

The forge (upgrade, enchant, socket) is an NPC service: Riftwright Maelis
(`riftForge: true` in `content/farshore.ts`, Gullhaven's Watch Meadow) opens the
Rift Forge window (`src/ui/hud/rift_forge/`, a pure view-core plus a thin
window on the guild-board shape) through the structured `riftForge` interact
event, the bank precedent. The place rule lives in the sim
(`rift/forge_gate.ts`, `nearRiftForge`): all three forge operations refuse away
from a riftForge NPC with the shared "too far from the Rift Forge" error line
(returned as reason `too_far`, never emitted as a `riftForgeResult`, the `dead`
contract), so the offline world, the headless env, and the authoritative server
enforce it identically. Only bagged bands are forgeable (the sim resolves the
target through the inventory); the window lists a worn band with an unequip
hint.

The server's `RIFT_FORGE_ENABLED` gate (`server/rift_forge_gate.ts`, pinned by
`tests/rift_forge_gate.test.ts`) is now an ops kill switch rather than an
opt-in: exactly `0` closes the three wire commands, anything else (including
unset) keeps them open. The three dispatch arms (`server/rift_forge_dispatch.ts`)
answer the `commandOutcome` ack with the sim verdict, and the client sends
them through `cmdWithOutcome`, so a closed realm or a sim refusal always
surfaces as a visible status line in the window, never as silence. Each
refused-while-closed attempt still books the `woc_rift_forge_refused_total`
counter.
