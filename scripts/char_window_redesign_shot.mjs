// Before/after screenshots for the character window redesign: the arched AAA
// frame, the EQUIPMENT/OVERVIEW tab rail, the gold/silver/copper balance in the
// titlebar, and the bags companion docked alongside (the bank-open pattern).
// Offline flow (no server). Needs `npm run dev`. Writes PNGs to docs/screenshots/.
import fs from 'node:fs';
import puppeteer from 'puppeteer-core';

import { BROWSER_PATH as EDGE } from './browser_path.mjs';

const URL = process.env.GAME_URL ?? 'http://localhost:5173';
const CLASS = process.env.GAME_CLASS ?? 'rogue';
const OUT_DIR = 'docs/screenshots';
fs.mkdirSync(OUT_DIR, { recursive: true });

const browser = await puppeteer.launch({
  executablePath: EDGE,
  headless: 'new',
  args: [
    '--use-gl=angle',
    '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader',
    '--no-sandbox',
    '--disable-dev-shm-usage',
  ],
});
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 900 });

const errors = [];
page.on('pageerror', (e) => errors.push(`PAGEERROR: ${e.message}`));
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(`CONSOLE: ${m.text()}`);
});

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const tap = (sel) => page.evaluate((s) => document.querySelector(s)?.click(), sel);

await page.goto(URL, { waitUntil: 'networkidle0', timeout: 30000 });
await tap('#btn-offline');
await wait(200);
await page.evaluate(() => {
  const n = document.querySelector('#char-name');
  if (n) {
    n.value = 'Tetser';
    n.dispatchEvent(new Event('input', { bubbles: true }));
  }
});
await tap(`#offline-select .mini-class[data-class="${CLASS}"]`);
await tap('#btn-start-offline');
await page.waitForFunction(() => Boolean(window.__game?.sim), { timeout: 20000 });
// #ui stays hidden (body:has(#start-screen:not([style*="display: none"])) #ui)
// until the start screen's inline display is cleared; wait for it explicitly
// rather than a fixed delay, since world/asset warmup time varies by machine.
await page.waitForFunction(
  () => document.querySelector('#start-screen')?.style.display === 'none',
  { timeout: 20000 },
);
await wait(1000);

// Equip a small set and give the player some coin so the header's balance and
// the paperdoll both have something to show.
await page.evaluate(() => {
  const g = window.__game;
  const sim = g.sim;
  const pid = sim.player.id;
  sim.player.copper = 10059;
  const set = { mainhand: 'worn_sword', chest: 'recruit_tunic' };
  for (const id of Object.values(set)) {
    sim.addItem(id, 1, pid);
    sim.equipItem(id, pid);
  }
});
await wait(300);

// Open the redesigned character sheet (docks the bags companion alongside).
await page.evaluate(() => {
  const el = document.querySelector('#char-window');
  if (el?.style.display !== 'block') window.__game.hud.toggleChar();
});
await wait(1000);
await page.screenshot({ path: `${OUT_DIR}/char_window_equipment_tab.png` });

// The Overview tab (talents / progression / gathering / share).
await tap('[data-window-tab="overview"]');
await wait(300);
await page.screenshot({ path: `${OUT_DIR}/char_window_overview_tab.png` });

if (errors.length) console.log(`PAGE ERRORS:\n${errors.join('\n')}`);
console.log(
  `wrote ${OUT_DIR}/char_window_equipment_tab.png, ${OUT_DIR}/char_window_overview_tab.png`,
);
await browser.close();
