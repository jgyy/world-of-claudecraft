// Returning-player graphics reset: proves a player whose woc_settings froze the
// pre-ultra-default low preset (graphicsPreset:1, no graphicsConfigVersion) now
// boots into the restored Ultra tier instead of being stuck on the lowest
// graphics. Offline flow (no server). Needs `npm run dev`. Writes PNGs to tmp/.
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';

import { BROWSER_PATH } from './browser_path.mjs';
const URL = process.env.GAME_URL ?? 'http://localhost:5173';
const CLASS = process.env.GAME_CLASS ?? 'warrior';
fs.mkdirSync('tmp', { recursive: true });

const browser = await puppeteer.launch({
  executablePath: BROWSER_PATH,
  headless: 'new',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 900 });

const errors = [];
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text()); });

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const tap = (sel) => page.evaluate((s) => document.querySelector(s)?.click(), sel);

// Seed the stale persisted state BEFORE any app code runs: this is exactly what
// a player who used the game before the ultra default has on disk.
await page.evaluateOnNewDocument(() => {
  localStorage.setItem('woc_settings', JSON.stringify({ graphicsPreset: 1, sfxVolume: 0.4 }));
});

await page.goto(URL, { waitUntil: 'networkidle0', timeout: 30000 });
await wait(300);

// Boot into the offline world.
await tap('#btn-offline');
await wait(600);
await page.evaluate(() => {
  const n = document.querySelector('#char-name');
  if (n) { n.value = 'Returning', n.dispatchEvent(new Event('input', { bubbles: true })); }
});
await tap(`#offline-select .mini-class[data-class="${CLASS}"]`);
await wait(400);
await tap('#btn-start-offline');
await page.waitForFunction(() => !!(window.__game && window.__game.hud), { timeout: 90000 });
await wait(2500);

const resolved = await page.evaluate(() => ({
  storedPreset: JSON.parse(localStorage.getItem('woc_settings')).graphicsPreset,
  storedVersion: JSON.parse(localStorage.getItem('woc_settings')).graphicsConfigVersion,
  storedSfx: JSON.parse(localStorage.getItem('woc_settings')).sfxVolume,
}));
console.log('after migration, woc_settings =', JSON.stringify(resolved));

// World restored to the premium pipeline (the stale low preset is gone).
await page.screenshot({ path: 'tmp/graphics_preset_reset_world.png' });

// Graphics options panel: the quality dropdown now reads Ultra, not Low.
await page.evaluate(() => {
  const hud = window.__game.hud;
  hud.toggleOptionsMenu();
  hud.optionsView = 'graphics';
  hud.renderOptions();
});
await wait(600);
await page.screenshot({ path: 'tmp/graphics_preset_reset_options.png' });

if (errors.length) console.log('PAGE ERRORS:\n' + errors.join('\n'));
await browser.close();
console.log('wrote tmp/graphics_preset_reset_world.png + tmp/graphics_preset_reset_options.png');
