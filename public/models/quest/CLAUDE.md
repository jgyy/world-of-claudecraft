<!-- public/models/quest/: unique quest-object GLBs (sigils, grimoire, ward stone, etc).
     Area-scoped notes only; public/models/CLAUDE.md covers shared rules
     (compression, texture-size, source-pack policy). Don't duplicate it. -->

# public/models/quest/

10 unique, hero-scale quest-object models (bastion ward stone, gravecaller
sigil, gravewyrm sigil, lost caravan goods, morthen grimoire, ogre war totem,
rusted censer, sanctum key shard, supply crate, weathered ledger page). Each is
a one-off tied to a specific quest, never instanced/repeated the way
`biome/`/`dungeon/`/`foliage/` pieces are.

## Size convention

- **Budget: up to ~550 KB per file** (avg ~282 KB, max 548 KB for
  `rusted_censer.glb`): the second-highest per-file budget after `chars/`. A
  quest object is a single instance the player interacts with directly and
  often examines up close, so a richer texture set is justified here in a way
  it isn't for a tiled/instanced category.
- Still meshopt + WebP; 1024px textures are reasonable, 2048px only if the
  object is genuinely a hero centerpiece (matching the `chars/` convention, not
  the norm).
