// PR screenshots for the Card Adept UI wiring (hand bar + Card Duel window,
// feature/card-adept, PR #1851). Companion to card_adept_pr_shots.mjs (which
// captures character creation and the world HUD); this script captures the
// now-wired hand bar and duel queue/arena states:
//   1. hand bar with playable cards
//   2. hand bar with an unaffordable (cost > current Focus) card, greyed out
//   3. Card Duel queue window open
//   4. Card Duel arena combat in progress (two online Card Adepts matched)
//   5. mobile viewport of the hand bar
//
// Shots 1-3, 5 use the offline single-player Sim (npm run dev, no server
// needed). Shot 4 needs two real players matched via the server-authoritative
// queue, so it drives `npm run server` (ALLOW_DEV_COMMANDS=1) with two
// browser contexts, following the mp_browser.mjs two-player pattern.
import fs from 'node:fs';
import puppeteer from 'puppeteer-core';
import { BROWSER_PATH } from './browser_path.mjs';

const URL = process.env.GAME_URL ?? 'http://localhost:5173';
const SERVER_URL = process.env.SERVER_GAME_URL ?? 'http://localhost:8787';
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

async function enterWorldAsCardAdept(page, viewport, name) {
  await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await sleep(600);
  if (viewport === MOBILE) {
    await page.evaluate(() => {
      document.querySelector('#btn-offline')?.click();
      document.querySelector('#btn-offline-mobile')?.click();
    });
  } else {
    await page.evaluate(() => document.querySelector('#btn-offline')?.click());
  }
  await sleep(400);
  await page.evaluate(() => {
    document.querySelector('#offline-select .mini-class[data-class="card_adept"]')?.click();
  });
  await sleep(200);
  await page.evaluate((n) => {
    const el = document.querySelector('#char-name');
    if (el) el.value = n;
  }, name);
  await page.evaluate(() => document.querySelector('#btn-start-offline')?.click());
  await page.waitForFunction(() => window.__game?.sim?.entities?.size > 0, {
    timeout: 120000,
    polling: 250,
  });
  await sleep(800);
  await page.keyboard.press('Escape');
  await sleep(1200);
  await page.evaluate(() => document.querySelector('.tut-skip')?.click());
  await sleep(400);
}

// The card hand only deals an opening hand once the player enters combat
// (card_hand.ts startCombat / sim.ts updateCardHand gates on p.inCombat), so
// every hand shot first picks the nearest forest wolf and opens on it with
// the level-1 Card Adept bolt (mirrors the smoke_mage.mjs targeting pattern).
async function engageNearestWolf(page) {
  const setup = await page.evaluate(() => {
    const g = window.__game;
    const sim = g.sim;
    const p = sim.player;
    let wolf = null;
    let d = 1e9;
    for (const e of sim.entities.values()) {
      if (e.kind === 'mob' && !e.dead) {
        const dd = Math.hypot(e.pos.x - p.pos.x, e.pos.z - p.pos.z);
        if (dd < d) {
          d = dd;
          wolf = e;
        }
      }
    }
    if (!wolf) return null;
    p.pos.x = wolf.pos.x + 8;
    p.pos.z = wolf.pos.z;
    sim.targetEntity(wolf.id);
    p.facing = Math.atan2(wolf.pos.x - p.pos.x, wolf.pos.z - p.pos.z);
    g.input.camYaw = p.facing;
    sim.castAbility('ca_arcane_bolt');
    return wolf.id;
  });
  if (setup == null) return;
  await page.waitForFunction(() => window.__game?.sim?.player?.inCombat === true, {
    timeout: 10000,
    polling: 200,
  });
  await page.waitForFunction(
    () => !document.querySelector('#card-hand')?.classList.contains('hidden'),
    { timeout: 10000, polling: 200 },
  );
}

async function shot1_handPlayable() {
  await withPage(DESKTOP, async (page) => {
    await enterWorldAsCardAdept(page, DESKTOP, 'Cardessa');
    await engageNearestWolf(page);
    await sleep(300);
    await page.screenshot({ path: `${OUT}/card-adept-hand-playable.png` });
    console.log('OK card-adept-hand-playable.png');
  });
}

