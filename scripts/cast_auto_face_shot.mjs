// Verification + screenshot harness for "caster does not auto-face the target".
//
// Boots the offline world as a mage at max graphics (?gfx=ultra). Targets a
// nearby mob, turns the caster completely away (~180deg), then casts a targeted
// spell. With the fix the sim pivots the caster to face the target on cast, so
// the projectile leaves from the front instead of the shoulder; before the fix
// the cast was rejected with "You must be facing your target." and the model
// kept its backward facing. Samples the sim facing before/after and captures an
// in-world ultra-graphics screenshot of the character mid-cast facing the mob.
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import { BROWSER_PATH } from './browser_path.mjs';

const URL = (process.env.GAME_URL ?? 'http://localhost:5173') + '/?gfx=ultra';
fs.mkdirSync('tmp', { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({
  executablePath: BROWSER_PATH,
  headless: 'new',
  args: ['--window-size=1600,900', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
    '--no-sandbox', '--disable-crash-reporter', '--disable-breakpad', '--no-crashpad',
    `--user-data-dir=${process.env.SHOT_PROFILE_DIR ?? '/tmp/cast-auto-face-profile'}`],
  defaultViewport: { width: 1600, height: 900, deviceScaleFactor: 2 },
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGEERROR:', e.message));
page.on('console', (m) => { if (m.type() === 'error') console.log('CONSOLE:', m.text()); });

await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForSelector('#btn-offline', { timeout: 60000 });
await page.evaluate(() => document.querySelector('#btn-offline').click());
await sleep(300);
await page.type('#char-name', 'Pyrwyn');
await page.click('#offline-select .mini-class[data-class="mage"]');
await page.click('#btn-start-offline');
await page.waitForFunction(() => window.__game?.hud && window.__game?.renderer, { timeout: 60000 });
await sleep(2500);

const result = await page.evaluate(() => {
  const g = window.__game;
  const w = g.world;
  const p = w.player;
  // Pick the nearest living mob and stand at fireball range from it.
  let mob = null, best = Infinity;
  for (const e of w.entities.values()) {
    if (e.kind !== 'mob' || e.dead) continue;
    const dx = e.pos.x - p.pos.x, dz = e.pos.z - p.pos.z;
    const d = Math.hypot(dx, dz);
    if (d < best) { best = d; mob = e; }
  }
  if (!mob) return { error: 'no mob found' };
  // Stand 15yd east of the mob, on the ground, and turn fully away from it.
  p.pos.x = mob.pos.x + 15; p.pos.z = mob.pos.z;
  p.prevPos = { ...p.pos };
  const toward = Math.atan2(mob.pos.x - p.pos.x, mob.pos.z - p.pos.z);
  p.facing = toward + Math.PI; p.prevFacing = p.facing;
  w.targetEntity(mob.id);
  const facingBefore = p.facing;
  const wrap = (a) => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };
  // Cast a targeted spell while turned away.
  w.castAbility('fireball');
  const facingAfter = p.facing;
  return {
    mobId: mob.id,
    toward,
    facingBefore,
    facingAfter,
    gapBefore: Math.abs(wrap(facingBefore - toward)),
    gapAfter: Math.abs(wrap(facingAfter - toward)),
    casting: p.castingAbility ?? null,
  };
});

console.log('=== cast auto-face verification (ultra build) ===');
console.log(JSON.stringify(result, null, 2));
const ok = !result.error
  && result.gapBefore > Math.PI - 0.2      // started fully turned away
  && result.gapAfter < 1e-3                 // pivoted to face the target on cast
  && result.casting === 'fireball';         // and the cast proceeded
console.log('PASS:', ok);

// Let the cast play out a beat so the projectile is in flight from the front,
// then frame the character for a clean ultra-graphics screenshot.
await page.evaluate(() => {
  const r = window.__game.renderer;
  if ('camDist' in r) r.camDist = 16;
  if ('camPitch' in r) r.camPitch = 0.30;
});
await sleep(700);
await page.screenshot({ path: 'tmp/cast-auto-face-ultra.png' });
console.log('screenshot -> tmp/cast-auto-face-ultra.png');

await browser.close();
process.exit(ok ? 0 : 1);
