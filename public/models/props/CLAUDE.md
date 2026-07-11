<!-- public/models/props/: static village/ruin decoration GLBs.
     Area-scoped notes only; public/models/CLAUDE.md covers shared rules
     (compression, texture-size, source-pack policy). Don't duplicate it. -->

# public/models/props/

51 static, non-rigged decoration models: village props (anvil, barrel, blacksmith,
well, market stand, weapon stand) from the Quaternius Fantasy Props / Medieval
Village packs, plus the Zone 2 ruin-ring set (`ruin_*.glb`, generated via the
Tripo `text_to_model` API, see `scripts/gen_ruin_assets.mjs`).

## Size convention

- **Budget: under ~250 KB per file.** The Quaternius/Kenney source-pack props run
  16-320 KB; the one outlier is `ruin_statue.glb` at 1.2 MB (the very first
  Tripo-generated prop in this dir, compressed before the 512px texture-size
  convention below was established — don't use it as a size template for new
  Tripo assets).
- **Tripo-generated props (`ruin_*.glb`):** compress with
  `gltf-transform optimize --compress meshopt --texture-compress webp
  --texture-size 512 --simplify-error 0.003`. This keeps a small background ruin
  prop in the 100-320 KB range (vs. Tripo's raw ~15 MB, near-lossless export).
  `ruin_statue.glb` predates this and should be recompressed to match next time
  it's touched, not treated as precedent for new assets.
- All props here are **decorative only** (no movement collider); see the
  `ruinDecor`/`statues` placement pattern in `src/render/props.ts` and
  `src/sim/types.ts` for how a new one-off prop is wired in.
