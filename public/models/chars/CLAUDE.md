<!-- public/models/chars/: rigged + animated player and enemy character GLBs.
     Area-scoped notes only; public/models/CLAUDE.md covers shared rules
     (compression, texture-size, source-pack policy). Don't duplicate it. -->

# public/models/chars/

17 rigged, animated character models: `players/` (9 playable classes, KayKit
Character Pack Adventures) and `enemies/` (7 skeleton variants + necromancer,
KayKit Character Pack Skeletons), plus `Mech/`. The largest category by average
file size in `models/` because every file carries a full animation set.

## Size convention

- **Budget: 300 KB - 2 MB per file** (avg ~1.2 MB, max 1.96 MB for
  `enemies/skeleton_minion.glb`). This is the one category where a texture above
  512-1024px and a denser mesh are justified: these are the largest, most
  camera-persistent models in the game (the player's own character, on screen
  for the whole session).
- Still meshopt + WebP (`public/models/CLAUDE.md`); don't drop compression just
  because the budget is higher here. Simplify tolerance should stay tighter than
  the background-prop convention (visible silhouette, animated, viewed up close).
- A new playable class or enemy variant needs its full animation set baked into
  the one `.glb` (see `scripts/combine_fbx_to_glb.mjs`, `scripts/CLAUDE.md`), not
  split across files: the loader expects one clip-bearing GLB per character.
