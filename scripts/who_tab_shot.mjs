// One-off local capture tool for the Social window's Who tab (the /who roster
// as a searchable, sortable table): captures the REAL populated tab against a
// running online server with a handful of connected alts across classes and
// guilds, on desktop and on a landscape phone viewport. The Who tab is online
// only, so the offline change-aware rig (scripts/pr_screenshots.mjs) cannot
// stage it; this is the bespoke online scene the pr-screenshots skill allows.
//
// MODE=before runs against a BASE-branch server + client (no Who tab) and
// shoots the classic chat /who dump instead, for the PR's before column.
//
// Dev-only, not wired into any npm script or CI gate. Needs:
//   - a running server (ALLOW_DEV_COMMANDS is NOT required: the alts join over
//     the ordinary wire and the guild wiring uses the social commands)
//   - a running vite dev client pointed at that server (WOC_DEV_API_TARGET)
//
// Usage: GAME_URL=http://localhost:5191 SERVER_URL=http://localhost:8791 \
//        SHOTS_DIR=docs/screenshots/who-social-tab node scripts/who_tab_shot.mjs
import fs from 'node:fs';
import puppeteer from 'puppeteer-core';
import WebSocket from 'ws';
import { BROWSER_PATH } from './browser_path.mjs';
import { dismissEntryOverlays } from './enter_offline_game.mjs';
import { suppressGpuNotice } from './lib/gpu_notice_suppress.mjs';
import { worldAuthMessage } from './lib/world_auth.mjs';

const GAME_URL = process.env.GAME_URL ?? 'http://localhost:5190';
const SERVER_URL = process.env.SERVER_URL ?? 'http://localhost:8790';
const WS_BASE = SERVER_URL.replace(/^http/, 'ws');
const OUT = process.env.SHOTS_DIR ?? 'docs/screenshots/who-social-tab';
const MODE = process.env.MODE === 'before' ? 'before' : 'after';
fs.mkdirSync(OUT, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const uniq = Date.now().toString(36).slice(-6);
const alpha = uniq.replace(/[0-9]/g, (d) => 'abcdefghij'[Number(d)]);

async function api(path, body, token) {
  const res = await fetch(SERVER_URL + path, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json().catch(() => ({})) };
}

// A lightweight always-connected alt: registers, creates a character, joins the
// world over the raw wire, and stays connected so it shows up ONLINE in the
// friend/guild rows the two mains (desktop + mobile capture) both reference.
class AltBot {
  constructor(name, cls, idx) {
    this.name = name;
    this.cls = cls;
    this.idx = idx;
    this.events = [];
  }
  async join() {
    // Username stays short (server caps it at 24 chars); the character name (this.name)
    // is what actually shows in the Friends/Guild rows, so it carries the readable label.
    const username = `slay${this.idx}${uniq}`;
    const reg = await api('/api/register', {
      username,
      password: 'hunter22',
      email: `${username}@example.com`,
    });
    const char = await api('/api/characters', { name: this.name, class: this.cls }, reg.body.token);
    this.charId = char.body.id;
    await new Promise((resolve, reject) => {
      this.ws = new WebSocket(`${WS_BASE}/ws`);
      const to = setTimeout(() => reject(new Error('timeout')), 20000);
      this.ws.on('open', () => {
        this.ws.send(JSON.stringify(worldAuthMessage(reg.body.token, char.body.id)));
      });
      this.ws.on('message', (data) => {
        const msg = JSON.parse(String(data));
        if (msg.t === 'hello') {
          clearTimeout(to);
          resolve();
        } else if (msg.t === 'events') this.events.push(...msg.list);
      });
      this.ws.on('error', reject);
    });
  }
  cmd(p) {
    this.ws.send(JSON.stringify({ t: 'cmd', ...p }));
  }
  async acceptGuildInviteWhenSeen(timeoutMs = 6000) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      if (this.events.some((e) => e.type === 'guildInvite')) {
        this.cmd({ cmd: 'guild_accept' });
        return true;
      }
      await sleep(150);
    }
    return false;
  }
  close() {
    this.ws?.close();
  }
}

