// One-off: render the fast-travel art as project-owned icons: the Grand
// Teleport reagent (the Rune of Passage, src/sim/content/grand_teleports.ts)
// and the warlock Hellgate spell icon (src/sim/content/hellgate.ts,
// public/ui/skills/warlock). A sibling of render_island_item_icons.mjs, but
// with no world model to photograph: each icon is a hand-authored SVG scene (a
// glowing rune stone; a fel gate) that
// sharp rasterizes at the 512px master size the woc-item-icon-v1 style contract
// asks for, then downscales to the shipped 128px opaque WebP under the 15 KiB
// budget scripts/convert_item_icons_webp.mjs enforces. Outputs land in
// public/ui/items/ (and public/ui/skills/warlock/ for the spell) and are
// committed like any painted icon; provenance is the matching rows in that
// directory's mapping.json.
//
// Usage: node scripts/render_travel_item_icons.mjs

import { writeFileSync } from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const root = process.cwd();
const itemsDir = path.join(root, 'public', 'ui', 'items');
const warlockSkillsDir = path.join(root, 'public', 'ui', 'skills', 'warlock');
const MASTER_PX = 512;
const OUT_PX = 128;
const SIZE_CAP = 15 * 1024;
const WEBP = { quality: 82, alphaQuality: 100, smartSubsample: true, effort: 6 };

// The item-icon vignette: a soft radial glow over near-black, the shipped
// icon family's ground (same stops as render_island_item_icons.mjs).
const vignette = (tint) =>
  `<defs><radialGradient id="bg" cx="50%" cy="42%" r="62%"><stop offset="0%" stop-color="${tint}"/><stop offset="55%" stop-color="#211d15"/><stop offset="100%" stop-color="#0d0b08"/></radialGradient></defs><rect width="100%" height="100%" fill="url(#bg)"/>`;

const svgDoc = (body) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${MASTER_PX}" height="${MASTER_PX}" viewBox="0 0 512 512">${body}</svg>`;

function runeSvg() {
  return svgDoc(
    `${vignette('#24304a')}
<defs>
  <linearGradient id="stone" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#8d94a8"/><stop offset="45%" stop-color="#4a5064"/><stop offset="100%" stop-color="#15181f"/></linearGradient>
  <filter id="blur" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="16"/></filter>
  <filter id="soft" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="4"/></filter>
</defs>
<g transform="translate(256 268)">
  <ellipse cx="0" cy="148" rx="150" ry="30" fill="#000" opacity="0.55" filter="url(#blur)"/>
  <circle cx="0" cy="-10" r="150" fill="#5b7dff" opacity="0.28" filter="url(#blur)"/>
  <path d="M-118 -60 L -70 -164 L 60 -172 L 126 -84 L 112 96 L 20 156 L -104 118 L -140 20 Z" fill="url(#stone)" stroke="#0c0e14" stroke-width="6" stroke-linejoin="round"/>
  <path d="M-70 -164 L -48 -122 L 92 -128 L 60 -172 Z" fill="#a4abbd" opacity="0.5"/>
  <path d="M-104 118 L -78 76 L 96 84 L 20 156 Z" fill="#05070c" opacity="0.5"/>
  <g fill="none" stroke="#9fb6ff" stroke-width="20" stroke-linecap="round" stroke-linejoin="round" opacity="0.55" filter="url(#soft)">
    <path d="M-40 90 L -40 -100 L 44 -40 L -40 20 M-40 20 L 52 92"/>
    <path d="M-92 -20 L -60 -20 M 70 -108 L 96 -80"/>
  </g>
  <g fill="none" stroke="#eaf1ff" stroke-width="10" stroke-linecap="round" stroke-linejoin="round">
    <path d="M-40 90 L -40 -100 L 44 -40 L -40 20 M-40 20 L 52 92"/>
    <path d="M-92 -20 L -60 -20 M 70 -108 L 96 -80"/>
  </g>
  <g fill="#cfe0ff" opacity="0.9">
    <circle cx="-150" cy="-70" r="5"/><circle cx="150" cy="-20" r="4"/><circle cx="120" cy="140" r="5"/><circle cx="-124" cy="150" r="3"/>
  </g>
</g>`,
  );
}

