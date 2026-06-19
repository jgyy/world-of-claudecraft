// Screenshot harness for Drownhammer's Armory (zone2 weaponsmith vendor pack).
// Boots an offline warrior, grants the 12 weapons, opens Weaponsmith Drennan's
// shop, and captures: vendor window, an item tooltip, the paperdoll with a
// weapon equipped, and the bags showing all 12. Needs `npm run dev` on :5173.
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import { BROWSER_PATH } from './browser_path.mjs';

const URL = process.env.GAME_URL ?? 'http://localhost:5173';
const OUT = 'tmp';
fs.mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const PACK = [
  'drownhammer_warblade', 'fensteel_longsword', 'marshwarden_maul', 'reedbinder_mace',
  'silt_dirk', 'mirewhisper_dagger', 'eelhide_saber', 'boglight_staff',
  'fenmist_rod', 'drownreed_cudgel', 'marshlord_greatsword', 'venomreed_kris',
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
await page.type('#char-name', 'Drennan');
await page.click('#offline-select .mini-class[data-class="warrior"]');
await page.click('#btn-start-offline');
await sleep(2500);

// god-mode, level up, grant the whole pack, equip the rare greatsword
const info = await page.evaluate((pack) => {
  const g = window.__game;
  const p = g.sim.player;
  p.maxHp = 99999; p.hp = 99999; p.level = 13;
  for (const id of pack) g.sim.addItem(id, 1, p.id);
  g.sim.equipItem('marshlord_greatsword', p.id);
  const ents = [...(g.sim.entities.values?.() ?? g.sim.entities)];
  const npc = ents.find((e) => e && (e.templateId === 'weaponsmith_drennan' || e.npcId === 'weaponsmith_drennan'));
  if (npc && npc.pos) { p.pos.x = npc.pos.x + 1.5; p.pos.z = npc.pos.z; }
  return { found: !!npc, id: npc?.id ?? null, name: npc?.name ?? null };
}, PACK);
console.log('vendor:', JSON.stringify(info));
await sleep(600);

// --- 1) VENDOR window ---
if (info.id !== null) {
  await page.evaluate((id) => {
    for (const sel of ['#char-window', '#bags']) { const e = document.querySelector(sel); if (e) e.style.display = 'none'; }
    window.__game.hud.openVendor(id);
    const b = document.querySelector('#bags'); if (b) b.style.display = 'none';
  }, info.id);
  await sleep(500);
  const vclip = await page.evaluate(() => {
    const el = document.querySelector('#vendor-window');
    el.style.display = 'block'; el.style.left = '560px'; el.style.top = '70px';
    el.style.right = 'auto'; el.style.bottom = 'auto'; el.style.transform = 'none';
    const r = el.getBoundingClientRect();
    return { x: Math.max(0, r.x - 8), y: Math.max(0, r.y - 8), width: r.width + 16, height: r.height + 16 };
  });
  await page.screenshot({ path: `${OUT}/drownhammer-vendor.png`, clip: vclip });

  // --- 2) TOOLTIP on first weapon row ---
  await page.evaluate(() => {
    const row = document.querySelector('#vendor-window .vendor-item');
    const r = row.getBoundingClientRect();
    const cx = r.x + r.width / 2, cy = r.y + r.height / 2;
    for (const type of ['mouseenter', 'mouseover', 'mousemove']) {
      row.dispatchEvent(new MouseEvent(type, { bubbles: true, clientX: cx, clientY: cy }));
    }
  });
  await sleep(350);
  const ttclip = await page.evaluate(() => {
    const v = document.querySelector('#vendor-window').getBoundingClientRect();
    const tt = document.querySelector('#tooltip');
    const t = tt && tt.style.display !== 'none' ? tt.getBoundingClientRect() : v;
    const x0 = Math.max(0, Math.min(v.x, t.x) - 10), y0 = Math.max(0, Math.min(v.y, t.y) - 10);
    const x1 = Math.max(v.x + v.width, t.x + t.width) + 10, y1 = Math.max(v.y + v.height, t.y + t.height) + 10;
    return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
  });
  await page.screenshot({ path: `${OUT}/drownhammer-tooltip.png`, clip: ttclip });
}

// --- 3) PAPERDOLL (equipped greatsword) ---
await page.evaluate(() => {
  const el = document.querySelector('#vendor-window'); if (el) el.style.display = 'none';
  window.__game.hud.renderChar();
  const c = document.querySelector('#char-window');
  c.style.display = 'block'; c.style.left = '600px'; c.style.top = '70px';
});
await sleep(400);
await (await page.$('#char-window')).screenshot({ path: `${OUT}/drownhammer-paperdoll.png` });

// --- 4) BAGS (all 12) ---
await page.evaluate(() => {
  const c = document.querySelector('#char-window'); if (c) c.style.display = 'none';
  const hud = window.__game.hud;
  hud.renderBags?.();
  const el = document.querySelector('#bags');
  for (let i = 0; i < 3 && el.style.display === 'none'; i++) hud.toggleBags?.();
  Object.assign(el.style, { position: 'fixed', top: '70px', left: '40px', right: 'auto', bottom: 'auto', transform: 'none', display: 'flex', zIndex: '9999' });
});
await sleep(500);
await (await page.$('#bags')).screenshot({ path: `${OUT}/drownhammer-bags.png` });

await browser.close();
console.log('done');
