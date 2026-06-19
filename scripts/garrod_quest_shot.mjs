// Screenshot harness for the Wallwright Garrod fortification quest chain
// (src/sim/content/zone3.ts). Boots the offline world, god-modes a character,
// teleports them to Wallwright Garrod at Highwatch (~18,660), opens his quest
// dialog, and captures the gossip list + an individual quest detail.
//
// Needs `npm run dev` on :5173 (override with GAME_URL). Writes to tmp/.
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import { BROWSER_PATH } from './browser_path.mjs';

const URL = process.env.GAME_URL ?? 'http://localhost:5173';
fs.mkdirSync('tmp', { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({
  executablePath: BROWSER_PATH,
  headless: 'new',
  args: ['--window-size=1600,900', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  defaultViewport: { width: 1600, height: 900 },
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGEERROR:', e.message));
page.on('console', (m) => { if (m.type() === 'error') console.log('CONSOLE:', m.text()); });

await page.goto(URL, { waitUntil: 'networkidle0', timeout: 30000 });
await page.evaluate(() => document.querySelector('#btn-offline').click());
await sleep(200);
await page.type('#char-name', 'Stonebrace');
await page.click('#offline-select .mini-class[data-class="warrior"]');
await page.click('#btn-start-offline');
await sleep(2500);

// god-mode + level the character so the high-zone NPC and camera survive, and
// stand them next to Wallwright Garrod at Highwatch.
const npcId = await page.evaluate(() => {
  const g = window.__game;
  const sim = g.sim;
  const p = sim.player;
  p.level = 18; p.maxHp = 99999; p.hp = 99999;
  const garrod = [...sim.entities.values()].find(
    (e) => e.kind === 'npc' && e.templateId === 'wallwright_garrod');
  p.pos.x = garrod.pos.x - 2.2; p.pos.z = garrod.pos.z + 0.5;
  p.facing = Math.atan2(garrod.pos.x - p.pos.x, garrod.pos.z - p.pos.z);
  g.input.camYaw = p.facing; g.input.camPitch = 0.16;
  return garrod.id;
});
await sleep(1200);

// open Garrod's gossip / quest list
await page.evaluate((id) => window.__game.hud.openQuestDialog(id), npcId);
await sleep(700);
await page.screenshot({ path: 'tmp/garrod-questlist.png' });
console.log('captured quest list');

// click the first available quest to show its detail (text + objectives + rewards)
await page.evaluate(() => {
  const row = document.querySelector('#quest-dialog .qd-list-item[data-quest]');
  if (row) row.click();
});
await sleep(600);
await page.screenshot({ path: 'tmp/garrod-questdetail.png' });
console.log('captured quest detail');

await browser.close();
console.log('done -> tmp/garrod-questlist.png, tmp/garrod-questdetail.png');