async function shot2_handUnaffordable() {
  await withPage(DESKTOP, async (page) => {
    await enterWorldAsCardAdept(page, DESKTOP, 'Cardessa');
    await engageNearestWolf(page);
    // Drain Focus directly (rather than playing cards, which would also
    // shrink the hand) so the drawn hand stays intact and the painter's
    // per-slot playable/unplayable comparison (focus >= card.cost) has a
    // real low-Focus case to render as greyed out.
    await page.evaluate(() => {
      window.__game.sim.player.resource = 5;
    });
    await sleep(600);
    const hasUnplayable = await page.evaluate(
      () => !!document.querySelector('#card-hand .card-hand-slot.unplayable'),
    );
    if (!hasUnplayable) console.log('WARN no unplayable card slot rendered');
    await page.screenshot({ path: `${OUT}/card-adept-hand-unaffordable.png` });
    console.log('OK card-adept-hand-unaffordable.png');
  });
}

async function shot3_duelQueue() {
  await withPage(DESKTOP, async (page) => {
    await enterWorldAsCardAdept(page, DESKTOP, 'Cardessa');
    await page.evaluate(() => document.querySelector('#mm-card-duel')?.click());
    await sleep(400);
    await page.screenshot({ path: `${OUT}/card-adept-duel-queue.png` });
    console.log('OK card-adept-duel-queue.png');
  });
}

async function shot5_handMobile() {
  await withPage(MOBILE, async (page) => {
    await enterWorldAsCardAdept(page, MOBILE, 'Cardessa');
    await engageNearestWolf(page);
    await sleep(300);
    await page.screenshot({ path: `${OUT}/card-adept-hand-mobile.png` });
    console.log('OK card-adept-hand-mobile.png');
  });
}

