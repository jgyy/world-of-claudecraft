// PR screenshots for the Card Adept class branch (feature/card-adept, PR #1851).
//
// IMPORTANT SCOPE NOTE: the branch currently only wires the Card Adept class into
// character creation, the sim-side card/deck/hand state (src/sim/content/cards.ts,
// src/sim/sim.ts, IWorld card reads), and a disconnected pure view-core
// (src/ui/card_hand_view.ts). There is NO painter/window wired into the live HUD for
// the card hand, and NO card-duel queue or arena window anywhere in src/ui/ or
// index.html (grepped: zero references outside card_hand_view.ts itself and the sim
// layer). Those DOM elements do not exist in the running client, so this script does
// not attempt to screenshot them (doing so would just capture the ordinary combat HUD
// with no card content, which would misrepresent the feature as complete). It captures
// only what is genuinely rendered: character creation with Card Adept selected
// (desktop + mobile), and the entered-world HUD as a Card Adept (desktop + mobile),
// which is the honest current state of the branch.
//
// Needs `npm run dev` running (offline mode boots a local Sim, no server needed).
import fs from 'node:fs';
import puppeteer from 'puppeteer-core';
import { BROWSER_PATH } from './browser_path.mjs';

const URL = process.env.GAME_URL ?? 'http://localhost:5173';
const OUT = 'docs/screenshots';
fs.mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const DESKTOP = { width: 1920, height: 1080 };
const MOBILE = { width: 390, height: 844 };

async function withPage(viewport, fn) {
  const browser = await puppeteer.launch({
    executablePath: BROWSER_PATH,
    headless: 'new',
    protocolTimeout: 60000,
    args: [
      `--window-size=${viewport.width},${viewport.height}`,
      '--use-angle=swiftshader',
      '--enable-unsafe-swiftshader',
      '--no-sandbox',
    ],
    defaultViewport: viewport,
  });
  try {
    const page = await browser.newPage();
    page.on('pageerror', (e) => console.log('PAGEERR', e.message.slice(0, 200)));
    await fn(page);
  } finally {
    await browser.close();
  }
}

async function goOfflineCharCreate(page, viewport) {
  await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await sleep(600);
  if (viewport === MOBILE) {
    // mobile shell may route through a different entry button; try both ids.
    await page.evaluate(() => {
      document.querySelector('#btn-offline')?.click();
      document.querySelector('#btn-offline-mobile')?.click();
    });
  } else {
    await page.evaluate(() => document.querySelector('#btn-offline')?.click());
  }
  await sleep(400);
}

async function selectCardAdept(page, panelSel) {
  await page.evaluate((sel) => {
    document.querySelector(`${sel} .mini-class[data-class="card_adept"]`)?.click();
  }, panelSel);
  await sleep(200);
}

async function shot1_charCreateDesktop() {
  await withPage(DESKTOP, async (page) => {
    await goOfflineCharCreate(page, DESKTOP);
    // offline flow lands on #offline-select
    await selectCardAdept(page, '#offline-select');
    await page.evaluate(() => {
      const n = document.querySelector('#char-name');
      if (n) n.value = 'Cardessa';
    });
    await sleep(300);
    await page.screenshot({ path: `${OUT}/card-adept-charcreate-desktop.png` });
    console.log('OK card-adept-charcreate-desktop.png');
  });
}

async function shot2_charCreateMobile() {
  await withPage(MOBILE, async (page) => {
    await goOfflineCharCreate(page, MOBILE);
    await selectCardAdept(page, '#offline-select');
    await page.evaluate(() => {
      const n = document.querySelector('#char-name');
      if (n) n.value = 'Cardessa';
    });
    await sleep(300);
    await page.screenshot({ path: `${OUT}/card-adept-charcreate-mobile.png` });
    console.log('OK card-adept-charcreate-mobile.png');
  });
}

async function enterWorldAsCardAdept(page, viewport) {
  await goOfflineCharCreate(page, viewport);
  await selectCardAdept(page, '#offline-select');
  await page.evaluate(() => {
    const n = document.querySelector('#char-name');
    if (n) n.value = 'Cardessa';
  });
  await page.evaluate(() => document.querySelector('#btn-start-offline')?.click());
  await page.waitForFunction(() => window.__game?.sim?.entities?.size > 0, {
    timeout: 60000,
    polling: 250,
  });
  // Skip the first-spawn intro cinematic (Escape), which keeps #ui hidden
  // (display:none) until it lands.
  await sleep(800);
  await page.keyboard.press('Escape');
  await sleep(1200);
  await page.evaluate(() => document.querySelector('.tut-skip')?.click());
  await sleep(400);
}

async function shot3_worldDesktop() {
  await withPage(DESKTOP, async (page) => {
    await enterWorldAsCardAdept(page, DESKTOP);
    await page.screenshot({ path: `${OUT}/card-adept-world-desktop.png` });
    console.log('OK card-adept-world-desktop.png');
  });
}

async function shot4_worldMobile() {
  await withPage(MOBILE, async (page) => {
    await enterWorldAsCardAdept(page, MOBILE);
    await page.screenshot({ path: `${OUT}/card-adept-world-mobile.png` });
    console.log('OK card-adept-world-mobile.png');
  });
}

async function shot5_characterSheet() {
  await withPage(DESKTOP, async (page) => {
    await enterWorldAsCardAdept(page, DESKTOP);
    await page.evaluate(() => document.querySelector('#mm-char')?.click());
    await sleep(500);
    await page.screenshot({ path: `${OUT}/card-adept-character-sheet.png` });
    console.log('OK card-adept-character-sheet.png');
  });
}

const tasks = [
  shot1_charCreateDesktop,
  shot2_charCreateMobile,
  shot3_worldDesktop,
  shot4_worldMobile,
  shot5_characterSheet,
];

for (const t of tasks) {
  try {
    await t();
  } catch (e) {
    console.log('FAIL', t.name, e.message);
  }
}
