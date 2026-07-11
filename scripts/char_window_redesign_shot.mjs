// Before/after screenshots for the character window redesign: the arched AAA
// frame, the EQUIPMENT/OVERVIEW tab rail, the gold/silver/copper balance in the
// titlebar, the bags companion docked beside it on desktop, and the mobile-only
// icon-rail + in-body bags dock (the sheet is a full-screen mobile overlay, so
// mobile reparents the live #bags element into the sheet itself instead).
// Offline flow (no server). Needs `npm run dev`. Writes PNGs to docs/screenshots/.
import fs from 'node:fs';
import puppeteer from 'puppeteer-core';

import { BROWSER_PATH as EDGE } from './browser_path.mjs';
import { enterOfflineGame } from './enter_offline_game.mjs';

const URL = process.env.GAME_URL ?? 'http://localhost:5173';
const OUT_DIR = 'docs/screenshots';
fs.mkdirSync(OUT_DIR, { recursive: true });

const LAUNCH_ARGS = [
  '--use-gl=angle',
  '--use-angle=swiftshader',
  '--enable-unsafe-swiftshader',
  '--no-sandbox',
  '--disable-dev-shm-usage',
];

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const tap = (page, sel) => page.evaluate((s) => document.querySelector(s)?.click(), sel);

// Sandbox workaround, not a game bug: in this headless environment Chromium's
// :has() selector (body:has(#start-screen:not([style*="display: none"])) #ui,
// base.css) does not reliably re-evaluate after the start screen's inline
// display is set to 'none' in JS, leaving #ui (and everything in it) stuck
// display:none even though #start-screen genuinely has style="display: none".
// Forcing #ui visible with an inline !important override (which always beats a
// stylesheet !important) sidesteps that without touching any shipped code.
async function forceUiVisible(page) {
  await page.evaluate(() => {
    document.querySelector('#ui')?.style.setProperty('display', 'block', 'important');
  });
}

async function equipAndFund(page, { copper = 10059, set } = {}) {
  await page.evaluate(
    (c, items) => {
      const sim = window.__game.sim;
      const pid = sim.player.id;
      sim.player.copper = c;
      for (const id of Object.values(items)) {
        sim.addItem(id, 1, pid);
        sim.equipItem(id, pid);
      }
    },
    copper,
    set ?? { mainhand: 'worn_sword', chest: 'recruit_tunic', helmet: 'cryptbone_helm' },
  );
  await wait(300);
}

async function openChar(page) {
  await page.evaluate(() => {
    const el = document.querySelector('#char-window');
    if (el?.style.display !== 'block') window.__game.hud.toggleChar();
  });
  await wait(800);
}

