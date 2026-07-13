// Additional PR screenshots for the Card Adept class branch (feature/card-adept, PR #1851),
// captured after the queue window + hand bar landed on the branch (a31032737 "wire the hand
// bar and Card Duel queue into the live HUD"). The original card_adept_pr_shots.mjs predates
// that commit and its scope note ("no card-duel UI exists") is now stale for the queue window
// and hand strip (both are real DOM today: #card-hand, #card-duel-window). The 1v1 duel BOUT
// itself still needs a second live opponent (server-authoritative matchmaking), so a real
// duel in-progress/victory screen is out of scope for a single offline client and is not
// attempted here (documented, not faked).
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

async function selectCardAdept(page, panelSel) {
  await page.evaluate((sel) => {
    document.querySelector(`${sel} .mini-class[data-class="card_adept"]`)?.click();
  }, panelSel);
  await sleep(200);
}

async function enterWorldAsCardAdept(page, viewport, name = 'Cardessa') {
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
  await selectCardAdept(page, '#offline-select');
  await page.evaluate((n) => {
    const el = document.querySelector('#char-name');
    if (el) el.value = n;
  }, name);
  await page.evaluate(() => document.querySelector('#btn-start-offline')?.click());
  await page.waitForFunction(() => window.__game?.sim?.entities?.size > 0, {
    timeout: 60000,
    polling: 250,
  });
  await sleep(800);
  await page.keyboard.press('Escape');
  await sleep(1200);
  await page.evaluate(() => document.querySelector('.tut-skip')?.click());
  await sleep(400);
}

// -- 1. Character creation, alternate name/appearance state (a different in-progress
// selection: hovering another class first, then landing on Card Adept, so the shot shows
// the roster with Card Adept as the active pressed choice among the full 10-class row).
async function shot_charCreateRosterDesktop() {
  await withPage(DESKTOP, async (page) => {
    await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await sleep(600);
    await page.evaluate(() => document.querySelector('#btn-offline')?.click());
    await sleep(400);
    // Click through a couple of other classes first (mage, then rogue) before settling on
    // Card Adept, so the capture shows real interactive state, not just a fresh load.
    await page.evaluate(() => {
      document.querySelector('#offline-select .mini-class[data-class="mage"]')?.click();
    });
    await sleep(150);
    await page.evaluate(() => {
      document.querySelector('#offline-select .mini-class[data-class="rogue"]')?.click();
    });
    await sleep(150);
    await selectCardAdept(page, '#offline-select');
    await page.evaluate(() => {
      const n = document.querySelector('#char-name');
      if (n) n.value = 'Threadbind';
    });
    await sleep(300);
    await page.screenshot({ path: `${OUT}/card-adept-charcreate-roster-desktop.png` });
    console.log('OK card-adept-charcreate-roster-desktop.png');
  });
}

// -- 2. Spellbook open, showing the Card Adept's ca_* abilities.
async function shot_spellbook() {
  await withPage(DESKTOP, async (page) => {
    await enterWorldAsCardAdept(page, DESKTOP);
    await page.evaluate(() => document.querySelector('#mm-spell')?.click());
    await sleep(600);
    await page.screenshot({ path: `${OUT}/card-adept-spellbook.png` });
    console.log('OK card-adept-spellbook.png');
  });
}

// -- 3. Ability tooltip for a ca_* spellbook entry.
async function shot_abilityTooltip() {
  await withPage(DESKTOP, async (page) => {
    await enterWorldAsCardAdept(page, DESKTOP);
    await page.evaluate(() => document.querySelector('#mm-spell')?.click());
    await sleep(600);
    const target = await page.evaluate(() => {
      const el = document.querySelector('#spellbook .spell-row[data-ability-id^="ca_"]');
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    });
    if (!target) {
      console.log(
        'SKIP card-adept-ability-tooltip.png: no .spell-row[data-ability-id^="ca_"] node found',
      );
      return;
    }
    await page.mouse.move(target.x, target.y);
    await sleep(500);
    await page.screenshot({ path: `${OUT}/card-adept-ability-tooltip.png` });
    console.log('OK card-adept-ability-tooltip.png');
  });
}

// -- 4. Card hand HUD strip, populated: force inCombat so startCombat() draws the opening
// hand (the same offline-only direct-sim technique other shot scripts use, e.g.
// grix_potions_visual.mjs setting sim.player.inCombat = true for a screenshot).
async function shot_cardHandStrip() {
  await withPage(DESKTOP, async (page) => {
    await enterWorldAsCardAdept(page, DESKTOP);
    await page.evaluate(() => {
      const g = window.__game;
      g.sim.player.inCombat = true;
      g.sim.player.combatTimer = 5;
    });
    await sleep(700);
    await page.screenshot({ path: `${OUT}/card-adept-hand-strip.png` });
    console.log('OK card-adept-hand-strip.png');
  });
}

