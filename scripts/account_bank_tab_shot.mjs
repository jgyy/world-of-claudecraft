// One-off local capture tool for the Account Bank feature (issue "Shared
// bank"): shoots the bank window's new Account tab against a REAL online
// server (accountBankInfo only exists online: banker proximity + a loaded
// account book), plus the offline bank window (which must show NO tab strip
// contribution from the account tab: offline play never has an account).
//
// Dev-only, not wired into any npm script or CI gate. Needs:
//   - STAGE=online: a running server with ALLOW_DEV_COMMANDS=1 (dev_give /
//     dev_teleport stock the scene) and a vite dev client pointed at it.
//   - STAGE=offline: just the vite dev client.
//
// Usage:
//   GAME_URL=http://localhost:5173 STAGE=online SHOTS_DIR=docs/screenshots/account-bank-tab \
//     node scripts/account_bank_tab_shot.mjs
//   GAME_URL=http://localhost:5173 STAGE=offline PREFIX=before \
//     node scripts/account_bank_tab_shot.mjs
import fs from 'node:fs';
import puppeteer from 'puppeteer-core';
import { BROWSER_PATH } from './browser_path.mjs';
import { enterOfflineGame } from './enter_offline_game.mjs';
import { suppressGpuNotice } from './lib/gpu_notice_suppress.mjs';