async function shotDesktop() {
  const browser = await puppeteer.launch({
    executablePath: EDGE,
    headless: 'new',
    args: LAUNCH_ARGS,
  });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(`PAGEERROR: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`CONSOLE: ${m.text()}`);
  });
  await page.setViewport({ width: 1440, height: 900 });
  await page.goto(URL, { waitUntil: 'networkidle0', timeout: 30000 });
  await enterOfflineGame(page, { charClass: 'rogue', charName: 'Tetser' });
  await forceUiVisible(page);
  await equipAndFund(page);

  // 1: Equipment tab, docked bags beside it.
  await openChar(page);
  await page.screenshot({ path: `${OUT_DIR}/char_window_desktop_01_equipment_docked_bags.png` });

  // 2: Equipment tab, cropped tight to the character sheet only.
  const charBox = await page.evaluate(() => {
    const r = document.querySelector('#char-window')?.getBoundingClientRect();
    return r
      ? {
          x: Math.round(r.x),
          y: Math.round(r.y),
          width: Math.round(r.width),
          height: Math.round(r.height),
        }
      : null;
  });
  if (charBox && charBox.width > 0) {
    await page.screenshot({
      path: `${OUT_DIR}/char_window_desktop_02_equipment_close.png`,
      clip: charBox,
    });
  }

  // 3: Overview tab.
  await tap(page, '[data-window-tab="overview"]');
  await wait(400);
  await page.screenshot({ path: `${OUT_DIR}/char_window_desktop_03_overview.png` });

  // 4: Back to Equipment, cropped to just the docked Bags window.
  await tap(page, '[data-window-tab="equipment"]');
  await wait(400);
  const bagsBox = await page.evaluate(() => {
    const r = document.querySelector('#bags')?.getBoundingClientRect();
    return r
      ? {
          x: Math.round(r.x),
          y: Math.round(r.y),
          width: Math.round(r.width),
          height: Math.round(r.height),
        }
      : null;
  });
  if (bagsBox && bagsBox.width > 0) {
    await page.screenshot({
      path: `${OUT_DIR}/char_window_desktop_04_docked_bags_close.png`,
      clip: bagsBox,
    });
  }

  // 5: Fresh reopen resets to Equipment tab (close then reopen).
  await tap(page, '[data-window-close]');
  await wait(300);
  await openChar(page);
  await page.screenshot({ path: `${OUT_DIR}/char_window_desktop_05_reopen_resets_equipment.png` });

  if (errors.length) console.log(`DESKTOP PAGE ERRORS:\n${errors.join('\n')}`);
  await browser.close();
}

async function shotMobile() {
  const browser = await puppeteer.launch({
    executablePath: EDGE,
    headless: 'new',
    args: LAUNCH_ARGS,
  });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(`PAGEERROR: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`CONSOLE: ${m.text()}`);
  });
  // The game is landscape-locked on mobile (see repo memory / precedent
  // scripts), so shoot a landscape-phone viewport, not portrait.
  await page.setViewport({
    width: 844,
    height: 390,
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 2,
  });
  const cdp = await page.target().createCDPSession();
  await cdp.send('Emulation.setEmulatedMedia', {
    features: [{ name: 'pointer', value: 'coarse' }],
  });
  await page.goto(URL, { waitUntil: 'networkidle0', timeout: 30000 });
  await enterOfflineGame(page, { charClass: 'rogue', charName: 'Tetser' });
  await forceUiVisible(page);
  await equipAndFund(page);

  // 6: Equipment tab: icon-rail equip slots + the in-body docked Bags panel.
  await openChar(page);
  await page.screenshot({ path: `${OUT_DIR}/char_window_mobile_06_equipment_icon_rail_bags.png` });

  // 7: Overview tab (bags is rescued out of the sheet and hidden while here).
  await tap(page, '[data-window-tab="overview"]');
  await wait(400);
  await page.screenshot({ path: `${OUT_DIR}/char_window_mobile_07_overview.png` });

  // 8: Back to Equipment: confirms the dock re-populates after tab-away/back.
  await tap(page, '[data-window-tab="equipment"]');
  await wait(400);
  await page.screenshot({ path: `${OUT_DIR}/char_window_mobile_08_equipment_return.png` });

  // 9: Closing the sheet leaves Bags independently closed (not stranded open).
  await tap(page, '[data-window-close]');
  await wait(400);
  await page.screenshot({ path: `${OUT_DIR}/char_window_mobile_09_closed_bags_not_stranded.png` });

  // 10: Bags still opens fine standalone afterward (proves the rescue-on-close
  // correctly returned #bags to <body> and it is not trapped inside a hidden
  // #char-window).
  await page.evaluate(() => window.__game.hud.toggleBags());
  await wait(400);
  await page.screenshot({
    path: `${OUT_DIR}/char_window_mobile_10_bags_standalone_after_close.png`,
  });

  if (errors.length) console.log(`MOBILE PAGE ERRORS:\n${errors.join('\n')}`);
  await browser.close();
}

await shotDesktop();
await shotMobile();
console.log(`wrote screenshots to ${OUT_DIR}/`);
