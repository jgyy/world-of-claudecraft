// Screenshot harness for the buff-bar aura icons. Renders every generic
// `aura_<kind>` recipe (the icon a buff shows when it is applied with a NON-ability
// id: an elixir, scroll, Fiesta power-up, or a mob stat-drain) in a labeled grid,
// with the four kinds that previously fell back to the meaningless abilityFallback
// medallion (buff_agi, buff_spi, buff_scale, buff_jump) marked NEW.
//
// Pure-icon render, no game boot needed. Needs `npm run dev` on :5173 (override with
// GAME_URL). ?gfx=ultra requested for parity with "max graphics" capture sessions.
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import { BROWSER_PATH } from './browser_path.mjs';

const URL = (process.env.GAME_URL ?? 'http://localhost:5173') + '/?gfx=ultra';
fs.mkdirSync('tmp', { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({
  executablePath: BROWSER_PATH,
  headless: 'new',
  args: ['--no-sandbox', '--window-size=1100,720', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  defaultViewport: { width: 1100, height: 720, deviceScaleFactor: 2 },
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGEERROR:', e.message));
await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
await sleep(600);

// The buff-bar kinds players can see, in buff-bar order. `new: true` marks the
// kinds this change added a deliberate recipe for.
const KINDS = [
  { kind: 'buff_ap', label: 'Attack Power' }, { kind: 'buff_sta', label: 'Stamina' },
  { kind: 'buff_int', label: 'Intellect' }, { kind: 'buff_agi', label: 'Agility', new: true },
  { kind: 'buff_spi', label: 'Spirit', new: true }, { kind: 'buff_armor', label: 'Armor' },
  { kind: 'buff_dodge', label: 'Dodge' }, { kind: 'buff_speed', label: 'Speed' },
  { kind: 'buff_haste', label: 'Haste' }, { kind: 'buff_allstats', label: 'All Stats' },
  { kind: 'buff_scale', label: 'Empowered (size)', new: true },
  { kind: 'buff_jump', label: 'Leap (jump)', new: true },
  { kind: 'thorns', label: 'Thorns' }, { kind: 'absorb', label: 'Absorb' },
  { kind: 'imbue', label: 'Weapon Imbue' }, { kind: 'hot', label: 'Heal over Time' },
  { kind: 'form_bear', label: 'Bear Form' },
];

await page.evaluate(async (kinds) => {
  const { iconDataUrl } = await import('/src/ui/icons.ts');
  document.body.style.margin = '0';
  const root = document.createElement('div');
  root.style.cssText =
    'background:#15110c;color:#e9dcc0;font:14px system-ui;padding:28px;min-height:100vh;' +
    'background-image:radial-gradient(circle at 30% 0%,#241a10,#0d0a06);';
  document.body.innerHTML = '';
  document.body.appendChild(root);
  const title = document.createElement('h1');
  title.textContent = 'Buff-bar aura icons: every stat-buff kind now ships a deliberate icon';
  title.style.cssText = 'font:700 22px Georgia,serif;color:#d4af37;margin:0 0 18px';
  root.appendChild(title);
  const grid = document.createElement('div');
  grid.style.cssText = 'display:flex;flex-wrap:wrap;gap:14px';
  root.appendChild(grid);
  for (const k of kinds) {
    const cell = document.createElement('div');
    cell.style.cssText = 'width:120px;text-align:center';
    const img = document.createElement('img');
    img.src = iconDataUrl('aura', 'aura_' + k.kind, 80);
    img.style.cssText = 'width:64px;height:64px;border-radius:8px;' +
      (k.new ? 'box-shadow:0 0 0 3px #d4af37' : '');
    cell.appendChild(img);
    const label = document.createElement('div');
    label.textContent = k.label + (k.new ? ' (new)' : '');
    label.style.cssText = 'font-size:11px;margin-top:6px;color:' + (k.new ? '#f0d98c' : '#b8a988');
    cell.appendChild(label);
    grid.appendChild(cell);
  }
}, KINDS);

await sleep(400);
await page.screenshot({ path: 'tmp/aura_icons_grid.png', fullPage: true });
console.log('wrote tmp/aura_icons_grid.png');
await browser.close();
