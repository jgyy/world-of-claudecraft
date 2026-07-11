<!-- public/models/foliage/: static nature GLBs (trees, bushes, rocks, mushrooms).
     Area-scoped notes only; public/models/CLAUDE.md covers shared rules
     (compression, texture-size, source-pack policy). Don't duplicate it. -->

# public/models/foliage/

23 static nature models (trees, bushes, rocks, mushrooms, grass clumps) from the
Quaternius Stylized Nature MegaKit. Densely instanced across every outdoor zone
(the renderer batches these into `InstancedMesh` per material/z-band, see
`src/render/props.ts`), so per-file size matters more here than the raw count
suggests.

## Size convention

- **Budget: under ~250 KB per file** (avg ~117 KB, max 236 KB). Kept low
  deliberately: a single tree or rock model is instanced hundreds of times
  across a zone, so its cost multiplies.
- Usually single-material, single-texture (foliage cards / simple bark texture);
  no need for the multi-texture PBR set (baseColor/normal/ORM) that a hero prop
  or character gets. Meshopt + WebP as usual, 512px textures are plenty.
