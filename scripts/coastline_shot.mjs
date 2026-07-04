// Screenshots the World Map and a set of in-world flycam views near the
// west/east/south/north world rim so the organic-coastline change (the
// wiggled, widened mountain wall in src/sim/world.ts) can be eyeballed.
// Player is maxed level + GM-invulnerable so a teleport drop never shows the
// death screen. Run `npm run dev` first:
//   GAME_URL=http://localhost:5201 node scripts/coastline_shot.mjs

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
await sleep(2000);

await page.evaluate(() => document.querySelector('#btn-offline').click());
await page.waitForSelector('#offline-select .mini-class[data-class="warrior"]', {
  visible: true,
  timeout: 30000,
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

// max level + GM invulnerable, so no teleport drop ever shows a death screen
await page.evaluate(() => {
  const g = window.__game;
  g.sim.setPlayerLevel(20);
  g.sim.setGm(g.sim.playerId, true);
  g.sim.player.hp = g.sim.player.maxHp;
});

// 1) World Map window: Eastbrook Vale (zone1), then step through the other
// zone tabs if the window exposes them.
await page.keyboard.press('KeyM');
await sleep(700);
await page.screenshot({ path: 'tmp/01-map-zone1-vale.png' });
const zoneTabSel = '#map-window [data-zone-id], #map-window .map-zone-tab, #map-window .zone-tab';
const zoneTabs = await page.$$(zoneTabSel);
const zoneNames = ['02-map-zone2-marsh', '03-map-zone3-peaks'];
for (let i = 1; i < zoneTabs.length && i - 1 < zoneNames.length; i++) {
  await zoneTabs[i].click();
  await sleep(500);
  await page.screenshot({ path: `tmp/${zoneNames[i - 1]}.png` });
}
await page.keyboard.press('KeyM');
await sleep(300);

// 2) Flycam-ish overworld shots near each rim + the Mirefen crater area.
async function teleportAndShot(x, z, name) {
  await page.evaluate(
    ({ x, z }) => {
      const g = window.__game;
      g.sim.player.hp = g.sim.player.maxHp;
      g.sim.player.pos.x = x;
      g.sim.player.pos.z = z;
      g.sim.player.pos.y = 80;
      g.sim.player.vy = 0;
    },
    { x, z },
  );
  await sleep(1200);
  await page.evaluate(() => {
    const g = window.__game;
    if (g.sim.player) g.sim.player.hp = g.sim.player.maxHp;
  });
  await sleep(400);
  await page.screenshot({ path: `tmp/${name}.png` });
}

await teleportAndShot(-250, -200, '04-west-rim-vale-1');
await teleportAndShot(-260, 60, '05-west-rim-vale-2');
await teleportAndShot(-240, 400, '06-west-rim-marsh');
await teleportAndShot(250, -200, '07-east-rim-vale-1');
await teleportAndShot(260, 60, '08-east-rim-vale-2');
await teleportAndShot(240, 400, '09-east-rim-marsh');
await teleportAndShot(0, 1100, '10-north-rim-peaks');
await teleportAndShot(0, -400, '11-south-rim-vale');
await teleportAndShot(140, 295, '12-mirefen-crater-area');
await teleportAndShot(0, 660, '13-thornpeak-hub-overview');

console.log(errors.length ? 'PAGE ERRORS:\n' + errors.slice(0, 8).join('\n') : 'no page errors');
await browser.close();