const GAME_URL = process.env.GAME_URL ?? 'http://localhost:5173';
const OUT = process.env.SHOTS_DIR ?? 'docs/screenshots/account-bank-tab';
const STAGE = process.env.STAGE ?? 'online';
const PREFIX = process.env.PREFIX ?? 'after';
fs.mkdirSync(OUT, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const uniq = Date.now().toString(36).slice(-6);
const alpha = uniq.replace(/[0-9]/g, (d) => 'abcdefghij'[Number(d)]);

const MOBILE_VIEWPORT = {
  viewport: { width: 844, height: 390, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
  userAgent:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
};

async function launchBrowser(mobile) {
  return puppeteer.launch({
    executablePath: BROWSER_PATH,
    headless: 'new',
    protocolTimeout: 180000,
    userDataDir: `/tmp/claude-501/abank-shot-profile-${uniq}-${Date.now()}`,
    args: [
      '--window-size=1600,900',
      '--use-angle=swiftshader',
      '--enable-unsafe-swiftshader',
      '--no-sandbox',
      '--disable-setuid-sandbox',
    ],
    defaultViewport: mobile
      ? MOBILE_VIEWPORT.viewport
      : { width: 1600, height: 900, deviceScaleFactor: 1 },
  });
}

async function shootBankWindow(page, file, { fullFrame = false } = {}) {
  if (fullFrame) {
    await page.screenshot({ path: file });
    return;
  }
  const region = await page.evaluate(() => {
    const el = document.querySelector('#bank-window');
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.x, y: r.y, width: r.width, height: r.height };
  });
  if (!region || region.width <= 0) {
    await page.screenshot({ path: file });
    return;
  }
  const m = 12;
  await page.screenshot({
    path: file,
    clip: {
      x: Math.max(0, region.x - m),
      y: Math.max(0, region.y - m),
      width: region.width + m * 2,
      height: region.height + m * 2,
    },
  });
  console.log('shot', file);
}

async function dismissCameraPrompt(page) {
  for (let i = 0; i < 6; i++) {
    const dismissed = await page
      .evaluate(() => {
        const btn = document.querySelector('.camera-prompt-confirm');
        if (btn instanceof HTMLElement) {
          btn.click();
          return true;
        }
        return false;
      })
      .catch(() => false);
    if (dismissed) return;
    await sleep(300);
  }
}

// ---------------------------------------------------------------------------
// STAGE=offline: the bank window with NO account (offline play): no Account tab.
// ---------------------------------------------------------------------------
async function offlineStage() {
  const browser = await launchBrowser(false);
  const page = await browser.newPage();
  await suppressGpuNotice(page);
  const charName = 'Proberton';
  await page.goto(`${GAME_URL}/`, { waitUntil: 'networkidle0', timeout: 60000 });
  await page.evaluate((name) => {
    localStorage.setItem(`woc_spawn_intro_seen:offline:warrior:${name}`, '1');
  }, charName);
  await enterOfflineGame(page, { charClass: 'warrior', charName, settleMs: 2500 });
  await page.evaluate(() => {
    const sim = window.__game.sim;
    const p = sim.player;
    p.pos.x = 13;
    p.pos.y = 1.5;
    p.pos.z = 6.2;
    document.querySelector('.tut-skip')?.click();
  });
  await sleep(800);
  await dismissCameraPrompt(page);
  await page.evaluate(() => window.__game.hud.openBank());
  await page.waitForSelector('#bank-window', { visible: true, timeout: 5000 });
  await sleep(500);
  await shootBankWindow(page, `${OUT}/${PREFIX}-offline-no-account-tab.png`);
  await browser.close();
}

// ---------------------------------------------------------------------------
// STAGE=online: a character at the banker with a stocked account bank.
// ---------------------------------------------------------------------------

async function loginAndEnter(page, username, charName, cls, { mobile = false, register = true }) {
  let lastErr;
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      await page.goto(GAME_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
      lastErr = undefined;
      break;
    } catch (e) {
      lastErr = e;
      await sleep(1000);
    }
  }
  if (lastErr) throw lastErr;
  await page.waitForSelector('#btn-online', { timeout: 30000 });
  await sleep(1000);
  await page.evaluate(() => document.querySelector('#btn-online')?.click());
  await page.waitForSelector('#login-user', { visible: true, timeout: 45000 });
  let filled = false;
  for (let attempt = 0; attempt < 6 && !filled; attempt++) {
    filled = await page.evaluate(
      (u, p, mail, reg) => {
        const form = document.querySelector('#login-panel');
        const userEl = document.querySelector('#login-user');
        const passEl = document.querySelector('#login-pass');
        const toggle = document.querySelector('#btn-auth-toggle');
        const submit = document.querySelector('#btn-login');
        if (!form || !userEl || !passEl || !toggle || !submit) return false;
        const wantMode = reg ? 'register' : 'login';
        if (form.dataset.authMode !== wantMode) toggle.click();
        const emailEl = document.querySelector('#login-email');
        userEl.value = u;
        passEl.value = p;
        if (reg && emailEl) emailEl.value = mail;
        submit.click();
        return true;
      },
      username,
      'hunter22',
      `${username}@example.com`,
      register,
    );
    if (!filled) await sleep(400);
  }
  if (!filled) throw new Error('login form never stabilized');
  await page.waitForSelector('#realm-list .realm-row', { timeout: 15000 });
  await page.evaluate(() => {
    const row = document.querySelector('#realm-list .realm-row');
    (row instanceof HTMLElement ? row : null)?.click();
  });
  await page.waitForFunction(
    () =>
      !document.querySelector('#charcreate-panel')?.hasAttribute('hidden') ||
      !document.querySelector('#charselect-panel')?.hasAttribute('hidden'),
    { timeout: 15000, polling: 200 },
  );
  if (register) {
    const onCreatePanel = await page.evaluate(
      () => !document.querySelector('#charcreate-panel')?.hasAttribute('hidden'),
    );
    if (!onCreatePanel) {
      await page.evaluate(() => document.querySelector('#btn-new-character')?.click());
      await page.waitForFunction(
        () => !document.querySelector('#charcreate-panel')?.hasAttribute('hidden'),
        { timeout: 10000, polling: 200 },
      );
    }
    await page.evaluate(
      (name, cls2) => {
        document.querySelector('#new-char-name').value = name;
        document.querySelector(`#charcreate-panel .mini-class[data-class="${cls2}"]`)?.click();
        document.querySelector('#btn-create-char').click();
      },
      charName,
      cls,
    );
  }
  await page.waitForFunction(
    () => !document.querySelector('#charselect-panel')?.hasAttribute('hidden'),
    { timeout: 10000, polling: 200 },
  );
  await page.waitForSelector('#char-list .char-row', { timeout: 20000 });
  for (let i = 0; i < 30; i++) {
    const advanced = await page.evaluate(
      () =>
        document.querySelector('#charselect-panel')?.hasAttribute('hidden') ||
        document.body.classList.contains('mobile-preflight-open') ||
        typeof window.__game !== 'undefined',
    );
    if (advanced) break;
    await page.evaluate((name) => {
      window.confirm = () => true;
      const rows = [...document.querySelectorAll('#char-list .char-row')];
      const row =
        rows.find((r) => r.querySelector('.char-name')?.textContent?.trim() === name) ?? rows[0];
      const btn = row?.querySelector('.enter-world-btn') ?? row?.querySelector('.take-over-btn');
      btn?.click();
    }, charName);
    await sleep(700);
  }
  if (mobile) {
    for (let i = 0; i < 60; i++) {
      const booted = await page.evaluate(() => typeof window.__game !== 'undefined');
      if (booted) break;
      await page
        .evaluate(() => document.querySelector('#mobile-preflight-continue')?.click())
        .catch(() => {});
      await sleep(1000);
    }
  }
  await page.waitForFunction(() => window.__game?.world?.entities?.size >= 1, {
    timeout: 90000,
    polling: 500,
  });
  await sleep(1200);
  await page.evaluate(() => document.querySelector('button.tut-skip')?.click()).catch(() => {});
  await dismissCameraPrompt(page);
}

