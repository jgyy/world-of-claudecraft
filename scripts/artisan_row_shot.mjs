// Screenshot the new Artisan Row profession props (offline client, max
// graphics). Boots the game, teleports the player to Smith Haldren's stall in
// Eastbrook Vale, and captures the surrounding cluster of ten new decorative
// crafting/gathering props.
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';

import { BROWSER_PATH as EDGE } from './browser_path.mjs';
import { enterOfflineGame } from './enter_offline_game.mjs';
const URL = (process.env.GAME_URL ?? 'http://localhost:5173') + '/?gfx=ultra';
fs.mkdirSync('docs/screenshots/artisan-row', { recursive: true });

const browser = await puppeteer.launch({
  executablePath: EDGE,
  headless: 'new',
  args: ['--window-size=1600,900', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'],
  defaultViewport: { width: 1600, height: 900 },
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGEERROR: ' + e.message));

await page.goto(URL, { waitUntil: 'networkidle0', timeout: 30000 });
await enterOfflineGame(page, { charName: 'Artisan' });
await page.waitForFunction(() => !!window.__game && !!window.__game.sim, { timeout: 30000 });
await new Promise((r) => setTimeout(r, 800));

// Dismiss any overlays that must never appear in a captured screenshot:
// camera-mode prompt, quest tutorial banner, low-perf warning banner.
await page.evaluate(() => {
  document.querySelector('#camera-mode-confirm, #camera-choice-confirm')?.click();
});
await new Promise((r) => setTimeout(r, 200));
await page.evaluate(() => {
  const btns = [...document.querySelectorAll('button')];
  btns.find((b) => /skip tutorial/i.test(b.textContent ?? ''))?.click();
  btns.find((b) => /dismiss/i.test(b.textContent ?? ''))?.click();
});

await page.evaluate(() => {
  const g = window.__game;
  const sim = g.sim;
  const p = sim.player;
  // Stand back from Smith Haldren's stall (9.5, 17.5) so the arc of new props
  // (radius ~5-9 around it) reads in one frame.
  p.pos.x = 9.5;
  p.pos.z = 20;
  p.prevPos = { ...p.pos };
  p.facing = Math.PI; // face north across the row
});
// Let the world settle at the new position (props are baked at build time,
// already in the scene; this just waits for terrain/prop LOD + shadows).
await new Promise((r) => setTimeout(r, 1500));
await page.evaluate(() => {
  document.querySelector('#camera-mode-confirm, #camera-choice-confirm')?.click();
  const btns = [...document.querySelectorAll('button')];
  btns.find((b) => /^confirm$/i.test(b.textContent ?? ''))?.click();
  btns.find((b) => /skip tutorial/i.test(b.textContent ?? ''))?.click();
  btns.find((b) => /dismiss/i.test(b.textContent ?? ''))?.click();
});
await new Promise((r) => setTimeout(r, 300));

await page.screenshot({ path: 'docs/screenshots/artisan-row/after-desktop-overview.png' });

// A closer shot on one prop cluster (engineering workbench + alchemy cauldron)
// for a legible close-up in the PR body.
await page.evaluate(() => {
  const g = window.__game;
  const sim = g.sim;
  const p = sim.player;
  p.pos.x = 4;
  p.pos.z = 21;
  p.prevPos = { ...p.pos };
  p.facing = 0.4;
});
await new Promise((r) => setTimeout(r, 1200));
await page.screenshot({ path: 'docs/screenshots/artisan-row/after-desktop-closeup.png' });

await browser.close();
console.log('done');
