// Before/after screenshots for the "Attack (go to attack distance) button"
// feature request: pressing the fixed action-bar Attack slot (slot 0, the
// real hud.castSlot entry point a keybind/click/pad press all route through)
// with a hostile TAB-target selected out of melee range now walks the player
// into melee range and engages, instead of silently arming a swing that only
// connects once the player manually closes the distance.
//
// Drives the real offline client: teleports the player 12 yards from a
// hostile mob, targets it (the classic-MMO Tab flow this feature answers),
// captures BEFORE (target selected, out of range, Attack slot idle), presses
// the real Attack slot (hud.castSlot(0)), lets the client's own frame loop
// (Attack Move's click-to-move pipeline, reused by
// src/game/attack_current_target.ts) run for a few seconds, then captures
// AFTER (player standing in melee range, auto-attacking, Attack slot glowing).
//
// Needs `npm run dev` already running (GAME_URL defaults to :5173).
// Usage: node scripts/attack_current_target_shot.mjs
import fs from 'node:fs';
import puppeteer from 'puppeteer-core';
import { BROWSER_PATH } from './browser_path.mjs';
import { enterOfflineGame } from './enter_offline_game.mjs';

const URL = process.env.GAME_URL ?? 'http://localhost:5173';
const OUT_DIR = 'docs/screenshots/attack-current-target';
fs.mkdirSync(OUT_DIR, { recursive: true });
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
    '--window-size=1600,900',
    '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader',
    '--no-sandbox',
  ],
  defaultViewport: { width: 1600, height: 900 },
});
const page = await browser.newPage();
await page.bringToFront();
page.on('pageerror', (e) => fails.push(`PAGEERROR: ${e.message}`));

// Standing capture rule: seed the lowest graphics preset before boot.
await page.evaluateOnNewDocument(() => {
  try {
    localStorage.setItem('woc_settings', JSON.stringify({ graphicsPreset: 1 }));
  } catch {
    /* ignore */
  }
});

function dismissPerfBanner() {
  return page.evaluate(() => {
    const dismiss = [...document.querySelectorAll('button')].find(
      (b) => b.textContent.trim() === 'Dismiss',
    );
    dismiss?.click();
  });
}

async function awaitVeilSettled(streakMs = 3000) {
  const deadline = Date.now() + 120000;
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
    else if (Date.now() - hiddenSince >= streakMs) return;
    await sleep(150);
  }
  console.log('WARNING: loading veil never settled within 120s');
}

await page.goto(URL, { waitUntil: 'networkidle0', timeout: 90000 });
const booted = await enterOfflineGame(page, {
  charClass: 'warrior',
  charName: 'Vanguard',
  gameBootTimeoutMs: 60000,
});
check(booted, 'offline world booted');
await awaitVeilSettled();

// Level 20 warrior (a pure melee class, so the fixed Attack slot is the
// player's main damage button), teleported 12 yards from the nearest hostile
// mob and facing it, with that mob as the current target: exactly the
// "Tab an enemy" starting state the feature request describes.
const setup = await page.evaluate(() => {
  const sim = window.__game.sim;
  sim.setPlayerLevel(20);
  const p = sim.player;
  const mob = [...sim.entities.values()].find(
    (e) => e.kind === 'mob' && e.hostile && !e.dead && e.templateId !== undefined,
  );
  if (!mob) return { ok: false, reason: 'no hostile mob found in the loaded world' };
  const dx = 12; // yards, well outside melee range
  const pos = sim.groundPos(mob.pos.x - dx, mob.pos.z);
  p.pos = pos;
  p.prevPos = { ...pos };
  p.facing = Math.atan2(mob.pos.x - pos.x, mob.pos.z - pos.z);
  p.prevFacing = p.facing;
  p.vx = 0;
  p.vy = 0;
  p.vz = 0;
  sim.grid.update(p);
  sim.playerGrid.update(p);
  sim.targetEntity(mob.id);
  window.__game.hud.update();
  return {
    ok: true,
    mobName: mob.templateId,
    mobId: mob.id,
    distance: Math.hypot(p.pos.x - mob.pos.x, p.pos.z - mob.pos.z),
    autoAttack: p.autoAttack,
    targetId: p.targetId,
  };
});
console.log('setup', setup);
check(setup.ok, 'positioned player 12 yards from a hostile mob and targeted it');
check(
  setup.distance > 10,
  `starting distance is out of melee range (${setup.distance?.toFixed?.(2)})`,
);
check(setup.autoAttack === false, 'not auto-attacking before the Attack press');

await sleep(400); // let the HUD repaint the new target frame before the shot
await awaitVeilSettled(); // decor streaming can re-arm the curtain after boot
await dismissPerfBanner();
await sleep(300);

await page.screenshot({ path: `${OUT_DIR}/before-desktop.png` });
console.log('wrote before-desktop.png');

// The real Attack slot entry point: castSlot(0) is exactly what the keybind,
// the action-bar click, and the pad's cross-hotbar press all route through
// (hud.ts activateFixedAttackSlot). Not currently auto-attacking and the
// target is out of range, so this now walks the player in instead of arming
// a swing that never lands.
await page.evaluate(() => window.__game.hud.castSlot(0));
console.log(
  'post-press input state',
  await page.evaluate(() => {
    const input = window.__game.input;
    const p = window.__game.sim.player;
    return {
      clickMoveAttack: input.clickMoveAttack,
      clickMoveEntityId: input.clickMoveEntityId,
      clickMoveTarget: input.clickMoveTarget,
      autoAttack: p.autoAttack,
      targetId: p.targetId,
    };
  }),
);

// Let the client's own frame loop (attackMoveTick, driven from
// src/main.ts's real-time render loop) chase the target to melee range and
// engage, then poll until it reports engaged or a timeout elapses. The forest
// wolf wanders on its own idle AI, so a dropped chase (arrived at a stale
// waypoint the live mob has since wandered off) is re-pressed exactly like a
// player would just press Attack again.
const outcome = await (async () => {
  const deadline = Date.now() + 20000;
  let n = 0;
  while (Date.now() < deadline) {
    const state = await page.evaluate(() => {
      const sim = window.__game.sim;
      const input = window.__game.input;
      const p = sim.player;
      const mob = p.targetId !== null ? sim.entities.get(p.targetId) : null;
      return {
        pos: { x: +p.pos.x.toFixed(2), z: +p.pos.z.toFixed(2) },
        distance: mob ? Math.hypot(p.pos.x - mob.pos.x, p.pos.z - mob.pos.z) : null,
        autoAttack: p.autoAttack,
        clickMoveTarget: input.clickMoveTarget,
        clickMoveAttack: input.clickMoveAttack,
      };
    });
    if (n % 5 === 0) console.log('poll', n, state);
    n++;
    if (state.autoAttack && state.distance !== null && state.distance < 6) return state;
    if (!state.clickMoveAttack && !state.autoAttack) {
      await page.evaluate(() => window.__game.hud.castSlot(0));
    }
    await sleep(200);
  }
  return null;
})();
console.log('outcome', outcome);
check(outcome !== null, 'player walked into melee range and engaged auto-attack');

await sleep(600); // let a swing or two land so the AFTER shot shows live combat

await page.screenshot({ path: `${OUT_DIR}/after-desktop.png` });
console.log('wrote after-desktop.png');

await browser.close();

if (fails.length) {
  console.error(`\n${fails.length} check(s) failed:`);
  for (const f of fails) console.error(' -', f);
  process.exit(1);
}
console.log('\nAll checks passed.');
