// Paint the Soul Key inventory icon (public/ui/items/soul_key.webp) from a
// project-authored vector master, the way render_island_item_icons.mjs paints
// the Proving Shore pair from their world models: no external image model in
// the loop, so the art is reproducible from this file alone.
//
// Follows docs/design/item-icon-art-style.md (woc-item-icon-v1): one centered
// tangible subject on an opaque dark painted ground, warm top-left key light,
// cool bottom-right shadow, safe margins, readable at 22px and in a circular
// crop. The 512px master lands beside the provenance record under
// docs/achievements/soul-key-icon-2026-09-07/ and the 128px WebP ships with
// the same encode the intake converter uses (q82, alphaQuality 100,
// smartSubsample, effort 6, hard cap 15 KiB).
//
//   node scripts/render_soul_key_icon.mjs

import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const MASTER = 512;
const SHIP = 128;
const MAX_BYTES = 15 * 1024;
const OUT_WEBP = path.resolve('public/ui/items/soul_key.webp');
const RECORD_DIR = path.resolve('docs/achievements/soul-key-icon-2026-09-07');

// The key: an old iron skeleton key whose bow is a ring of bone-white
// filigree cradling a soul-blue gem, with a faint cold glow bleeding onto the
// ground. Drawn on a diagonal (tip bottom-left, bow top-right) so the
// silhouette reads inside a circle.
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${MASTER}" height="${MASTER}" viewBox="0 0 512 512">
  <defs>
    <radialGradient id="ground" cx="42%" cy="38%" r="75%">
      <stop offset="0" stop-color="#2b2431"/>
      <stop offset="0.55" stop-color="#171320"/>
      <stop offset="1" stop-color="#0a0810"/>
    </radialGradient>
    <radialGradient id="glow" cx="50%" cy="50%" r="50%">
      <stop offset="0" stop-color="#7fd7ff" stop-opacity="0.55"/>
      <stop offset="0.5" stop-color="#3f8fd6" stop-opacity="0.18"/>
      <stop offset="1" stop-color="#3f8fd6" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="iron" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#9a9aa6"/>
      <stop offset="0.45" stop-color="#5b5b68"/>
      <stop offset="1" stop-color="#26262f"/>
    </linearGradient>
    <linearGradient id="ironEdge" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#d8d8e2"/>
      <stop offset="1" stop-color="#6b6b78"/>
    </linearGradient>
    <linearGradient id="bone" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#f1e9d2"/>
      <stop offset="0.5" stop-color="#c9bc99"/>
      <stop offset="1" stop-color="#7c7157"/>
    </linearGradient>
    <radialGradient id="gem" cx="38%" cy="32%" r="70%">
      <stop offset="0" stop-color="#e8fbff"/>
      <stop offset="0.25" stop-color="#8fe3ff"/>
      <stop offset="0.7" stop-color="#2f7fd0"/>
      <stop offset="1" stop-color="#123a6e"/>
    </radialGradient>
    <filter id="soft" x="-30%" y="-30%" width="160%" height="160%">
      <feGaussianBlur stdDeviation="6"/>
    </filter>
    <filter id="shadow" x="-30%" y="-30%" width="160%" height="160%">
      <feGaussianBlur stdDeviation="9"/>
    </filter>
  </defs>
  <rect width="512" height="512" fill="url(#ground)"/>
  <ellipse cx="300" cy="200" rx="150" ry="150" fill="url(#glow)"/>
  <g transform="rotate(-42 256 256)">
    <g transform="translate(18 26)" opacity="0.55" filter="url(#shadow)">
      <rect x="150" y="238" width="250" height="34" rx="8" fill="#000"/>
      <circle cx="140" cy="255" r="78" fill="#000"/>
      <rect x="326" y="270" width="26" height="42" fill="#000"/>
      <rect x="368" y="270" width="26" height="60" fill="#000"/>
    </g>
    <rect x="150" y="238" width="250" height="34" rx="8" fill="url(#iron)" stroke="#15151b" stroke-width="3"/>
    <rect x="156" y="243" width="238" height="7" rx="3" fill="url(#ironEdge)" opacity="0.8"/>
    <rect x="326" y="270" width="26" height="42" rx="3" fill="url(#iron)" stroke="#15151b" stroke-width="3"/>
    <rect x="368" y="270" width="26" height="60" rx="3" fill="url(#iron)" stroke="#15151b" stroke-width="3"/>
    <rect x="330" y="272" width="8" height="34" fill="url(#ironEdge)" opacity="0.7"/>
    <rect x="372" y="272" width="8" height="52" fill="url(#ironEdge)" opacity="0.7"/>
    <rect x="216" y="228" width="22" height="54" rx="5" fill="url(#iron)" stroke="#15151b" stroke-width="3"/>
    <circle cx="140" cy="255" r="78" fill="none" stroke="#15151b" stroke-width="30"/>
    <circle cx="140" cy="255" r="78" fill="none" stroke="url(#bone)" stroke-width="22"/>
    <circle cx="140" cy="255" r="88" fill="none" stroke="url(#ironEdge)" stroke-width="3" opacity="0.6"/>
    <g fill="url(#bone)" stroke="#15151b" stroke-width="3">
      <path d="M140 160 l14 22 -14 12 -14 -12z"/>
      <path d="M140 350 l14 -22 -14 -12 -14 12z"/>
      <path d="M45 255 l22 -14 12 14 -12 14z"/>
    </g>
    <circle cx="140" cy="255" r="38" fill="url(#gem)" filter="url(#soft)" opacity="0.9"/>
    <circle cx="140" cy="255" r="34" fill="url(#gem)" stroke="#0d2a4d" stroke-width="3"/>
    <ellipse cx="128" cy="242" rx="10" ry="6" fill="#ffffff" opacity="0.85"/>
    <path d="M118 262 q22 26 44 0" fill="none" stroke="#dff6ff" stroke-width="3" opacity="0.5"/>
  </g>
</svg>`;

mkdirSync(RECORD_DIR, { recursive: true });
const master = await sharp(Buffer.from(svg)).png().toBuffer();
writeFileSync(path.join(RECORD_DIR, 'soul_key.master.png'), master);
let quality = 82;
let webp = await encode(master, quality);
if (webp.length > MAX_BYTES) {
  quality = 75;
  webp = await encode(master, quality);
}
if (webp.length > MAX_BYTES)
  throw new Error(`soul_key.webp is ${webp.length} bytes, over the 15 KiB cap`);
writeFileSync(OUT_WEBP, webp);
console.log(`wrote ${OUT_WEBP} (${webp.length} bytes, q${quality})`);

async function encode(png, q) {
  return sharp(png)
    .resize(SHIP, SHIP, { fit: 'cover' })
    .flatten({ background: '#0a0810' })
    .webp({ quality: q, alphaQuality: 100, smartSubsample: true, effort: 6 })
    .toBuffer();
}
