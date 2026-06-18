// Screenshot harness for the fishing-catch content pack (content/fishing.ts).
// Boots the offline world, grants the new fish/junk/treasure catches + a pole,
// opens the Bags window to show the procedural icons, then hovers one catch to
// surface its tooltip.
//
// Needs `npm run dev` on :5173 (override with GAME_URL). Writes to tmp/.
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import { BROWSER_PATH } from './browser_path.mjs';

const URL = process.env.GAME_URL ?? 'http://localhost:5173';
fs.mkdirSync('tmp', { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const CATCHES = [
  'simple_fishing_pole',
  'raw_brook_minnow', 'raw_silver_perch', 'raw_mossgill_snapper', 'waterlogged_boot',
  'raw_mire_eel', 'raw_bogfin_catfish', 'murky_tangleweed', 'rusted_lockbox',
  'raw_thornpeak_grayling', 'raw_stormcrag_pike', 'glacial_char', 'anglers_lucky_coin',
];

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
await page.type('#char-name', 'Gillwyn');
await page.click('#offline-select .mini-class[data-class="hunter"]');
await page.click('#btn-start-offline');
await sleep(2500);

// grant the full fishing-pack catch set
await page.evaluate((ids) => {
  const g = window.__game;
  for (const id of ids) g.world.addItem(id, id === 'simple_fishing_pole' ? 1 : 2);
}, CATCHES);
await sleep(300);

// open the Bags window (force display so it survives the offline-intro window
// juggling) and read its geometry for a clean clipped shot.
const bags = await page.evaluate(() => {
  const hud = window.__game.hud;
  hud.renderBags();
  const el = document.querySelector('#bags');
  el.style.display = 'flex';
  el.style.zIndex = '99999';
  const r = el.getBoundingClientRect();
  return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) };
});
await sleep(400);
await page.screenshot({ path: 'tmp/fishing-bags.png' });
console.log('captured tmp/fishing-bags.png');

if (bags.w > 0) {
  const x = Math.max(0, bags.x - 6);
  const y = Math.max(0, bags.y - 6);
  const clip = { x, y, width: Math.min(1599 - x, bags.w + 12), height: Math.min(899 - y, bags.h + 12) };
  await page.screenshot({ path: 'tmp/fishing-bags-panel.png', clip });
  console.log('captured tmp/fishing-bags-panel.png');
}

// hover a catch to surface its tooltip (the rare Glacial Char)
const hovered = await page.evaluate(() => {
  const rows = [...document.querySelectorAll('#bags .bag-item')];
  const pick = rows.find((el) => /glacial/i.test(el.getAttribute('aria-label') || el.textContent || ''))
    ?? rows.find((el) => el.querySelector('img'));
  if (!pick) return null;
  const r = pick.getBoundingClientRect();
  return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
});
if (hovered) {
  await page.mouse.move(hovered.x, hovered.y);
  await sleep(700);
  await page.screenshot({ path: 'tmp/fishing-tooltip.png' });
  console.log('captured tmp/fishing-tooltip.png');
} else {
  console.log('no bag item found to hover');
}

await browser.close();
console.log('done');
