// Screenshot harness for the Eastbrook Reliquary chain (Antiquarian Veska, Zone 1).
// Boots the offline world, walks to Veska, opens her gossip/quest dialog, accepts
// the opening quest, and captures the quest log. Run with `npm run dev` live.
//   node scripts/reliquary_quest_shot.mjs
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
const errors = [];
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text()); });

await page.goto(URL, { waitUntil: 'networkidle0', timeout: 30000 });
await page.evaluate(() => document.querySelector('#btn-offline').click());
await sleep(200);
await page.type('#char-name', 'Veskafan');
await page.click('#offline-select .mini-class[data-class="warrior"]');
await page.click('#btn-start-offline');
await sleep(3000);

// Bump level so the chain's minLevel:5/6 quests are offerable, then stand on
// Veska so the proximity gate passes and open her gossip dialog directly.
await page.evaluate(() => {
  const g = window.__game;
  const sim = g.sim;
  sim.player.level = 8;
  sim.player.maxHp = 99999; sim.player.hp = 99999;
  let npc = null;
  for (const e of sim.entities.values()) if (e.templateId === 'antiquarian_veska') npc = e;
  if (npc) {
    const p = sim.entities.get(sim.player.id);
    p.pos.x = npc.pos.x + 1; p.pos.z = npc.pos.z; p.prevPos = { ...p.pos };
    g.hud.openQuestDialog(npc.id);
  }
});
await sleep(600);
await page.screenshot({ path: 'tmp/reliquary_gossip.png' });

// Open the first quest in the list and accept it.
await page.evaluate(() => {
  const items = [...document.querySelectorAll('#quest-dialog .qd-list-item')];
  if (items[0]) items[0].click();
});
await sleep(300);
await page.screenshot({ path: 'tmp/reliquary_quest_detail.png' });

await page.evaluate(() => {
  const btns = [...document.querySelectorAll('#quest-dialog .btn')];
  const accept = btns.find((b) => b.textContent === 'Accept');
  if (accept) accept.click();
  document.querySelector('#quest-dialog [data-close]')?.click();
});
await sleep(300);

await page.keyboard.press('l');
await sleep(400);
await page.screenshot({ path: 'tmp/reliquary_questlog.png' });

console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'no errors');
await browser.close();