async function loginAndEnterOnline(page, username, password, charName, fresh) {
  page.on('pageerror', (e) => console.log(`[${charName}] PAGEERR`, e.message.slice(0, 200)));
  await page.goto(SERVER_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await sleep(800);
  await page.evaluate(() => document.querySelector('#btn-online')?.click());
  await page.waitForFunction(() => !!document.querySelector('#login-user'), {
    timeout: 15000,
    polling: 200,
  });
  await sleep(200);
  // One form toggles between login/register mode via #btn-auth-toggle (main.ts
  // setAuthMode); register mode also requires an email.
  if (fresh) {
    await page.evaluate(() => document.querySelector('#btn-auth-toggle')?.click());
    await sleep(200);
  }
  await page.evaluate(
    (u, p, fresh) => {
      const el = (id) => document.querySelector(id);
      el('#login-user').value = u;
      el('#login-pass').value = p;
      if (fresh) el('#login-email').value = `${u}@example.test`;
      el('#btn-login').click();
    },
    username,
    password,
    fresh,
  );
  // Login lands on the World List (realm-panel) before character select; pick
  // the first realm row (main.ts renderRealmDropdown / the realm-panel list).
  try {
    await page.waitForFunction(
      () =>
        document.querySelector('#realm-panel')?.hasAttribute('hidden') === false ||
        document.querySelector('#charselect-panel')?.hasAttribute('hidden') === false,
      { timeout: 20000, polling: 200 },
    );
  } catch (e) {
    const dbg = await page.evaluate(() => ({
      loginErr: document.querySelector('#login-error')?.textContent,
      startPanel: document.body.dataset.startPanel,
      realmHidden: document.querySelector('#realm-panel')?.hasAttribute('hidden'),
      charselectHidden: document.querySelector('#charselect-panel')?.hasAttribute('hidden'),
      loginHidden: document.querySelector('#login-panel')?.hasAttribute('hidden'),
    }));
    console.log(`[${charName}] DBG`, JSON.stringify(dbg));
    throw e;
  }
  if (
    await page.evaluate(
      () => document.querySelector('#realm-panel')?.hasAttribute('hidden') === false,
    )
  ) {
    await page.waitForFunction(() => !!document.querySelector('#realm-list .realm-row'), {
      timeout: 15000,
      polling: 200,
    });
    await page.evaluate(() => document.querySelector('#realm-list .realm-row')?.click());
  }
  // A brand-new account with zero characters lands straight on charcreate-panel
  // (skipping the roster view); an account with an existing character lands on
  // charselect-panel (the roster), whose "New Character" button (#btn-new-character)
  // navigates to the single shared charcreate-panel (there is no separate inline
  // create form on charselect-panel).
  await page.waitForFunction(
    () =>
      document.querySelector('#charselect-panel')?.hasAttribute('hidden') === false ||
      document.querySelector('#charcreate-panel')?.hasAttribute('hidden') === false,
    { timeout: 20000, polling: 200 },
  );
  if (
    await page.evaluate(
      () => document.querySelector('#charselect-panel')?.hasAttribute('hidden') === false,
    )
  ) {
    await page.evaluate(() => document.querySelector('#btn-new-character')?.click());
    await page.waitForFunction(
      () => document.querySelector('#charcreate-panel')?.hasAttribute('hidden') === false,
      { timeout: 10000, polling: 200 },
    );
  }
  await page.evaluate((name) => {
    const nameInput = document.querySelector('#charcreate-panel #new-char-name');
    if (nameInput) nameInput.value = name;
    document.querySelector('#charcreate-panel .mini-class[data-class="card_adept"]')?.click();
    document.querySelector('#charcreate-panel #btn-create-char')?.click();
  }, charName);
  await page.waitForFunction(
    (name) =>
      [...document.querySelectorAll('.char-row')].some(
        (r) => r.querySelector('.char-name')?.textContent === name,
      ),
    { timeout: 15000, polling: 200 },
    charName,
  );
  const entered = await page.evaluate((name) => {
    const rows = [...document.querySelectorAll('.char-row')];
    const row = rows.find((r) => r.querySelector('.char-name')?.textContent === name);
    if (!row) return false;
    row.querySelector('.enter-world-btn').click();
    return true;
  }, charName);
  if (!entered) throw new Error(`could not enter world as ${charName}`);
  await page.waitForFunction(
    () => {
      const g = window.__game;
      return g && g.world && g.world.entities.size > 0;
    },
    { timeout: 20000, polling: 500 },
  );
  await sleep(800);
  await page.keyboard.press('Escape');
  await sleep(1200);
  await page.evaluate(() => document.querySelector('.tut-skip')?.click());
  await sleep(400);
}

async function shot4_duelArena() {
  const browser = await puppeteer.launch({
    executablePath: BROWSER_PATH,
    headless: 'new',
    protocolTimeout: 60000,
    args: [
      `--window-size=${DESKTOP.width},${DESKTOP.height}`,
      '--use-angle=swiftshader',
      '--enable-unsafe-swiftshader',
      '--no-sandbox',
    ],
    defaultViewport: DESKTOP,
  });
  try {
    const uniq = Date.now().toString(36).slice(-5);
    const alpha = uniq.replace(/[0-9]/g, (d) => 'abcdefghij'[Number(d)]);
    const nameA = `Cda${alpha}`;
    const nameB = `Cdb${alpha}`;
    const pageA = await browser.newPage();
    const pageB = await browser.newPage();
    console.log('logging in A...');
    await loginAndEnterOnline(pageA, `carddue_${uniq}`, 'hunter22', nameA, true);
    console.log('logging in B...');
    await loginAndEnterOnline(pageB, `carddue_${uniq}`, 'hunter22', nameB, false);

    console.log('queueing both for Card Duel...');
    for (const page of [pageA, pageB]) {
      await page.evaluate(() => document.querySelector('#mm-card-duel')?.click());
      await sleep(300);
      await page.evaluate(() => {
        document.querySelector('#card-duel-window [data-act="queue"]')?.click();
      });
      await sleep(300);
    }

    console.log('waiting for match + countdown to clear...');
    await pageA.waitForFunction(() => window.__game?.world?.duelInfo != null, {
      timeout: 30000,
      polling: 500,
    });
    // Let the 3s countdown resolve to 'active' so combat is visibly underway.
    await sleep(4500);
    await pageA.evaluate(() => document.querySelector('#card-duel-window [data-close]')?.click());
    await sleep(200);
    await pageA.screenshot({ path: `${OUT}/card-adept-duel-arena.png` });
    console.log('OK card-adept-duel-arena.png');
  } finally {
    await browser.close();
  }
}

const allOfflineTasks = [
  shot1_handPlayable,
  shot2_handUnaffordable,
  shot3_duelQueue,
  shot5_handMobile,
];
const only = process.env.ONLY_SHOTS?.split(',');
const offlineTasks = only ? allOfflineTasks.filter((t) => only.includes(t.name)) : allOfflineTasks;

for (const t of offlineTasks) {
  try {
    await t();
  } catch (e) {
    console.log('FAIL', t.name, e.message);
  }
}

if (process.env.SKIP_DUEL_ARENA !== '1') {
  try {
    await shot4_duelArena();
  } catch (e) {
    console.log('FAIL shot4_duelArena', e.message);
  }
}