// Levels up, teleports to the banker, and stocks the account bank through
// the REAL facet command (deposit); skips the gold-gated expansion purchase
// (no merchant/vendor dependency) since a few deposited stacks are enough to
// show the feature.
async function fundAndStock(page) {
  await page.evaluate(() => {
    const cmd = (p) => window.__game.online.cmd(p);
    cmd({ cmd: 'dev_level', level: 20 });
  });
  await sleep(500);
  // Find a live banker NPC (templateId starting 'bursar_') and teleport
  // exactly onto it, rather than trusting a hardcoded coordinate that may
  // have drifted with the map. bankInfo (the personal bank's own proximity
  // gate) is the live cross-check that the teleport actually landed near one.
  const bankerPos = await page.evaluate(() => {
    for (const e of window.__game.world.entities.values()) {
      if (
        e.kind === 'npc' &&
        typeof e.templateId === 'string' &&
        e.templateId.startsWith('bursar_')
      ) {
        return { x: e.pos.x, z: e.pos.z, templateId: e.templateId };
      }
    }
    return null;
  });
  if (!bankerPos) throw new Error('no banker NPC found in the live entity list');
  console.log('banker at', JSON.stringify(bankerPos));
  await page.evaluate((pos) => {
    window.__game.online.cmd({ cmd: 'dev_teleport', x: pos.x, z: pos.z });
  }, bankerPos);
  await sleep(1500);
  for (const [id, n] of [
    ['bone_fragments', 12],
    ['wolf_fang', 9],
    ['linen_scrap', 10],
  ]) {
    await page.evaluate(
      (itemId, count) => window.__game.online.cmd({ cmd: 'dev_give', item: itemId, count }),
      id,
      n,
    );
  }
  await sleep(1000);
  try {
    await page.waitForFunction(() => window.__game.world.accountBankInfo !== null, {
      timeout: 15000,
      polling: 300,
    });
  } catch (e) {
    const state = await page.evaluate(() => ({
      bankInfo: window.__game.world.bankInfo,
      accountBankInfo: window.__game.world.accountBankInfo,
      pos: { x: window.__game.world.player.pos.x, z: window.__game.world.player.pos.z },
    }));
    console.log('BANKER PROXIMITY STALL STATE:', JSON.stringify(state));
    throw e;
  }
  for (const id of ['bone_fragments', 'wolf_fang', 'linen_scrap']) {
    await page.evaluate((itemId) => {
      const idx = window.__game.world.inventory.findIndex((s) => s.itemId === itemId);
      if (idx >= 0) window.__game.world.accountBankDeposit(idx);
    }, id);
    await sleep(700);
  }
}

async function openBankOn(page, tab, mobile) {
  await dismissCameraPrompt(page);
  const open = await page.evaluate(() => {
    const el = document.querySelector('#bank-window');
    return !!el && getComputedStyle(el).display !== 'none';
  });
  if (!open) {
    if (mobile) await page.evaluate(() => document.querySelector('#mobile-interact')?.click());
    else await page.evaluate(() => window.__game.hud.openBank());
    await page.waitForSelector('#bank-window', { visible: true, timeout: 8000 });
    await sleep(600);
  }
  await page.waitForSelector('#bank-window .bank-tab', { timeout: 8000 });
  await page.evaluate((t) => {
    document
      .querySelector(`#bank-window .bank-tab[data-tab="${t}"]`)
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  }, tab);
  await sleep(600);
}

async function newMobilePage() {
  const mobileBrowser = await launchBrowser(true);
  const mobile = await mobileBrowser.newPage();
  await suppressGpuNotice(mobile);
  await mobile.emulate(MOBILE_VIEWPORT);
  const cdp = await mobile.target().createCDPSession();
  await cdp.send('Emulation.setEmulatedMedia', {
    features: [
      { name: 'pointer', value: 'coarse' },
      { name: 'hover', value: 'none' },
    ],
  });
  return { mobileBrowser, mobile };
}

async function onlineStage() {
  const username = `abank_${uniq}`;
  const charName = `Aurelia${alpha}`;

  // Session A (desktop): register, fund, stock the account bank, shoot it.
  {
    const desktopBrowser = await launchBrowser(false);
    const desktop = await desktopBrowser.newPage();
    await suppressGpuNotice(desktop);
    await loginAndEnter(desktop, username, charName, 'warrior', { register: true });
    await fundAndStock(desktop);
    await openBankOn(desktop, 'personal', false);
    await shootBankWindow(desktop, `${OUT}/after-desktop-personal.png`);
    await openBankOn(desktop, 'account', false);
    await shootBankWindow(desktop, `${OUT}/after-desktop-account.png`);
    await desktopBrowser.close();
  }

  // Session B (mobile, same character): the account tab on touch.
  {
    const { mobileBrowser, mobile } = await newMobilePage();
    await loginAndEnter(mobile, username, charName, 'warrior', { mobile: true, register: false });
    await mobile.waitForFunction(() => window.__game.world.accountBankInfo !== null, {
      timeout: 15000,
      polling: 300,
    });
    await openBankOn(mobile, 'account', true);
    await shootBankWindow(mobile, `${OUT}/after-mobile-account.png`, { fullFrame: true });
    await mobileBrowser.close();
  }
}

if (STAGE === 'offline') await offlineStage();
else await onlineStage();
console.log('done');