const ALT_SPECS = [
  ['Brannor', 'warrior'],
  ['Cindrel', 'mage'],
  ['Doriath', 'priest'],
  ['Elowen', 'rogue'],
  ['Fenwick', 'hunter'],
  ['Galandra', 'paladin'],
  ['Halvard', 'warlock'],
  ['Isolde', 'mage'],
];
const alts = ALT_SPECS.map(([n, c], i) => new AltBot(`${n}${alpha}`, c, i));

console.log('joining alts...');
for (const a of alts) await a.join();

async function loginAndEnter(page, username, charName, cls, mobile = false) {
  // The first navigation against a still-warming vite dev server occasionally
  // aborts (a transient ERR_ABORTED, not a real failure); retry a couple of times.
  // Mirrors the proven scripts/mp_browser.mjs online-login recipe below (domcontentloaded
  // + a fixed settle sleep, then one evaluate-based click/fill/click), rather than
  // waiting on visibility signals that raced the game bundle's own DOM swaps here.
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
  if (mobile) await page.evaluate(() => document.body.classList.add('mobile-touch'));
  await page.waitForSelector('#btn-online', { timeout: 30000 });
  await sleep(1000);
  await page.evaluate(() => document.querySelector('#btn-online')?.click());
  // The desktop main's live world session (running alongside this page in the same
  // headless swiftshader browser) can starve a second page's rendering, so give this
  // a generous timeout rather than assuming a fixed page-load cost.
  await page.waitForSelector('#login-user', { visible: true, timeout: 45000 });
  // Current auth UI (src/main.ts setAuthMode): one #login-panel form that toggles
  // between login and register via #btn-auth-toggle, submitting through the single
  // #btn-login (its label/mode flip to "Create Account" in register mode). The older
  // dedicated #btn-register hook some other scripts assume no longer exists.
  // The auth panel can still be mid-render right after becoming visible (a locale-load
  // reflow can replace the form's DOM once more), so retry the fill+submit a few times
  // rather than fill once and race a possible rebuild.
  let filled = false;
  for (let attempt = 0; attempt < 6 && !filled; attempt++) {
    filled = await page.evaluate(
      (u, p, mail) => {
        const form = document.querySelector('#login-panel');
        const userEl = document.querySelector('#login-user');
        const passEl = document.querySelector('#login-pass');
        const toggle = document.querySelector('#btn-auth-toggle');
        const submit = document.querySelector('#btn-login');
        if (!form || !userEl || !passEl || !toggle || !submit) return false;
        if (form.dataset.authMode !== 'register') toggle.click();
        const emailEl = document.querySelector('#login-email');
        userEl.value = u;
        passEl.value = p;
        if (emailEl) emailEl.value = mail;
        submit.click();
        return true;
      },
      username,
      'hunter22',
      `${username}@example.com`,
    );
    if (!filled) await sleep(400);
  }
  if (!filled) throw new Error('login form never stabilized');
  // A REGISTER submit can land back on the landing card (authenticated, nav
  // flipped to Logout) rather than the realm list: press PLAY again and
  // re-check, the scripts/woc_market_shot.mjs recipe.
  let onRealms = false;
  for (let attempt = 0; attempt < 4 && !onRealms; attempt++) {
    onRealms = await page
      .waitForSelector('#realm-list .realm-row', { timeout: 8000 })
      .then(() => true)
      .catch(() => false);
    if (onRealms) break;
    console.log('realm list did not appear; pressing PLAY again');
    await page.evaluate(() => document.querySelector('#btn-online')?.click());
    await sleep(800);
  }
  if (!onRealms) throw new Error('realm list never appeared after the login submit');
  // The realm press occasionally lands before the row is wired: press until a
  // character panel answers (a brand-new account lands on #charcreate-panel).
  let onPanel = false;
  for (let attempt = 0; attempt < 4 && !onPanel; attempt++) {
    await page.evaluate(() => {
      const row = document.querySelector('#realm-list .realm-row');
      if (row instanceof HTMLElement) row.click();
    });
    onPanel = await page
      .waitForFunction(
        () =>
          !document.querySelector('#charcreate-panel')?.hasAttribute('hidden') ||
          !document.querySelector('#charselect-panel')?.hasAttribute('hidden'),
        { timeout: 8000, polling: 200 },
      )
      .then(() => true)
      .catch(() => false);
    if (!onPanel) console.log('realm press did not open a panel; retrying');
  }
  if (!onPanel) {
    const state = await page.evaluate(() => ({
      realmRows: document.querySelectorAll('#realm-list .realm-row').length,
      realmErr: document.querySelector('#realm-error')?.textContent ?? '',
      login: document.querySelector('#login-panel')?.hasAttribute('hidden'),
      loginErr: document.querySelector('#login-error')?.textContent ?? '',
      panel: document.body.dataset.startPanel,
    }));
    console.error('realm press never opened a panel:', JSON.stringify(state));
    await page.screenshot({ path: `${OUT}/debug-realm.png` });
    throw new Error('realm selection never opened a character panel');
  }
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
    (name, cls) => {
      document.querySelector('#new-char-name').value = name;
      document.querySelector(`#charcreate-panel .mini-class[data-class="${cls}"]`)?.click();
      document.querySelector('#btn-create-char').click();
    },
    charName,
    cls,
  );
  await page.waitForFunction(
    () => !document.querySelector('#charselect-panel')?.hasAttribute('hidden'),
    { timeout: 10000, polling: 200 },
  );
  await sleep(700);
  await page.evaluate((name) => {
    const rows = [...document.querySelectorAll('#char-list .char-row')];
    const row =
      rows.find((r) => r.querySelector('.char-name')?.textContent?.trim() === name) ?? rows[0];
    row?.querySelector('.enter-world-btn')?.click();
  }, charName);
  if (mobile) {
    // prepareWorldEntry (src/main.ts) gates world entry behind a "tap to continue"
    // mobile preflight prompt on a touch viewport, triggered ONLY once Enter World is
    // clicked (not earlier): dismiss it here, or beginWorldEntry() never runs and no
    // WS connection is ever opened (confirmed by an empty server access log otherwise).
    await page
      .waitForSelector('#mobile-preflight-continue', { visible: true, timeout: 8000 })
      .catch(() => {});
    await page.evaluate(() => document.querySelector('#mobile-preflight-continue')?.click());
  }
  await page.waitForFunction(() => window.__game?.world?.entities?.size >= 1, {
    timeout: 30000,
    polling: 500,
  });
}

