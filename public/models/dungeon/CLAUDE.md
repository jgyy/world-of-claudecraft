<!-- public/models/dungeon/: modular dungeon-kit GLBs (walls, pillars, doors, props).
     Area-scoped notes only; public/models/CLAUDE.md covers shared rules
     (compression, texture-size, source-pack policy). Don't duplicate it. -->

# public/models/dungeon/

379 static modular pieces (walls, floors, pillars, arches, torches, banners,
chests, traps, furniture, cobwebs, coin piles), the largest file count in
`models/` by a wide margin. Sourced from the KayKit Dungeon Remastered kit plus
several Quaternius/Kenney modular dungeon packs — see `CREDITS.md` for the full
list.

## Size convention

- **Budget: well under 50 KB per file** (avg ~17 KB). These are small, repeated,
  often-instanced kit pieces (the renderer batches repeated non-hideable kinds
  into `InstancedMesh`, see `src/render/props.ts`); a bloated modular piece
  multiplies its cost across every instance in every dungeon.
- The one outlier, `delve_entrance_2.glb` (788 KB), is a one-off animated portal
  marker, not a repeated kit piece — that's the shape of exception that's
  acceptable here (unique, not tiled), not a new baseline.
- Meshopt + WebP as usual; keep textures at 512-1024px, these are viewed at
  typical dungeon-corridor distance, not close up.
