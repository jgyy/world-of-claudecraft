<!-- public/models/resources/: static resource/loot GLBs (ore, bars, gems, food, crates).
     Area-scoped notes only; public/models/CLAUDE.md covers shared rules
     (compression, texture-size, source-pack policy). Don't duplicate it. -->

# public/models/resources/

132 static, tiny models: gathering-node resources (ore, gems, herbs), crafted
bars, food/drink items, crates and containers. The largest file count in
`models/` and the smallest average size — these are held/dropped/carried items
seen in bags, on the ground, and in vendor/market UI, never filling much of the
screen.

## Size convention

- **Budget: under ~50 KB per file** (avg ~21 KB, max 80 KB). Keep these as small
  as `tools/`/`dungeon/`; a bloated resource model is wasted cost multiplied
  across every gather node and every player's bags.
- Meshopt + WebP; 256-512px textures are almost always enough for an item this
  small on screen.
