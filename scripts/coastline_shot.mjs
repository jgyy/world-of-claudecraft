// Screenshots the World Map and a few in-world flycam views near the west/
// east/south/north world rim so the organic-coastline change (the wiggled
// mountain wall in src/sim/world.ts) can be eyeballed. Run `npm run dev`
// first:
//   GAME_URL=http://localhost:5199 node scripts/coastline_shot.mjs

import fs from 'node:fs';
import puppeteer from 'puppeteer-core';
import { BROWSER_PATH as EDGE } from './browser_path.mjs';

const URL = process.env.GAME_URL ?? 'http://localhost:5173';
fs.mkdirSync('tmp', { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const errors = [];

const browser = await puppeteer.launch({
  executablePath: EDGE,
  headless: 'new',
  protocolTimeout: 60000,
  args: [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--window-size=1400,900',
    '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader',
  ],
  defaultViewport: { width: 1400, height: 900 },
});

const page = await browser.newPage();
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: 'domcontentloaded', timeout: 30000 });
await sleep(800);

await page.evaluate(() => document.querySelector('#btn-offline').click());
await page.waitForSelector('#offline-select .mini-class[data-class="warrior"]', {
  visible: true,
  timeout: 20000,
});
await sleep(400);
await page.type('#char-name', 'Scout');
await page.click('#offline-select .mini-class[data-class="warrior"]');
await page.click('#btn-start-offline');
await sleep(1500);
await page.evaluate(() => document.querySelector('#mobile-preflight-continue')?.click());
await sleep(300);
// skip the first-spawn intro cinematic (any key/click dismisses it)
await page.keyboard.press('Escape');
await sleep(300);
await page.mouse.click(700, 450);
await page.waitForFunction(() => window.__game?.sim != null, { timeout: 60000, polling: 300 });
await sleep(500);

// god-mode so nothing interrupts the tour
await page.evaluate(() => {
  const g = window.__game;
  g.sim.player.hp = 999999;
  g.sim.player.maxHp = 999999;
});

// 1) World Map window: Eastbrook Vale (zone1), then step through the other
// zone tabs if the window exposes them.
await page.keyboard.press('KeyM');
await sleep(700);
await page.screenshot({ path: 'tmp/coastline-map-zone1-vale.png' });
const zoneTabSel = '#map-window [data-zone-id], #map-window .map-zone-tab, #map-window .zone-tab';
const zoneTabs = await page.$$(zoneTabSel);
const zoneNames = ['zone2-marsh', 'zone3-peaks'];
for (let i = 1; i < zoneTabs.length && i - 1 < zoneNames.length; i++) {
  await zoneTabs[i].click();
  await sleep(500);
  await page.screenshot({ path: `tmp/coastline-map-${zoneNames[i - 1]}.png` });
}
await page.keyboard.press('KeyM');
await sleep(300);

// 2) Flycam-ish overworld shots near each rim + the Mirefen crater area.
// A short, ground-hugging hop (not a big fall) so god-mode HP actually holds.
async function teleportAndShot(x, z, name) {
  await page.evaluate(
    ({ x, z }) => {
      const g = window.__game;
      g.sim.player.hp = g.sim.player.maxHp;
      g.sim.player.pos.x = x;
      g.sim.player.pos.z = z;
      g.sim.player.pos.y = 60;
      g.sim.player.vy = 0;
    },
    { x, z },
  );
  await sleep(1000);
  // heal + revive if the drop (fall damage) killed the player, so the next
  // shot isn't the death overlay
  await page.evaluate(() => {
    const g = window.__game;
    document.querySelector('#btn-release-spirit')?.click();
    if (g.sim.player) g.sim.player.hp = g.sim.player.maxHp;
  });
  await sleep(500);
  await page.screenshot({ path: `tmp/${name}.png` });
}

await teleportAndShot(-160, -100, 'coastline-west-rim-1');
await teleportAndShot(-160, 60, 'coastline-west-rim-2');
await teleportAndShot(-158, 400, 'coastline-west-rim-3-marsh');
await teleportAndShot(160, -100, 'coastline-east-rim-1');
await teleportAndShot(160, 60, 'coastline-east-rim-2');
await teleportAndShot(158, 400, 'coastline-east-rim-3-marsh');
await teleportAndShot(0, 890, 'coastline-north-rim-peaks');
await teleportAndShot(0, -175, 'coastline-south-rim-vale');
await teleportAndShot(140, 295, 'coastline-mirefen-crater-area');

console.log(errors.length ? 'PAGE ERRORS:\n' + errors.slice(0, 8).join('\n') : 'no page errors');
await browser.close();
