# Soul Key icon (2026-09-07)

One project-authored painting for the `soul_key` item (src/sim/soul_key.ts): an iron
skeleton key with a bone filigree bow cradling a soul-blue gem, drawn as an SVG master
and rendered with sharp by `scripts/render_soul_key_icon.mjs`. The 512px master
(`soul_key.master.png`) sits beside this note; the shipped 128px WebP is
`public/ui/items/soul_key.webp`, encoded with the intake converter's options
(q82, alphaQuality 100, smartSubsample, effort 6, 15 KiB cap).

Style contract: `woc-item-icon-v1` (docs/design/item-icon-art-style.md). Provenance:
the `soul-key-icon-2026-09-07` batch in `public/ui/items/mapping.json`.
