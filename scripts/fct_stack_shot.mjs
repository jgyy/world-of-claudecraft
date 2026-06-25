// Before/after capture for the floating-combat-text (FCT) anti-overlap fix.
// A dense elite pack (e.g. the Thornpeak Crushers) can resolve a wall of "MISS" at
// the same screen anchor in one tick. Without stacking they pile on top of each other
// into an illegible blob (BEFORE). The fix (src/ui/fct_layout.ts placeFctY, consumed
// by FctPainter.position) lays the burst out in legible rows (AFTER).
//
// Boots the offline game, enlarges combat text and zooms the camera in for legibility,
// then spawns a burst of "MISS" two ways and screenshots each. Needs `npm run dev`.
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import { BROWSER_PATH as EXEC } from './browser_path.mjs';

const URL = (process.env.GAME_URL ?? 'http://localhost:5173') + '/?gfx=ultra';
fs.mkdirSync('tmp', { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({
  executablePath: EXEC, headless: 'new',
  args: ['--window-size=1280,800', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  defaultViewport: { width: 1280, height: 800 },
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGEERROR:', e.message));
// Headless Chrome defaults to prefers-reduced-motion: reduce, which collapses the
// fct-rise animation to ~0ms and snaps the text to opacity 0. Emulate normal motion
// so the floating text stays visible for the capture.
await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'no-preference' }]);

await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
const clk = (sel) => page.evaluate((s) => document.querySelector(s)?.click(), sel);
await page.waitForSelector('#btn-offline', { timeout: 20000 });
await clk('#btn-offline');
await sleep(300);
await page.type('#char-name', 'Crusher');
await clk('#offline-select .mini-class[data-class="warrior"]');
await sleep(150);
await clk('#btn-start-offline');
await page.waitForFunction(() => window.__game && window.__game.hud && window.__game.sim, {
  timeout: 60000, polling: 500,
});
await sleep(2500);

// Enlarge combat text and pull the camera in close so the small in-world text reads.
await page.evaluate(() => {
  document.documentElement.style.setProperty('--fct-scale', '2.4');
  const g = window.__game;
  g.renderer.camDist = 6;
  g.renderer.camPitch = 0.35;
});
await sleep(400);

const COUNT = 7;

// BEFORE: replicate the pre-fix placement (every text at the same top, only the small
// horizontal jitter), drawn directly so it does not depend on the old code.
await page.evaluate((n) => {
  const g = window.__game;
  const p = g.sim.player;
  const v = g.renderer.worldToScreen(p.pos.x, p.pos.y + 2.2 * p.scale, p.pos.z);
  const z = (window.getUiScale && window.getUiScale()) || 1;
  for (let i = 0; i < n; i++) {
    const el = document.createElement('div');
    el.className = 'fct';
    el.style.color = '#bbb';
    el.style.left = `${(v.x + (Math.random() * 30 - 15)) / z}px`;
    el.style.top = `${v.y / z}px`;
    el.textContent = 'MISS';
    document.getElementById('ui')?.appendChild(el);
  }
}, COUNT);
await sleep(120);
await page.screenshot({ path: 'tmp/fct_before.png' });
console.log('shot: before (pile-up) -> tmp/fct_before.png');
await sleep(1300); // let the before-burst expire

// AFTER: the real Hud.fct, which stacks the burst into rows via placeFctY.
await page.evaluate((n) => {
  const g = window.__game;
  const p = g.sim.player;
  for (let i = 0; i < n; i++) g.hud.fct(p, 'MISS', '#bbb', false);
}, COUNT);
await sleep(120);
await page.screenshot({ path: 'tmp/fct_after.png' });
console.log('shot: after (stacked rows) -> tmp/fct_after.png');

await browser.close();
console.log('done');
