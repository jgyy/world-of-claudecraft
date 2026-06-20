// Account Settings panel screenshot. The modal markup (#account-settings-modal)
// is static in index.html and fully localized via data-i18n, so we can render it
// offline (no server/DB): just unhide it and populate the read-only info fields
// + the email input with sample values, then clip-screenshot the panel. Needs
// `npm run dev`. Writes PNG to tmp/.
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';

import { BROWSER_PATH as EDGE } from './browser_path.mjs';
const URL = process.env.GAME_URL ?? 'http://localhost:5173';
fs.mkdirSync('tmp', { recursive: true });

const browser = await puppeteer.launch({
  executablePath: EDGE,
  headless: 'new',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 1400, deviceScaleFactor: 2 });

const errors = [];
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text()); });

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

await page.goto(URL, { waitUntil: 'networkidle0', timeout: 30000 });
await wait(400);

// Populate sample account data and reveal the (otherwise API-driven) modal.
await page.evaluate(() => {
  const set = (id, txt) => { const el = document.getElementById(id); if (el) el.textContent = txt; };
  set('account-info-username', 'Aelthwyn');
  set('account-info-email', 'aelthwyn@example.com');
  set('account-info-created', 'Jan 12, 2026');
  set('account-info-lastlogin', 'Jun 20, 2026, 6:24 PM');
  set('account-info-characters', '4');
  const email = document.getElementById('account-email');
  if (email) email.value = 'aelthwyn@example.com';
  const modal = document.getElementById('account-settings-modal');
  if (modal) modal.hidden = false;
  // Lift the inner scroll cap so the whole panel is captured in one clip.
  const panel = document.querySelector('#account-settings-modal .account-modal');
  if (panel) { panel.style.maxHeight = 'none'; panel.style.overflowY = 'visible'; }
});
await wait(300);

const box = await page.evaluate(() => {
  const el = document.querySelector('#account-settings-modal .account-modal');
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height) };
});
if (!box || box.width === 0) throw new Error('account modal not found / not visible');
await page.screenshot({ path: 'tmp/account_settings_panel.png', clip: box });
await page.screenshot({ path: 'tmp/account_settings_full.png' });

if (errors.length) console.log('PAGE ERRORS:\n' + errors.join('\n'));
console.log('wrote tmp/account_settings_panel.png + tmp/account_settings_full.png');
await browser.close();
