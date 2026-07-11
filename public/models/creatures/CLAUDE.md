<!-- public/models/creatures/: rigged + animated non-humanoid mob GLBs.
     Area-scoped notes only; public/models/CLAUDE.md covers shared rules
     (compression, texture-size, source-pack policy). Don't duplicate it. -->

# public/models/creatures/

29 rigged, animated creature models (wolf, bull, fox, stag, alpaca, spider, frog,
goblin, orc, yeti, giant, demon, ghost, dragon, and the Yumi event mobs), mostly
from the Quaternius creature packs on poly.pizza.

## Size convention

- **Budget: under ~500 KB per file** (avg ~189 KB, max 472 KB for
  `yumi_cat.glb`). Smaller than `chars/` because these are usually seen at combat
  range rather than filling the screen, but still animated, so don't go as low as
  the static-prop categories (`props/`, `foliage/`, `biome/`).
- Meshopt + WebP as usual; 512-1024px textures are normally enough (only a
  boss-tier or camera-focal creature would justify more).