// Wires the main account's Friends list and Guild membership: friend-adds every
// alt (one-directional, no accept needed) and founds+invites a guild that every
// alt accepts, so Friends/Guild tabs both show 6+ populated rows.
async function wireSocial(page, mainName) {
  // Founding a guild costs gold, and a realm of level-1 characters makes the
  // level sort meaningless: the dev chat commands (the server runs with
  // ALLOW_DEV_COMMANDS=1 for this rig only) fund the founder and spread the
  // alts across levels.
  await page.evaluate(() => {
    window.__game.world.chat('/dev gold 500');
    window.__game.world.chat('/dev level 27');
  });
  alts.forEach((a, i) =>
    a.cmd({ cmd: 'chat', text: `/dev level ${[3, 17, 12, 20, 9, 15, 19, 6][i]}` }),
  );
  await sleep(800);
  await page.evaluate(
    (names) => {
      for (const n of names) window.__game.world.friendAdd(n);
    },
    alts.map((a) => a.name),
  );
  await sleep(400);
  await page.evaluate(
    (guildName) => window.__game.world.guildCreate(guildName),
    `Moonwardens${alpha}`,
  );
  await sleep(400);
  const guilded = alts.slice(0, 4);
  await page.evaluate(
    (names) => {
      for (const n of names) window.__game.world.guildInvite(n);
    },
    guilded.map((a) => a.name),
  );
  await Promise.all(guilded.map((a) => a.acceptGuildInviteWhenSeen()));
  await sleep(600);
  console.log(`social wired for ${mainName}`);
}

