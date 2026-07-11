<!-- public/models/tools/: static tool GLBs (hammer, pickaxe, fishing rod, lockpicks, etc).
     Area-scoped notes only; public/models/CLAUDE.md covers shared rules
     (compression, texture-size, source-pack policy). Don't duplicate it. -->

# public/models/tools/

69 static, tiny profession-tool models (hammer, pickaxe, fishing rod, lockpicks,
and similar). Held/equipped items, viewed at the same small on-screen scale as
`resources/` and `weapons/`.

## Size convention

- **Budget: under ~50 KB per file** (avg ~16 KB, max 48 KB) — the smallest
  average in `models/`. Meshopt + WebP; 256-512px textures.
