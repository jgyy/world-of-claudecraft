// Screenshots of Glimmervein Cavern (src/sim/content/zone1.ts + zone2.ts +
// src/sim/data.ts GLIMMERVEIN_GORGE_* + src/render/cave_tunnel.ts): a sunken
// gorge carved into the natural zone1/zone2 ridge, walkable as ordinary
// open-world terrain (no loading, no instance transition). Boots the offline
// world, teleports the player along the gorge at several depths, and
// captures a map view. Needs `npm run dev` running. Browser via
// scripts/browser_path.mjs.

import fs from 'node:fs';
import puppeteer from 'puppeteer-core';

import { BROWSER_PATH as EDGE } from './browser_path.mjs';

const URL = process.env.GAME_URL ?? 'http://localhost:5173';
const OUT = 'docs/screenshots';
fs.mkdirSync(OUT, { recursive: true });

const browser = await puppeteer.launch({
  executablePath: EDGE,
  headless: 'new',
  args: ['--window-size=1600,900', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  defaultViewport: { width: 1600, height: 900 },
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGEERROR:', e.message));

await page.goto(URL, { waitUntil: 'networkidle0', timeout: 30000 });
await page.evaluate(() => document.querySelector('#btn-offline').click());
await new Promise((r) => setTimeout(r, 200));
await page.type('#char-name', 'Prospector');
await page.evaluate(() =>
  document.querySelector('#offline-select .mini-class[data-class="warrior"]').click(),
);
await page.evaluate(() => document.querySelector('#btn-start-offline').click());
await page.waitForFunction(() => window.__game && window.__game.sim, { timeout: 20000 });
await new Promise((r) => setTimeout(r, 1500));

// God-mode so camp mobs never interrupt the camera (gm flag: dealDamage no-ops).
await page.evaluate(() => {
  const p = window.__game.sim.player;
  p.gm = true;
  p.hp = p.maxHp;
});

async function shootAt(name, x, z, lookX, lookZ, pitch = -0.1) {
  await page.evaluate(
    (o) => {
      const g = window.__game;
      const p = g.sim.player;
      p.hp = p.maxHp;
      p.pos.x = o.x;
      p.pos.z = o.z;
      p.facing = Math.atan2(o.lookX - o.x, o.lookZ - o.z);
      g.input.camYaw = p.facing;
      g.input.camPitch = o.pitch;
    },
    { x, z, lookX, lookZ, pitch },
  );
  await new Promise((r) => setTimeout(r, 1200));
  await page.screenshot({ path: `${OUT}/${name}.png` });
  console.log('wrote', name);
}

// The gorge runs along x=115, z 148..208 (GLIMMERVEIN_GORGE_ZS in data.ts).
// Approach along the new Zone1 road (Boar Meadow -> gorge, well east of the
// x=0 causeway) descending into the gorge mouth, through the enclosed middle
// under the rock arches, then ascending out into Mirefen Marsh.
await shootAt('glimmervein_01_approach_zone1', 100, 110, 115, 148, -0.05);
await shootAt('glimmervein_02_descent_mouth', 115, 143, 115, 165, -0.08);
await shootAt('glimmervein_03_gorge_walls', 115, 152, 100, 152, -0.15);
await shootAt('glimmervein_04_spider_camp', 115, 158, 115, 152, -0.1);
await shootAt('glimmervein_05_ore_vein', 118, 162, 115, 160, -0.1);
await shootAt('glimmervein_06_deep_enclosed', 115, 172, 115, 184, -0.25);
await shootAt('glimmervein_07_ridge_crest_overhead', 115, 180, 100, 180, -0.35);
await shootAt('glimmervein_08_bat_pack', 115, 188, 115, 196, -0.15);
await shootAt('glimmervein_09_broodling_camp', 115, 200, 115, 205, -0.1);
await shootAt('glimmervein_10_ascent_zone2_exit', 100, 250, 115, 210, -0.05);
await shootAt('glimmervein_11_ambient_ridge', 140, 180, 115, 180, -0.15);

// Map view marking the new entrance/exit distinctly from the causeway.
await page.evaluate(() => {
  const p = window.__game.sim.player;
  p.pos.x = 115;
  p.pos.z = 178;
});
await new Promise((r) => setTimeout(r, 300));
await page.evaluate(() => {
  const hud = window.__game.hud;
  const win = document.querySelector('#map-window');
  if (!win || win.style.display === 'none') hud.toggleMap?.();
});
await new Promise((r) => setTimeout(r, 500));
await page.screenshot({ path: `${OUT}/glimmervein_12_map.png` });
console.log('wrote glimmervein_12_map');

await browser.close();
console.log('wrote screenshots to', OUT);
