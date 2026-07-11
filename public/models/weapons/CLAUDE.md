<!-- public/models/weapons/: static weapon/shield GLBs.
     Area-scoped notes only; public/models/CLAUDE.md covers shared rules
     (compression, texture-size, source-pack policy). Don't duplicate it. -->

# public/models/weapons/

55 static weapon/shield models (swords, staves, bows, daggers, shields) from the
KayKit Character Pack Adventures/Skeletons weapon sets. Equipped and visible in
first/third-person and on the character paperdoll, so kept a bit larger than the
tiny `tools/`/`resources/` categories but still a static prop.

## Size convention

- **Budget: under ~100 KB per file** (avg ~38 KB, max 96 KB for `staff_d.glb`).
  Meshopt + WebP; 512-1024px textures — a weapon is often held close to camera,
  so don't go as low as `tools/`/`resources/`, but it never needs `chars/`-tier
  resolution either.
