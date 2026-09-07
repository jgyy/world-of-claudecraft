// The Last Keep town services (PR shots): the bailey court with the paymaster,
// the mailbox, and the market desk; the strongroom (bank) and the armorer's
// vendor grid open at the keep; the keep on the world map with its mailbox
// mark; and a mobile landscape pass of the court. MODE=before runs the
// world views only (the services do not exist there). Offline world, no dev
// commands: the rig stands the player where it wants them.
//   GAME_URL=http://localhost:5221 MODE=after SHOTS_DIR=docs/screenshots/last-keep-town \
//     node scripts/last_keep_town_shot.mjs
import { mkdirSync } from 'node:fs';
import puppeteer from 'puppeteer-core';
import { BROWSER_PATH } from './browser_path.mjs';
import { dismissEntryOverlays, enterOfflineGame } from './enter_offline_game.mjs';

const URL = process.env.GAME_URL ?? 'http://localhost:5173';
const MODE = process.env.MODE ?? 'after';
const OUT = process.env.SHOTS_DIR ?? 'pr-shots';
mkdirSync(OUT, { recursive: true });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const ENTRY_OPTS = { settleMs: 3000, selectorTimeoutMs: 90000, gameBootTimeoutMs: 60000 };

// Reserved ids (src/sim/last_keep_garrison.ts): base 1_000_000_010, slot order.
const ARMORER_ID = 1_000_000_016;

async function seed(page) {
  await page.evaluateOnNewDocument(() => {
    try {
      localStorage.setItem('woc_settings', JSON.stringify({ graphicsPreset: 1 }));
      localStorage.removeItem('woc_entry_probe');
      localStorage.setItem('woc.cameraModePrompt.shown', '1');
    } catch {}
  });
}

async function veilSettled(page, streakMs = 3000) {
  const deadline = Date.now() + 120000;
  let hiddenSince = null;
  while (Date.now() < deadline) {
    const hidden = await page.evaluate(() => {
      const veil = document.getElementById('loading-screen');
      if (!veil) return true;
      const s = getComputedStyle(veil);
      return s.display === 'none' || s.visibility === 'hidden' || Number(s.opacity) === 0;
    });
    if (hidden) {
      hiddenSince ??= Date.now();
      if (Date.now() - hiddenSince >= streakMs) return;
    } else hiddenSince = null;
    await wait(250);
  }
}

async function stand(page, x, z, facing) {
  await page.evaluate(
    (x, z, facing) => {
      const sim = window.__game?.sim;
      const p = sim?.player;
      if (!p) return;
      document.getElementById('tutorial-greeting')?.remove();
      // Rig-only tidy: the tutorial card and the software-GPU toast cover the bailey.
      for (const el of document.querySelectorAll('.tut-card, #gpu-notice')) el.remove();
      const g = sim.groundPos(x, z);
      p.pos.x = g.x;
      p.pos.y = g.y;
      p.pos.z = g.z;
      p.prevPos = { ...p.pos };
      p.facing = facing;
      p.inCombat = false;
      p.combatTimer = 0;
      const meta = sim.players.get(sim.primaryId);
      if (meta) meta.copper = 250_000;
    },
    x,
    z,
    facing,
  );
}

async function shoot(page, name, clip) {
  await veilSettled(page);
  await wait(900);
  const path = `${OUT}/${MODE}-${name}.png`;
  if (clip) {
    const el = await page.$(clip);
    if (el) {
      await el.screenshot({ path });
      console.log('shot', path);
      return;
    }
  }
  await page.screenshot({ path });
  console.log('shot', path);
}

const browser = await puppeteer.launch({
  executablePath: BROWSER_PATH,
  headless: 'new',
  args: ['--window-size=1600,900', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  defaultViewport: { width: 1600, height: 900 },
});
try {
  const page = await browser.newPage();
  await seed(page);
  await page.goto(URL, { waitUntil: 'networkidle0', timeout: 120000 });
  await enterOfflineGame(page, { charClass: 'warrior', charName: 'Aldwin', ...ENTRY_OPTS });
  await dismissEntryOverlays(page);
  // Warm the keep's deferred assets (the castle plan streams in after a 2000 yd
  // teleport) before the first frame that counts.
  await stand(page, 404, 2040, -0.9);
  await wait(9000);
  // 1. The bailey court from the ward terrace, looking south over the well:
  //    the paymaster, the mailbox, the sergeant, the sutler's row. The terrace
  //    is the one vantage in the bailey whose camera boom stays out of a wall.
  await stand(page, 412, 2017, 0);
  await wait(5000);
  await shoot(page, 'bailey-court');
  // 2. The market hall's east front from the gate road: the auctioneer's desk.
  await stand(page, 400, 2028, -0.22);
  await wait(4000);
  await shoot(page, 'market-front');
  if (MODE === 'after') {
    // 3. The strongroom: the bank window open beside the paymaster.
    await stand(page, 411.6, 2041.6, -2.4);
    await wait(2500);
    await page.evaluate(() => window.__game?.hud?.openBank?.());
    await wait(1200);
    await shoot(page, 'strongroom-bank');
    await page.keyboard.press('Escape');
    await wait(400);
    // 4. The armorer's grid at the forge door.
    await stand(page, 379.6, 2020.4, -2.4);
    await wait(2500);
    await page.evaluate((id) => window.__game?.hud?.openVendor?.(id), ARMORER_ID);
    await wait(1200);
    await shoot(page, 'armorer-vendor');
    await page.keyboard.press('Escape');
    await wait(400);
    // 5. The Ravenpost at the keep: the mailbox window open at the pillar.
    await stand(page, 415.8, 2034.4, -Math.PI / 2);
    await wait(2500);
    await page.evaluate(() => window.__game?.hud?.openMailbox?.());
    await wait(1200);
    await shoot(page, 'keep-mailbox');
    await page.keyboard.press('Escape');
    await wait(400);
  }
  // 6. The world map centred on the keep: the mailbox mark is the town's.
  await stand(page, 408, 2036, 0);
  await wait(1500);
  await page.evaluate(() => window.__game?.hud?.toggleMap?.());
  await wait(1000);
  await shoot(page, 'keep-map', '#map-window');
  await page.evaluate(() => window.__game?.hud?.toggleMap?.());
  await page.close();
  // 7. Mobile (landscape): the bailey court.
  const mobile = await browser.newPage();
  await seed(mobile);
  await mobile.emulate({
    viewport: { width: 844, height: 390, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
    userAgent:
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  });
  await mobile.goto(URL, { waitUntil: 'networkidle0', timeout: 120000 });
  await mobile.evaluate(() => document.body.classList.add('mobile-touch'));
  await enterOfflineGame(mobile, { charClass: 'mage', charName: 'Aldwin', ...ENTRY_OPTS });
  await dismissEntryOverlays(mobile);
  await stand(mobile, 404, 2040, -0.9);
  await wait(9000);
  await stand(mobile, 412, 2017, 0);
  await wait(5000);
  await shoot(mobile, 'bailey-court-mobile');
  await mobile.close();
} finally {
  await browser.close();
}
