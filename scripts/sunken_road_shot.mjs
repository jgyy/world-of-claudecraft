// Visual proof of the Sunken Road: a deep tunnel connecting Eastbrook Vale
// (Zone 1) to Mirefen Marsh (Zone 2). Boots the offline game, teleports
// through the tunnel at a few waypoints, and captures the world map for
// both zones.
//   node scripts/sunken_road_shot.mjs    (needs `npm run dev` on :5173)
import fs from 'node:fs';
import puppeteer from 'puppeteer-core';

import { BROWSER_PATH as EDGE } from './browser_path.mjs';

const URL = process.env.GAME_URL ?? 'http://localhost:5173';
fs.mkdirSync('docs/screenshots', { recursive: true });

const browser = await puppeteer.launch({
  executablePath: EDGE,
  headless: 'new',
  args: ['--window-size=1600,900', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  defaultViewport: { width: 1600, height: 900 },
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGEERROR:', e.message));

await page.goto(URL, { waitUntil: 'networkidle0', timeout: 30000 });
const jsClick = (sel) =>
  page.evaluate((s) => {
    const el = document.querySelector(s);
    if (!el) throw new Error(`missing ${s}`);
    el.click();
  }, sel);
await page.waitForSelector('#btn-offline', { timeout: 20000 });
await new Promise((r) => setTimeout(r, 400));
await jsClick('#btn-offline');
await new Promise((r) => setTimeout(r, 300));
await page.type('#char-name', 'Tunneler');
await jsClick('#offline-select .mini-class[data-class="warrior"]');
await jsClick('#btn-start-offline');
await page.waitForFunction(() => window.__game?.sim?.player, { timeout: 40000 });
await new Promise((r) => setTimeout(r, 2000));

// Dismiss the new-adventurer tutorial overlay, which otherwise intercepts input.
await page.evaluate(() => {
  const btn = [...document.querySelectorAll('button')].find((b) =>
    /skip tutorial/i.test(b.textContent || ''),
  );
  btn?.click();
});
await new Promise((r) => setTimeout(r, 400));

// Level up so a stray camp mob doesn't kill the camera mid-tour.
await page.evaluate(() => window.__game.sim.chat('/dev level 10'));
await new Promise((r) => setTimeout(r, 300));

async function teleportAndShoot(x, z, name) {
  await page.evaluate(
    (px, pz) => {
      window.__game.sim.chat(`/dev tp ${px} ${pz}`);
    },
    x,
    z,
  );
  await new Promise((r) => setTimeout(r, 700));
  await page.screenshot({ path: `docs/screenshots/${name}.png` });
  console.log(`captured docs/screenshots/${name}.png at (${x},${z})`);
}

// Eastbrook mouth
await teleportAndShoot(130, 15, 'sunken_road_approach_zone1');
// Interior, mid-zone1
await teleportAndShoot(125, 75, 'sunken_road_interior_1');
// Ridge crossing
await teleportAndShoot(115, 180, 'sunken_road_ridge_crossing');
// Interior, zone2
await teleportAndShoot(85, 230, 'sunken_road_interior_2');
// Fenbridge mouth
await teleportAndShoot(40, 275, 'sunken_road_exit_zone2');

// World map: zone 1 (Eastbrook Vale), showing the Sunken Road as a POI on
// the east side.
await page.evaluate(() => window.__game.sim.chat('/dev tp 0 0'));
await new Promise((r) => setTimeout(r, 500));
await jsClick('#mm-map');
await new Promise((r) => setTimeout(r, 500));
await page.screenshot({ path: 'docs/screenshots/sunken_road_map_zone1.png' });
console.log('captured docs/screenshots/sunken_road_map_zone1.png');
await jsClick('#mm-map');
await new Promise((r) => setTimeout(r, 300));

// World map: zone 2 (Mirefen Marsh).
await page.evaluate(() => window.__game.sim.chat('/dev tp 0 300'));
await new Promise((r) => setTimeout(r, 500));
await jsClick('#mm-map');
await new Promise((r) => setTimeout(r, 500));
await page.screenshot({ path: 'docs/screenshots/sunken_road_map_zone2.png' });
console.log('captured docs/screenshots/sunken_road_map_zone2.png');

await browser.close();
