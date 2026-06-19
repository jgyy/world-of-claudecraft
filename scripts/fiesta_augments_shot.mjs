// Screenshots for the new 2v2 Fiesta augment additions (12 new augments).
// Offline flow (no server/Postgres). Needs `npm run dev` running. Writes PNGs to tmp/.
// The Fiesta augment-pick modal is normally surfaced by a live 2v2 bout; here we
// drive the HUD's renderer directly with a crafted offer so the new cards paint.
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';

import { BROWSER_PATH as EDGE } from './browser_path.mjs';
const URL = process.env.GAME_URL ?? 'http://localhost:5174';
fs.mkdirSync('tmp', { recursive: true });

const browser = await puppeteer.launch({
  executablePath: EDGE,
  headless: 'new',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 720 });
const errors = [];
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text()); });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const cropTo = async (sel, path, pad = 24) => {
  const box = await page.evaluate((s, p) => {
    const el = document.querySelector(s);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const x = Math.max(0, r.left - p), y = Math.max(0, r.top - p);
    return { x, y, width: Math.min(1280 - x, r.width + p * 2), height: Math.min(720 - y, r.height + p * 2) };
  }, sel, pad);
  if (box && box.width > 4 && box.height > 4) { await page.screenshot({ path, clip: box }); return true; }
  return false;
};

await page.goto(URL, { waitUntil: 'networkidle0', timeout: 30000 });
await page.evaluate(() => document.querySelector('#btn-offline')?.click());
await wait(200);
await page.evaluate(() => {
  const n = document.querySelector('#char-name');
  if (n) { n.value = 'Fiesta', n.dispatchEvent(new Event('input', { bubbles: true })); }
});
await page.evaluate(() => document.querySelector('#offline-select .mini-class[data-class="warrior"]')?.click());
await page.evaluate(() => document.querySelector('#btn-start-offline')?.click());
await wait(3000);

const showOffer = (offer) => page.evaluate((o) => {
  window.__game.hud.renderFiestaAugments(o);
}, offer);

// Gold wave — physical/universal combos including the new Executioner, Bastion, Revenant.
await showOffer({ tier: 'gold', wave: 2, choices: ['aug_executioner', 'aug_bastion', 'aug_revenant'] });
await wait(500);
let ok1 = await cropTo('#fiesta-augments', 'tmp/fiesta_augments_gold.png');

// Prismatic wave — build-defining spikes including the new Warbringer, Immortal, Bloodlord.
await showOffer({ tier: 'prismatic', wave: 3, choices: ['aug_warbringer', 'aug_immortal', 'aug_bloodlord'] });
await wait(500);
let ok2 = await cropTo('#fiesta-augments', 'tmp/fiesta_augments_prismatic.png');

// Silver wave — the new entry-tier picks: Bulwark, Zealotry, Second Wind.
await showOffer({ tier: 'silver', wave: 1, choices: ['aug_bulwark', 'aug_zealotry', 'aug_second_wind'] });
await wait(500);
let ok3 = await cropTo('#fiesta-augments', 'tmp/fiesta_augments_silver.png');

console.log('shots:', { ok1, ok2, ok3 });
if (errors.length) console.log('ERRORS:\n' + errors.join('\n'));
await browser.close();
