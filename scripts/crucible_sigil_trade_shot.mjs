// Screenshot of the Crucible Quartermaster window's new "Trade Sigils"
// section (feature request: trade a duplicate slot sigil for a different
// slot of the same flavor, since it is soulbound anyway). Boots the offline
// game headless at the LOWEST graphics preset (window shots are evidence
// about the DOM, never render fidelity), gives the player two Helm Sigils of
// the Anvil, and opens the Crucible Quartermaster window directly via the
// reserved overworld singleton entity id (CRUCIBLE_VENDOR_ENTITY_ID), so the
// shot needs no travel to the raid entrance. Captures tmp/crucible_sigil_trade.png
// (SHOT= overrides). Run with `npm run dev` already up.

import fs from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer-core';
import { BROWSER_PATH } from './browser_path.mjs';
import { enterOfflineGame } from './enter_offline_game.mjs';

const URL = process.env.GAME_URL ?? 'http://localhost:5173';
const OUT = process.env.SHOT ?? 'tmp/crucible_sigil_trade.png';
fs.mkdirSync(path.dirname(OUT), { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fails = [];
const check = (cond, msg) => {
  console.log(`${cond ? 'OK  ' : 'FAIL'}  ${msg}`);
  if (!cond) fails.push(msg);
};

const browser = await puppeteer.launch({
  executablePath: BROWSER_PATH,
  headless: 'new',
  args: [
    '--window-size=1400,1000',
    '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader',
    '--no-sandbox',
  ],
  defaultViewport: { width: 1400, height: 1000, deviceScaleFactor: 2 },
});
const page = await browser.newPage();
await page.evaluateOnNewDocument(
  `try { const k = 'woc_settings'; const s = JSON.parse(localStorage.getItem(k) || '{}'); s.graphicsPreset = 1; s.graphicsDefaultApplied = true; localStorage.setItem(k, JSON.stringify(s)); } catch {}`,
);
page.on('pageerror', (e) => fails.push('PAGEERROR: ' + e.message));
page.on('console', (m) => {
  if (m.type() === 'error') console.log('CONSOLE-ERR:', m.text());
});

await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 40000 });
const booted = await enterOfflineGame(page, {
  charClass: 'warrior',
  charName: 'Redeemer',
  gameBootTimeoutMs: 60000,
});
check(booted, 'the offline world booted');

// Teleport next to the Crucible Quartermaster's reserved overworld singleton
// entity FIRST (Hud.update() auto-closes the window every frame once the
// player strays past NPC_WINDOW_CLOSE_RANGE, so this must land before the
// window opens). The jump crosses zones from the Proving Shore tutorial
// spawn, which re-arms the loading curtain (#loading-screen); wait for it to
// settle before touching anything DOM-visible (the pr_shot_targets.mjs
// teleport recipe: a clip taken under the curtain shoots the curtain art).
const teleport = await page.evaluate(() => {
  const sim = window.__game.sim;
  const CRUCIBLE_VENDOR_ENTITY_ID = 1_000_000_003;
  const npc = sim.entities.get(CRUCIBLE_VENDOR_ENTITY_ID);
  if (!npc) return { ok: false };
  const p = sim.player;
  p.pos = { x: npc.pos.x + 1, y: npc.pos.y, z: npc.pos.z };
  p.prevPos = { ...p.pos };
  sim.rebucket(p);
  return { ok: true };
});
check(teleport.ok, 'crucible quartermaster entity exists and the player teleported to it');

async function awaitVeilSettled(streakMs = 2000) {
  const deadline = Date.now() + 60000;
  let hiddenSince = null;
  while (Date.now() < deadline) {
    const hidden = await page.evaluate(() => {
      const veil = document.getElementById('loading-screen');
      if (!veil) return true;
      const style = getComputedStyle(veil);
      return (
        style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0
      );
    });
    if (!hidden) hiddenSince = null;
    else if (hiddenSince === null) hiddenSince = Date.now();
    else if (Date.now() - hiddenSince >= streakMs) return true;
    await sleep(250);
  }
  return false;
}
check(await awaitVeilSettled(), 'the loading veil settled after the teleport');

