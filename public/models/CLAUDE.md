<!-- public/models/: all committed .glb assets, by category subdirectory.
     Area-scoped notes only; public/CLAUDE.md and root CLAUDE.md cover the rest.
     Don't duplicate them. -->

# public/models/: GLB asset categories

Every subdirectory holds one content category, each with its own `CLAUDE.md` for
provenance and size convention specific to that category. This file is the index
and the shared rules that apply to all of them.

| Dir | Count | Avg size | Largest | Notes |
|---|---|---|---|---|
| `chars/` | 17 | ~1.2 MB | 1.96 MB (`skeleton_minion.glb`) | rigged + animated, by far the biggest category |
| `creatures/` | 29 | ~189 KB | 472 KB (`yumi_cat.glb`) | rigged + animated |
| `quest/` | 10 | ~282 KB | 548 KB (`rusted_censer.glb`) | one-off hero props, higher size budget |
| `props/` | 51 | ~117 KB | 1.2 MB (`ruin_statue.glb`, Tripo-generated) | static decoration |
| `foliage/` | 23 | ~117 KB | 236 KB | static, mostly single-material |
| `biome/` | 116 | ~36 KB | 108 KB | static, small modular kit pieces |
| `weapons/` | 55 | ~38 KB | 96 KB | static, held/equipped |
| `resources/` | 132 | ~21 KB | 80 KB | static, tiny (ore/gem/food/crate) |
| `dungeon/` | 379 | ~17 KB | 788 KB (`delve_entrance_2.glb`) | static modular kit, largest file count |
| `tools/` | 69 | ~16 KB | 48 KB | static, tiny |

## Shared rules (every category)

- **Format:** every `.glb` here is **meshopt-compressed** (`EXT_meshopt_compression`)
  with **WebP textures** (`EXT_texture_webp`). The runtime `GLTFLoader`
  (`src/render/assets/loader.ts`) only wires a `MeshoptDecoder`, no `DRACOLoader`:
  a draco-compressed GLB fails to parse at runtime with no build-time warning. Always
  compress with `gltf-transform optimize ... --compress meshopt --texture-compress webp`
  (`scripts/assets/build_assets.mjs` does this for the source packs; a one-off
  generated asset should do the same, see `props/CLAUDE.md`).
- **Texture size:** static/small decorative props don't need more than 512-1024px
  textures; only rigged hero-scale characters (`chars/`) or camera-close set pieces
  warrant 2048px. Tripo/Meshy/AI-generated raw exports default to near-lossless
  2048px textures and minimal simplification: always re-run `optimize` with
  `--texture-size 512` (or 1024) and a looser `--simplify-error` (e.g. `0.003`
  vs the default `0.0001`) for anything that isn't a hero asset; this alone is
  typically a 10-15x size cut with no visible loss at normal camera distance.
- **Source packs are not committed.** Only the shipped, optimized `.glb` is here;
  raw/source files (FBX, FBX+Blender, or a Tripo/Meshy raw download) never land in
  the repo, keep them in `tmp/` (gitignored) during a one-off generation.
- **Attribution:** any new pack or one-off model needs a row in `CREDITS.md`
  (source pack name, author, URL, license): CC0 for the existing packs;
  AI-generated assets (Tripo, Meshy) note the tool and prompt/generation date
  instead of an author/license row.
- **Registration:** a new `.glb` here is picked up automatically by
  `scripts/build_media_manifest.mjs` (walks `models/` into the content-hashed
  manifest) on the next `npm run build`: don't hand-edit
  `src/render/assets/manifest.generated.ts`.
- **Naming:** lowercase snake_case, descriptive (`ruin_wall_fragment.glb`, not
  `Prop_04.glb`), no spaces.