// -- 5. Card Duel queue window, "queued" state (join the queue then open the window).
async function shot_cardDuelQueue() {
  await withPage(DESKTOP, async (page) => {
    await enterWorldAsCardAdept(page, DESKTOP);
    await page.evaluate(() => {
      window.__game.world.queueCardDuel(true);
    });
    await sleep(200);
    await page.evaluate(() => document.querySelector('#mm-card-duel')?.click());
    await sleep(500);
    await page.screenshot({ path: `${OUT}/card-adept-duel-queue.png` });
    console.log('OK card-adept-duel-queue.png');
  });
}

// -- 6. Character sheet at a higher level / different gear state.
async function shot_characterSheetLeveled() {
  await withPage(DESKTOP, async (page) => {
    await enterWorldAsCardAdept(page, DESKTOP, 'Threadbind');
    await page.evaluate(() => {
      const g = window.__game;
      g.sim.player.lv = 20;
    });
    await sleep(300);
    await page.evaluate(() => document.querySelector('#mm-char')?.click());
    await sleep(500);
    await page.screenshot({ path: `${OUT}/card-adept-character-sheet-lv20.png` });
    console.log('OK card-adept-character-sheet-lv20.png');
  });
}

// -- 7. A different zone for variety: teleport the entered player to Ironhold Crossroads
// (a well-lit hub zone distinct from the spawn area used by the original 4 shots).
async function shot_zoneVariety() {
  await withPage(DESKTOP, async (page) => {
    await enterWorldAsCardAdept(page, DESKTOP, 'Threadbind');
    await page.evaluate(() => {
      const g = window.__game;
      const p = g.sim.player;
      p.pos.x = 40;
      p.pos.z = 40;
      p.prevPos = { ...p.pos };
    });
    await sleep(1200);
    await page.screenshot({ path: `${OUT}/card-adept-world-zone2.png` });
    console.log('OK card-adept-world-zone2.png');
  });
}

// -- 8. Midnight (dark) HUD theme preset for comparison against the default classic theme.
async function shot_darkTheme() {
  await withPage(DESKTOP, async (page) => {
    await enterWorldAsCardAdept(page, DESKTOP, 'Threadbind');
    await page.evaluate(() => {
      window.__game.hud.optionsHooks?.theme?.setPreset?.('midnight');
    });
    await sleep(500);
    await page.screenshot({ path: `${OUT}/card-adept-world-theme-midnight.png` });
    console.log('OK card-adept-world-theme-midnight.png');
  });
}

// -- 9. Mobile: spellbook / abilities on a touch viewport.
async function shot_spellbookMobile() {
  await withPage(MOBILE, async (page) => {
    await enterWorldAsCardAdept(page, MOBILE, 'Threadbind');
    await page.evaluate(() => document.querySelector('#mm-spell')?.click());
    await sleep(600);
    await page.screenshot({ path: `${OUT}/card-adept-spellbook-mobile.png` });
    console.log('OK card-adept-spellbook-mobile.png');
  });
}

// -- 10. Mobile: card hand strip populated (in combat), confirming HUD scales on touch too.
async function shot_cardHandStripMobile() {
  await withPage(MOBILE, async (page) => {
    await enterWorldAsCardAdept(page, MOBILE, 'Threadbind');
    await page.evaluate(() => {
      const g = window.__game;
      g.sim.player.inCombat = true;
      g.sim.player.combatTimer = 5;
    });
    await sleep(700);
    await page.screenshot({ path: `${OUT}/card-adept-hand-strip-mobile.png` });
    console.log('OK card-adept-hand-strip-mobile.png');
  });
}

const tasks = [
  shot_charCreateRosterDesktop,
  shot_spellbook,
  shot_abilityTooltip,
  shot_cardHandStrip,
  shot_cardDuelQueue,
  shot_characterSheetLeveled,
  shot_zoneVariety,
  shot_darkTheme,
  shot_spellbookMobile,
  shot_cardHandStripMobile,
];

const only = process.env.ONLY_TASKS?.split(',').map((s) => s.trim());
const toRun = only ? tasks.filter((t) => only.includes(t.name)) : tasks;

for (const t of toRun) {
  try {
    await t();
  } catch (e) {
    console.log('FAIL', t.name, e.message);
  }
}