// Give the player a spare Helm Sigil of the Anvil (2, so the redemption row
// above stays affordable too) and open the Crucible Quartermaster window.
const res = await page.evaluate(() => {
  const hud = window.__game.hud;
  const sim = window.__game.sim;
  const CRUCIBLE_VENDOR_ENTITY_ID = 1_000_000_003;
  sim.addItem('sigil_anvil_helmet', 2, sim.playerId);
  hud.openCrucibleVendor(CRUCIBLE_VENDOR_ENTITY_ID);
  const win = document.querySelector('#vendor-window');
  const tradeRows = [...win.querySelectorAll('.vendor-item')].filter((el) =>
    el.getAttribute('data-focus-key')?.startsWith('trade:'),
  );
  return {
    open: win?.style.display === 'block',
    hasTradeSection: win.textContent.includes('Trade Sigils'),
    tradeRowCount: tradeRows.length,
    firstTradeRowName: tradeRows[0]?.querySelector('.vi-name')?.textContent,
    firstTradeRowPrice: tradeRows[0]?.querySelector('.vi-price')?.textContent,
    firstTradeRowAria: tradeRows[0]?.getAttribute('aria-label'),
  };
});
check(res.open, 'crucible vendor window is open');
check(res.hasTradeSection, 'the Trade Sigils section renders');
check(res.tradeRowCount === 4, `four same-flavor trade rows render (got ${res.tradeRowCount})`);
check(
  res.firstTradeRowPrice === '1 Helm Sigil of the Anvil',
  `trade row is priced in the held sigil (got ${res.firstTradeRowPrice})`,
);
console.log('first trade row:', res.firstTradeRowName, '|', res.firstTradeRowAria);

// The window is a scrollable list (the warrior redemption grid alone runs to
// 15 rows); scroll the new Trade Sigils section into view so the shot
// actually shows the feature, not the goods grid above it.
await page.evaluate(() => {
  const title = [...document.querySelectorAll('#vendor-window .vendor-section-title')].find((el) =>
    el.textContent.includes('Trade Sigils'),
  );
  title?.scrollIntoView({ block: 'start' });
});
await sleep(300);

// Poll for real layout size before screenshotting (the vendor-window recipe
// throughout pr_shot_targets.mjs): openCrucibleVendor flips display
// synchronously but the browser paints the new layout a frame or two later.
// Crop to the window's own left/right edges but only the vertical span from
// the Trade Sigils heading through its last row, so the shot focuses on the
// new feature instead of the whole (much taller) redemption grid above it.
let box = null;
for (let i = 0; i < 20; i++) {
  await sleep(300);
  box = await page.evaluate(() => {
    const win = document.querySelector('#vendor-window');
    if (!win || getComputedStyle(win).display === 'none') return null;
    const title = [...win.querySelectorAll('.vendor-section-title')].find((el) =>
      el.textContent.includes('Trade Sigils'),
    );
    const rows = [...win.querySelectorAll('.vendor-item')].filter((el) =>
      el.getAttribute('data-focus-key')?.startsWith('trade:'),
    );
    if (!title || rows.length === 0) return null;
    const winRect = win.getBoundingClientRect();
    const top = title.getBoundingClientRect();
    const bottom = rows[rows.length - 1].getBoundingClientRect();
    if (winRect.width <= 0 || top.height <= 0) return null;
    return {
      x: winRect.x,
      y: top.y,
      width: winRect.width,
      height: bottom.bottom - top.y,
    };
  });
  if (box) break;
}
check(!!box, `Trade Sigils section has a real layout box (got ${JSON.stringify(box)})`);

// page.screenshot with an explicit clip (the shoot() idiom in
// pr_screenshots.mjs), not elementHandle.screenshot(): puppeteer's own
// visible-bounding-box assertion on the handle disagreed with the real,
// measured layout box above.
const m = 12;
await page.screenshot({
  path: OUT,
  clip: {
    x: Math.max(0, box.x - m),
    y: Math.max(0, box.y - m),
    width: box.width + m * 2,
    height: box.height + m * 2,
  },
});
console.log('wrote ' + OUT);

await browser.close();
console.log(
  fails.length === 0
    ? '\nALL CRUCIBLE SIGIL TRADE CHECKS PASSED'
    : `\n${fails.length} CHECK(S) FAILED:\n - ` + fails.join('\n - '),
);
process.exit(fails.length === 0 ? 0 : 1);
