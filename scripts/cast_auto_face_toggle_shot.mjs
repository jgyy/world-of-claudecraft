// Verification + screenshot harness for the "Auto-Face Target on Cast" toggle.
//
// Boots the offline world as a mage at max graphics (?gfx=ultra). For each
// toggle state it stands at fireball range, turns the caster ~180deg away from
// a nearby mob, applies the preference via world.setAutoFaceOnCast(...), then
// casts a targeted spell and samples the sim before/after:
//   ON  -> the caster pivots to face the target and the cast proceeds (the
//          projectile leaves from the front). Screenshot: tmp/cast-auto-face-on.png
//   OFF -> the classic facing requirement applies; the off-arc cast is rejected
//          and the caster keeps its backward facing. Screenshot: tmp/cast-auto-face-off.png

import fs from 'node:fs';
import puppeteer from 'puppeteer-core';
import { BROWSER_PATH } from './browser_path.mjs';

const URL = (process.env.GAME_URL ?? 'http://localhost:5173') + '/?gfx=ultra';
fs.mkdirSync('tmp', { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({
  executablePath: BROWSER_PATH,
  headless: 'new',
  args: [
    '--window-size=1600,900',
    '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader',
    '--no-sandbox',
    '--disable-crash-reporter',
    '--disable-breakpad',
    '--no-crashpad',
    `--user-data-dir=${process.env.SHOT_PROFILE_DIR ?? '/tmp/cast-auto-face-toggle-profile'}`,
  ],
  defaultViewport: { width: 1600, height: 900, deviceScaleFactor: 2 },
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGEERROR:', e.message));
page.on('console', (m) => {
  if (m.type() === 'error') console.log('CONSOLE:', m.text());
});

await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForSelector('#btn-offline', { timeout: 60000 });
await page.evaluate(() => document.querySelector('#btn-offline').click());
await sleep(300);
await page.type('#char-name', 'Pyrwyn');
await page.click('#offline-select .mini-class[data-class="mage"]');
await page.click('#btn-start-offline');
await page.waitForFunction(() => window.__game?.hud && window.__game?.renderer, { timeout: 60000 });
await sleep(2500);

// Run one cast attempt with the given preference; returns the sim before/after.
async function castWith(enabled) {
  return page.evaluate((enabled) => {
    const g = window.__game;
    const w = g.world;
    const p = w.player;
    let mob = null,
      best = Infinity;
    for (const e of w.entities.values()) {
      if (e.kind !== 'mob' || e.dead) continue;
      const dx = e.pos.x - p.pos.x,
        dz = e.pos.z - p.pos.z;
      const d = Math.hypot(dx, dz);
      if (d < best) {
        best = d;
        mob = e;
      }
    }
    if (!mob) return { error: 'no mob found' };
    // Stand 15yd east of the mob, on the ground, turned fully away from it.
    p.pos.x = mob.pos.x + 15;
    p.pos.z = mob.pos.z;
    p.prevPos = { ...p.pos };
    const toward = Math.atan2(mob.pos.x - p.pos.x, mob.pos.z - p.pos.z);
    p.facing = toward + Math.PI;
    p.prevFacing = p.facing;
    p.castingAbility = null;
    p.castRemaining = 0;
    p.castTotal = 0;
    w.targetEntity(mob.id);
    w.setAutoFaceOnCast(enabled);
    const facingBefore = p.facing;
    const wrap = (a) => {
      while (a > Math.PI) a -= 2 * Math.PI;
      while (a < -Math.PI) a += 2 * Math.PI;
      return a;
    };
    w.castAbility('fireball');
    const facingAfter = p.facing;
    return {
      toward,
      facingBefore,
      facingAfter,
      gapBefore: Math.abs(wrap(facingBefore - toward)),
      gapAfter: Math.abs(wrap(facingAfter - toward)),
      casting: p.castingAbility ?? null,
    };
  }, enabled);
}

async function frameAndShoot(path) {
  await page.evaluate(() => {
    const r = window.__game.renderer;
    if ('camDist' in r) r.camDist = 16;
    if ('camPitch' in r) r.camPitch = 0.3;
  });
  await sleep(700);
  await page.screenshot({ path });
}

// ON: auto-face pivots to the target and the cast proceeds.
const on = await castWith(true);
console.log('=== auto-face ON ===');
console.log(JSON.stringify(on, null, 2));
await frameAndShoot('tmp/cast-auto-face-on.png');
console.log('screenshot -> tmp/cast-auto-face-on.png');

// OFF: classic facing requirement; the off-arc cast is rejected, facing unchanged.
const off = await castWith(false);
console.log('=== auto-face OFF (classic) ===');
console.log(JSON.stringify(off, null, 2));
await frameAndShoot('tmp/cast-auto-face-off.png');
console.log('screenshot -> tmp/cast-auto-face-off.png');

const ok =
  !on.error &&
  !off.error &&
  on.gapBefore > Math.PI - 0.2 &&
  on.gapAfter < 1e-3 &&
  on.casting === 'fireball' &&
  off.gapBefore > Math.PI - 0.2 &&
  off.gapAfter > Math.PI - 0.2 &&
  off.casting === null;
console.log('PASS:', ok);

await browser.close();
process.exit(ok ? 0 : 1);