// The Hellgate spell icon: a jagged obsidian arch around a fel-green vortex,
// crimson embers rising, in the warlock skill sheet's dark-fantasy palette.
function hellgateSvg() {
  return svgDoc(
    `${vignette('#1e2a14')}
<defs>
  <radialGradient id="vortex" cx="50%" cy="50%" r="50%"><stop offset="0%" stop-color="#e8ffb0"/><stop offset="30%" stop-color="#5cff33"/><stop offset="70%" stop-color="#136b1a"/><stop offset="100%" stop-color="#05110a"/></radialGradient>
  <linearGradient id="obsidian" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#4a3038"/><stop offset="50%" stop-color="#1c1116"/><stop offset="100%" stop-color="#090507"/></linearGradient>
  <filter id="blur" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="18"/></filter>
  <filter id="soft" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="5"/></filter>
</defs>
<g transform="translate(256 276)">
  <ellipse cx="0" cy="150" rx="170" ry="30" fill="#000" opacity="0.6" filter="url(#blur)"/>
  <circle cx="0" cy="-20" r="160" fill="#4cff2e" opacity="0.22" filter="url(#blur)"/>
  <circle cx="0" cy="-20" r="118" fill="url(#vortex)"/>
  <g fill="none" stroke="#0a2a0c" stroke-width="14" stroke-linecap="round" opacity="0.75">
    <path d="M-60 -110 A 110 110 0 0 1 96 -70"/><path d="M80 40 A 100 100 0 0 1 -40 80"/><path d="M-90 -50 A 70 70 0 0 0 -50 30"/>
  </g>
  <g fill="none" stroke="#caffa0" stroke-width="7" stroke-linecap="round" opacity="0.8" filter="url(#soft)">
    <path d="M-30 -84 A 70 70 0 0 1 56 -58"/><path d="M50 18 A 60 60 0 0 1 -18 44"/>
  </g>
  <path d="M-150 150 L -160 -20 L -120 -120 L -80 -170 L -40 -150 L -10 -190 L 30 -160 L 70 -180 L 110 -130 L 150 -70 L 165 40 L 150 150 L 110 150 L 118 30 L 100 -60 L 70 -110 L 40 -120 L 12 -140 L -20 -112 L -60 -118 L -92 -80 L -118 -10 L -108 150 Z" fill="url(#obsidian)" stroke="#000" stroke-width="5" stroke-linejoin="round"/>
  <g fill="#ff4a2a" opacity="0.95">
    <path d="M-40 -150 l 8 -22 l 8 22 z"/><path d="M30 -160 l 7 -24 l 9 24 z"/><path d="M110 -130 l 10 -20 l 6 22 z"/><path d="M-120 -120 l 6 -20 l 10 18 z"/>
  </g>
  <g fill="#ff8a3a" filter="url(#soft)" opacity="0.9">
    <circle cx="-60" cy="60" r="6"/><circle cx="30" cy="-20" r="5"/><circle cx="70" cy="90" r="7"/><circle cx="-20" cy="120" r="4"/><circle cx="95" cy="-10" r="4"/>
  </g>
  <g fill="#ffd0a0">
    <circle cx="-60" cy="60" r="3"/><circle cx="30" cy="-20" r="2.5"/><circle cx="70" cy="90" r="3.5"/><circle cx="-20" cy="120" r="2"/><circle cx="95" cy="-10" r="2"/>
  </g>
</g>`,
  );
}

const JOBS = [
  { itemId: 'rune_of_passage', dir: itemsDir, svg: runeSvg() },
  { itemId: 'hellgate', dir: warlockSkillsDir, svg: hellgateSvg() },
];

for (const job of JOBS) {
  const master = await sharp(Buffer.from(job.svg), { density: 72 })
    .resize(MASTER_PX, MASTER_PX)
    .flatten({ background: '#0d0b08' })
    .png()
    .toBuffer();
  let webp = await sharp(master)
    .resize(OUT_PX, OUT_PX, { kernel: 'lanczos3' })
    .webp(WEBP)
    .toBuffer();
  if (webp.length > SIZE_CAP) {
    webp = await sharp(master)
      .resize(OUT_PX, OUT_PX, { kernel: 'lanczos3' })
      .webp({ ...WEBP, quality: 75 })
      .toBuffer();
  }
  if (webp.length > SIZE_CAP) throw new Error(`${job.itemId}.webp is over the 15 KiB budget`);
  writeFileSync(path.join(job.dir, `${job.itemId}.webp`), webp);
  console.log(`ok ${job.itemId}.webp (${(webp.length / 1024).toFixed(1)} KB)`);
}
