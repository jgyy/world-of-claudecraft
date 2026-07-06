# The Sunken Road: a deep tunnel between Eastbrook and Fenbridge

## Context

Branch `fix/terrain-aware-water-1518` was tracking issue #1518 ("water
level is a single absolute height per zone, not terrain/feature-aware").
That issue is already fixed and merged into `release/v0.22.0` (commits
`055721ce4`, `db57c94bf`, `da6d67813`, `61a3533b2`, `5e6c7c44f`), which this
branch has since merged in. There is nothing left to "fix" on this branch.

PR #1509 (Glimmervein Cavern) hit the water-flatness limit directly: its
sunken trench had to stay at `GLIMMERVEIN_FLOOR_Y = -3.8` (barely below the
old flat `WATER_LEVEL = -4.5`) or it would either flood or become
unwalkable, and it was placed off to the zone's west side as a flavor POI,
not a real route between the two towns.

This spec repurposes the branch: build a new, genuinely deep underground
tunnel directly connecting Zone 1's town (Eastbrook, hub at `x=0, z=0`,
radius 26) to Zone 2's town (Fenbridge, hub at `x=0, z=300`, radius 20),
now that terrain-aware water removes the old shallow-floor constraint.

## Goals

- A real, seamless overworld traversal shortcut between the two towns
  (not an instanced dungeon, no loading screen), usable at any level with
  no gate.
- Meaningfully deep: a consistent floor around **-13 to -15**, clearly
  underground, unlike Glimmervein's -3.8.
- Full dungeon-style content along the route: 2-3 new mob types bridging
  Zone 1's top level (7) and Zone 2's entry band (6-8), placed in 3-4
  `CampDef` camps, plus ore veins and a junk item, plus one lone named
  elite partway through.
- One short standalone quest ("clear/scout the tunnel") offered by an NPC
  near one town mouth. Not a gate, not a multi-part chain: a single reason
  to visit once.
- Named **"The Sunken Road"**: an old miners' route between the two towns,
  abandoned and reclaimed by wildlife (fits the ore-vein/crystal-cluster
  dressing precedent from Glimmervein).

## Non-goals

- Not an instanced mini-zone or dungeon (ruled out as Approach B during
  design: too much scope for a fast-travel shortcut).
- Not a replacement for the existing Zone 2 causeway
  (`ZONE2_ROADS[0]`, Eastbrook -> Fenbridge along x~0): the Sunken Road is
  an alternate underground route, not a rework of the surface road.
- Not a rework of Glimmervein Cavern (PR #1509): that content stays as-is,
  on the west side.
- No new instance/portal/loading-transition plumbing.

## Path and terrain

Same technique as Glimmervein Cavern: a chain of overlapping `'smooth'`
falloff `HeightStamp`s pulling the ground down to a fixed floor, each
waypoint's own concave slope acting as the wall (no wall/ceiling/pillar
geometry). New waypoint table in `src/sim/data.ts`, e.g.
`SUNKEN_ROAD_WAYPOINTS`.

- **Lateral band:** winds between roughly `x=+25` and `x=+75` as `z` runs
  `0 -> 300`. This stays clear of the surface causeway (which hugs `x~0` to
  `x~-8`) and clear of the existing `mire_widow` camps at
  `(70, 300)` / `(95, 340)`, which sit at or past the tunnel's z=300
  endpoint.
- **Mouths:** zone1 mouth near `(20, 15)`, just outside Eastbrook's hub
  radius (26). Zone2 mouth near `(20, 275)`, just outside Fenbridge's hub
  radius (20).
- **Ridge crossing:** around `z=180`, the same zone1/zone2 boundary
  crossing point Glimmervein Cavern already validated.
- **Depth:** consistent floor around -13 to -15 for the whole route (no
  vertical variation plan beyond the town-mouth ramps up to grade),
  verified against the terrain-aware water model so it neither floods nor
  becomes unwalkable, and against the movement climb limit so it stays
  walkable.

## Content

- 2-3 new mob types themed as tunnel-dwelling vermin/spiders (naming and
  exact stats TBD at implementation time, following the existing
  `MobTemplate` patterns in `zone1.ts`/`zone2.ts`), leveled to bridge
  Zone 1's top (7) and Zone 2's entry band (6-8).
- One lone named elite mob partway through the tunnel (near the ridge
  crossing), same pattern as Glimmervein's boss-lite placements
  (`mirejaw_the_ravenous`, `grubjaw`, etc.).
- 3-4 `CampDef` camps distributed along the route, reusing the existing
  camp-radius/count conventions.
- Reuse `src/render/cave_tunnel.ts` for crystal clusters and ore-vein
  dressing (extend if it needs a second waypoint table param, don't fork
  it).
- One junk item and one ore vein pair, following the `crystal_shard` /
  ore-vein precedent from Glimmervein.
- One short, standalone quest: "clear/scout the tunnel," offered by an NPC
  stationed at one town mouth (which town TBD at implementation, likely
  Eastbrook since that's the zone1 side). No prerequisite quest, no
  follow-up chain.

## i18n

Per `CLAUDE.md`: all new player-visible strings (zone/mob/item/quest names,
descriptions, quest text) are added to the English catalog only
(`src/ui/i18n.catalog/`), never hand-edited into locale overlays. Follow
the M16 rule for any new *wordy* English value (also needs its five
non-Latin fills in the same change).

## Testing

- `tests/architecture.test.ts` stays green (sim purity).
- Extend or add a terrain-walkability test in the style of
  `tests/terrain_walls.test.ts` / `tests/water_terrain_awareness.test.ts`:
  segment-by-segment walkability along the winding centerline, confirming
  no flooding and no unwalkable climb, plus the ridge-crossing boundary.
- `tests/localization_fixes.test.ts` (S3 i18n guard).
- `UPDATE_PARITY=1 npx vitest run tests/parity/parity.test.ts` for any new
  Entity/aura/mob fields.
- Fresh screenshots via a new `scripts/sunken_road_shot.mjs` (modeled on
  `scripts/glimmervein_cavern_shot.mjs`): approach, several interior shots,
  the ridge crossing, an ambient wide shot (surface should read as
  ordinary ground, not a visible valley), and both zones' HUD maps.

## Open questions for implementation time (not blocking this spec)

- Exact new mob names/stats and the elite's name/mechanics.
- Exact quest text and which NPC gives it.
- Exact `HeightStamp` waypoint count/spacing to achieve the winding shape
  within the x=25..75 band over z=0..300.
