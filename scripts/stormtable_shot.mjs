// Highwatch Stormtable feast-menu screenshots: the 10 new food & drink items in
// the bags (procedural icons + tooltips) and the live vendor window of
// Quartermaster Bree offering the new menu. Offline flow (no server). Needs
// `npm run dev`. Writes PNGs to tmp/.
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';

import { BROWSER_PATH as EDGE } from './browser_path.mjs';
const URL = process.env.GAME_URL ?? 'http://localhost:5173';
fs.mkdirSync('tmp', { recursive: true });

const ALL = [
  'stormtable_trencher', 'ridgeline_meat_pie', 'peakberry_tart', 'smoked_summit_ram', 'hearthstone_bread',
  'pinewarden_tea', 'spiced_summit_cider', 'frostmint_draught', 'emberbark_brew', 'highwatch_mulled_wine',
];

const browser = await puppeteer.launch({
  executablePath: EDGE,
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
const clip = async (sel) => page.evaluate((s) => {
  const el = document.querySelector(s);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { x: Math.max(0, Math.round(r.x)), y: Math.max(0, Math.round(r.y)), width: Math.round(r.width), height: Math.round(r.height) };
}, sel);

await page.goto(URL, { waitUntil: 'networkidle0', timeout: 30000 });
await tap('#btn-offline');
await wait(200);
await page.evaluate(() => {
  const n = document.querySelector('#char-name');
  if (n) { n.value = 'Stormtable', n.dispatchEvent(new Event('input', { bubbles: true })); }
});
await tap('#offline-select .mini-class[data-class="warrior"]');
await tap('#btn-start-offline');
await wait(3000);

// give the player the 10 new items + plenty of coin so the vendor buy-back shows
await page.evaluate(({ ALL }) => {
  const sim = window.__game.sim;
  const pid = sim.player.id;
  for (const id of ALL) sim.addItem(id, 1, pid);
}, { ALL });
await wait(300);

// 1) Bags — the 10 new food & drink items.
await page.evaluate(() => {
  window.__game.hud.renderBags?.();
  const el = document.querySelector('#bags');
  if (el) el.style.display = 'flex';
});
await wait(600);
let box = await clip('#bags');
if (box && box.width > 0) await page.screenshot({ path: 'tmp/stormtable_bags.png', clip: box });
await page.screenshot({ path: 'tmp/stormtable_bags_full.png' });
await page.evaluate(() => { const el = document.querySelector('#bags'); if (el) el.style.display = 'none'; });
await wait(200);

// 2) Vendor window — Quartermaster Bree's Stormtable menu on sale. Find Bree's
// runtime entity id by template, stand next to her, then open the vendor.
const vendor = await page.evaluate(() => {
  const sim = window.__game.sim;
  const pid = sim.player.id;
  let bree = null;
  for (const e of sim.entities.values()) if (e.templateId === 'quartermaster_bree') bree = e;
  if (!bree) return { ok: false };
  const p = sim.entities.get(pid);
  p.pos.x = bree.pos.x + 1; p.pos.z = bree.pos.z; p.prevPos = { ...p.pos };
  window.__game.hud.openVendor(bree.id);
  return { ok: true, id: bree.id };
});
await wait(800);
box = await clip('#vendor-window');
if (box && box.width > 0) await page.screenshot({ path: 'tmp/stormtable_vendor.png', clip: box });
await page.screenshot({ path: 'tmp/stormtable_vendor_full.png' });

console.log('vendor:', JSON.stringify(vendor));
if (errors.length) console.log('PAGE ERRORS:\n' + errors.join('\n'));
console.log('wrote tmp/stormtable_{bags,vendor}.png');
await browser.close();