async function dismissCameraPrompt(page) {
  // The first-run "Choose Your Camera" prompt (main.ts maybeShowFirstRunCameraPrompt)
  // can appear a beat after world entry, so poll for it a few times rather than a
  // single early dismiss attempt; it otherwise overlaps the captured window.
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

async function openSocialTab(page, tab) {
  await dismissCameraPrompt(page);
  await page.evaluate(() => window.__game.hud.toggleSocial());
  await page.waitForFunction(
    () => {
      const el = document.querySelector('#social-window');
      if (!el || getComputedStyle(el).display === 'none') return false;
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    },
    { timeout: 10000, polling: 200 },
  );
  await sleep(300);
  await page.evaluate((tab) => {
    document
      .querySelector(`#social-window [data-tab="${tab}"]`)
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  }, tab);
  await sleep(500);
}

// The Who tab asks the server on select; wait for the answer to paint rows.
async function waitForWhoRows(page) {
  await page.waitForFunction(
    () => document.querySelectorAll('#social-window .soc-who-row:not(.soc-who-header)').length >= 3,
    { timeout: 15000, polling: 250 },
  );
  await sleep(400);
}

// BEFORE: the classic chat /who dump. Type the command the way a player does
// (composeChatSend + world.chat) and clip the chat pane once the roster lines land.
async function shootChatWho(page, file) {
  await page.waitForFunction(() => document.getElementById('ui')?.style.display !== 'none', {
    timeout: 20000,
    polling: 300,
  });
  await page.evaluate(() => {
    const text = window.__game.hud.composeChatSend('/who');
    window.__game.world.chat(text);
  });
  await page.waitForFunction(
    () => /Who: [0-9]+ players? online/.test(document.querySelector('#chatlog')?.textContent ?? ''),
    { timeout: 15000, polling: 250 },
  );
  await sleep(600);
  // The chat pane's frame; a collapsed or zero-box frame falls back to the
  // bottom-left quadrant where the chat log always lives.
  const region = await page.evaluate(() => {
    const el = document.querySelector('#chatlog-frame');
    const r = el?.getBoundingClientRect();
    if (r && r.width > 120 && r.height > 80)
      return { x: r.x, y: r.y, width: r.width, height: r.height };
    return {
      x: 0,
      y: Math.max(0, window.innerHeight - 380),
      width: Math.min(window.innerWidth, 720),
      height: Math.min(window.innerHeight, 380),
    };
  });
  const m = 12;
  await page.screenshot({
    path: file,
    clip: region
      ? {
          x: Math.max(0, region.x - m),
          y: Math.max(0, region.y - m),
          width: region.width + m * 2,
          height: region.height + m * 2,
        }
      : undefined,
  });
}

async function shootClipped(page, file) {
  const region = await page.evaluate(() => {
    const el = document.querySelector('#social-window');
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.x, y: r.y, width: r.width, height: r.height };
  });
  if (!region || region.width <= 0 || region.height <= 0) {
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
}

// Desktop and mobile each get their OWN browser process, launched and closed in turn
// (not two pages sharing one browser): a live in-world session's per-frame sim/render
// work in headless swiftshader was observed to starve a second page badly enough that
// its login form never became interactive even with a very generous timeout. Splitting
// the browsers keeps each capture's page as the only thing that process renders.
async function launchBrowser() {
  return puppeteer.launch({
    executablePath: BROWSER_PATH,
    headless: 'new',
    protocolTimeout: 60000,
    userDataDir: `/tmp/claude-1000/social-shot-profile-${uniq}-${Date.now()}`,
    args: ['--window-size=1600,900', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
    defaultViewport: { width: 1600, height: 900 },
  });
}

try {
  // Desktop main: founds the guild with four alts in it (so the Guild column
  // shows guilded and unguilded rows), then opens the Who tab and shoots it in
  // name order, then re-sorted by level, then narrowed by a server-side search.
  // In MODE=before the Who tab does not exist: shoot the chat /who dump and the
  // Social window as it was.
  const ONLY = process.env.ONLY ?? '';
  const desktopBrowser = ONLY === 'mobile' ? null : await launchBrowser();
  if (desktopBrowser) {
    const desktop = await desktopBrowser.newPage();
    await suppressGpuNotice(desktop);
    const desktopName = `Aldwin${alpha}`;
    await loginAndEnter(desktop, `whomain_${uniq}`, desktopName, 'mage');
    await sleep(1000);
    // The intro cinematic hides #ui until dismissed; the chat log below is inside it.
    await dismissEntryOverlays(desktop);
    await desktop
      .evaluate(() => document.getElementById('tutorial-greeting')?.remove())
      .catch(() => {});
    await wireSocial(desktop, desktopName);
    await dismissCameraPrompt(desktop);
    if (MODE === 'before') {
      await shootChatWho(desktop, `${OUT}/before-desktop-chat.png`);
      await openSocialTab(desktop, 'guild');
      await dismissCameraPrompt(desktop);
      await shootClipped(desktop, `${OUT}/before-desktop.png`);
    } else {
      await openSocialTab(desktop, 'who');
      await waitForWhoRows(desktop);
      await dismissCameraPrompt(desktop);
      await shootClipped(desktop, `${OUT}/after-desktop.png`);
      // Local re-sort by level (descending on the first click).
      await desktop.evaluate(() => {
        document
          .querySelector('#social-window [data-act="who-sort"][data-key="level"]')
          ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });
      await sleep(400);
      await shootClipped(desktop, `${OUT}/after-desktop-sorted-level.png`);
      // Server-side search: everyone in the guild.
      await desktop.evaluate((guild) => {
        const input = document.querySelector('#social-window input[data-field="who"]');
        if (input) input.value = guild;
        document
          .querySelector('#social-window [data-act="who-search"]')
          ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      }, `Moonwardens${alpha}`);
      await waitForWhoRows(desktop);
      await shootClipped(desktop, `${OUT}/after-desktop-search-guild.png`);
    }
    await desktopBrowser.close();
  }

  // Mobile main: separate account/character/browser on a landscape phone viewport.
  const mobileBrowser = await launchBrowser();
  const mobile = await mobileBrowser.newPage();
  await suppressGpuNotice(mobile);
  await mobile.emulate({
    viewport: { width: 844, height: 390, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
    userAgent:
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  });
  const mobileName = `Aldwyn${alpha}`;
  await loginAndEnter(mobile, `whomobile_${uniq}`, mobileName, 'rogue', true);
  await sleep(1000);
  await dismissEntryOverlays(mobile);
  await mobile
    .evaluate(() => document.getElementById('tutorial-greeting')?.remove())
    .catch(() => {});
  await sleep(500);
  await dismissCameraPrompt(mobile);
  if (MODE === 'before') {
    await shootChatWho(mobile, `${OUT}/before-mobile-chat.png`);
    await openSocialTab(mobile, 'guild');
    await dismissCameraPrompt(mobile);
    await shootClipped(mobile, `${OUT}/before-mobile.png`);
  } else {
    await openSocialTab(mobile, 'who');
    await waitForWhoRows(mobile);
    await dismissCameraPrompt(mobile);
    await shootClipped(mobile, `${OUT}/after-mobile.png`);
  }
  await mobileBrowser.close();

  console.log(`captured ${MODE} shots into ${OUT}`);
} finally {
  for (const a of alts) a.close();
}
