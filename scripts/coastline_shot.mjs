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
await sleep(800);

await page.evaluate(() => document.querySelector('#btn-offline').click());
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
await page.waitForFunction(() => window.__game?.sim != null, { timeout: 15000, polling: 300 });
await sleep(500);

// god-mode so nothing interrupts the tour
await page.evaluate(() => {
  const g = window.__game;
  g.sim.player.hp = 999999;
  g.sim.player.maxHp = 999999;
});

// 1) World Map window
await page.keyboard.press('KeyM');
await sleep(700);
await page.screenshot({ path: 'tmp/coastline-map.png' });
await page.keyboard.press('KeyM');
await sleep(300);

// 2) Flycam-ish overworld shots near each rim + the Mirefen crater area
async function teleportAndShot(x, z, name) {
  await page.evaluate(
    ({ x, z }) => {
      const g = window.__game;
      g.sim.player.pos.x = x;
      g.sim.player.pos.z = z;
      g.sim.player.pos.y = 60;
      g.sim.player.vy = 0;
    },
    { x, z },
  );
  await sleep(1000);
  await page.screenshot({ path: `tmp/${name}.png` });
}

await teleportAndShot(-160, -100, 'coastline-west-rim-1');
await teleportAndShot(-160, 60, 'coastline-west-rim-2');
await teleportAndShot(160, -100, 'coastline-east-rim-1');
await teleportAndShot(160, 60, 'coastline-east-rim-2');
await teleportAndShot(0, 890, 'coastline-north-rim');
await teleportAndShot(140, 295, 'coastline-mirefen-crater-area');

console.log(errors.length ? 'PAGE ERRORS:\n' + errors.slice(0, 8).join('\n') : 'no page errors');
await browser.close();
