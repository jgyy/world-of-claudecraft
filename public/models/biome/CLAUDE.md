<!-- public/models/biome/: static per-biome environment dressing GLBs (beach,
     camp, city, etc kit pieces). Area-scoped notes only; public/models/CLAUDE.md
     covers shared rules (compression, texture-size, source-pack policy).
     Don't duplicate it. -->

# public/models/biome/

116 static, small biome-dressing pieces, grouped by a `<biome>_<piece>.glb`
naming prefix (`beach_*`, `camp_*`, `city_*`, ...): docks, ships, chests, camp
bedrolls, cannons, rocks, small buildings. Sourced from the Quaternius Pirate
Kit, Kenney Survival/Watercraft/Modular Dungeon kits, and related packs.

## Size convention

- **Budget: under ~120 KB per file** (avg ~36 KB, max 108 KB). The largest
  category by file count after `dungeon/`; keep individual pieces small since
  a biome scene composes many of them at once.
- Follow the existing `<biome>_<piece>.glb` naming prefix for any new piece so
  it groups correctly by biome in a directory listing.
- Meshopt + WebP as usual; 512-1024px textures.
