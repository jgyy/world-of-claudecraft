// Mobile touch-control screenshots: default vs. left-handed layout.
// Emulates a landscape phone (coarse pointer + touch) so body.mobile-touch
// activates, enters the offline world, and captures both layouts.
// Run `npm run dev` first, then: node scripts/mobile_shots.mjs
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';

import { BROWSER_PATH } from './browser_path.mjs';
const URL = process.env.GAME_URL ?? 'http://localhost:5173';
const CLASS = process.env.GAME_CLASS ?? 'warrior';
fs.mkdirSync('tmp', { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({
  executablePath: BROWSER_PATH,
  headless: 'new',
  args: ['--window-size=900,420', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  defaultViewport: { width: 880, height: 412, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
});
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text()); });

await page.goto(URL, { waitUntil: 'networkidle0', timeout: 30000 });
await page.click('#btn-offline');
await sleep(200);
await page.type('#char-name', 'Lefty');
await page.click(`#offline-select .mini-class[data-class="${CLASS}"]`);
await page.click('#btn-start-offline');
await sleep(3000);

// dismiss the landscape-fullscreen preflight overlay if it is showing
await page.evaluate(() => {
  document.getElementById('mobile-preflight-continue')?.click();
});
await sleep(500);

// keep the photographer alive among the camp mobs
await page.evaluate(() => {
  const p = window.__game.sim.player;
  p.maxHp = 99999; p.hp = 99999;
});
await sleep(400);

// ensure the touch overlay is visible (mobile emulation may not report
// pointer:coarse to matchMedia, which gates MobileControls.setActive)
await page.evaluate(() => {
  document.body.classList.add('mobile-touch');
  // open the More tray so its (mirrored) position is visible in the shot
  document.getElementById('mobile-controls')?.classList.add('expanded');
  document.body.classList.add('mobile-more-open');
});
await sleep(300);

await page.screenshot({ path: 'tmp/mobile_default.png' });
console.log('wrote tmp/mobile_default.png');

// flip on the left-handed layout exactly as the Key Bindings toggle does
await page.evaluate(() => {
  document.body.classList.add('mobile-left-handed');
});
await sleep(400);
await page.screenshot({ path: 'tmp/mobile_left_handed.png' });
console.log('wrote tmp/mobile_left_handed.png');

if (errors.length) console.log('page errors:\n' + errors.join('\n'));
await browser.close();
