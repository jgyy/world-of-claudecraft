// PR evidence for the delve-slot residency fix: DELVE_SLOT_COUNT is a fixed,
// server-wide pool, so a slot a finished run vacates is claimed by the NEXT
// party's run, which re-shuffles its own module order (pickDelveModules).
// Simulates exactly that reuse in one instance slot: a first run claims the
// slot with modules [litany_sluice, litany_apse], then the SAME slot is
// reclaimed by a second run with the order reversed
// [litany_apse, litany_sluice]. Module index 0's WORLD Z OFFSET is always
// DELVE_MODULE_Z_START regardless of order, so it is the cleanest single
// comparison point: only its IDENTITY changes (sluice in the first run,
// apse in the second). Before the fix, litany_sluice was already marked
// "built" at that exact key from the first run, so the second build skips
// rebuilding it there; the screenshot at that fixed world position shows
// whichever module is ACTUALLY resident: the stale crescent sluice (bug) or
// the freshly rebuilt asymmetric apse boss room (fix).
//
// Camera framing mirrors the proven shotModule recipe in
// drowned_litany_shots.mjs (stand at the module's entry, face up-room).
//
// Needs `npm run dev` on :5173 (override with GAME_URL). Writes to tmp/.
import fs from 'node:fs';
import puppeteer from 'puppeteer-core';
import { BROWSER_PATH } from './browser_path.mjs';
import { enterOfflineGame } from './enter_offline_game.mjs';

const URL = process.env.GAME_URL ?? 'http://localhost:5173';
const OUT = process.env.SHOTS_DIR ?? 'tmp';
const LABEL = process.env.SHOT_LABEL ?? 'unlabeled';
fs.mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({
  executablePath: BROWSER_PATH,
  headless: 'new',
  protocolTimeout: 60000,
  args: [
    '--window-size=1280,820',
    '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader',
    '--disable-background-timer-throttling',
    '--disable-renderer-backgrounding',
  ],
  defaultViewport: { width: 1280, height: 820 },
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGEERR', e.message.slice(0, 300)));
page.on('console', (m) => {
  if (m.type() === 'error') console.log('CONSOLEERR', m.text().slice(0, 300));
});

// Lowest graphics preset, per the repo's standing capture rule.
await page.evaluateOnNewDocument(() => {
  try {
    localStorage.setItem('woc_settings', JSON.stringify({ graphicsPreset: 1 }));
  } catch {
    /* ignore */
  }
});

await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
const booted = await enterOfflineGame(page, {
  charClass: 'warrior',
  charName: 'Slotcheck',
  gameBootTimeoutMs: 60000,
});
if (!booted) throw new Error('offline world did not boot');
await sleep(500);

await page.evaluate(async () => {
  const data = await import('/src/sim/data.ts');
  const layout = await import('/src/sim/delve_litany_layout.ts');
  window.__delveModuleZOffset = data.delveModuleZOffset;
  window.__LITANY_BOUNDS = layout.litanyModuleBounds;
});

const info = await page.evaluate(() => {
  const g = window.__game;
  const sim = g.sim;
  sim.setPlayerLevel(14);
  sim.enterDelve('drowned_litany', 'normal');
  const run = sim.delveRunForPlayer(sim.playerId);
  return { origin: { ...run.origin } };
});

// Stand at module index 0's entry (mirrors drowned_litany_shots.mjs's
// shotModule) and screenshot: this world position's z-offset never moves
// between orders (always DELVE_MODULE_Z_START), so it is the exact spot
// where a stale/correct rebuild is visible.
async function shootModuleZero(filename) {
  await page.evaluate(
    ({ filename, origin }) => {
      const sim = window.__game.sim;
      const run = sim.delveRunForPlayer(sim.playerId);
      const id = run.modules[0];
      const b = window.__LITANY_BOUNDS(id);
      const zBase = window.__delveModuleZOffset(run.modules, 0);
      const p = sim.player;
      p.pos.x = origin.x;
      p.pos.z = origin.z + zBase + b.zMin + 8;
      p.pos.y = 0;
      p.prevPos = { ...p.pos };
      p.facing = 0; // look up-room (+z)
      p.prevFacing = 0;
      window.__shotModuleId = id;
    },
    { filename, origin: info.origin },
  );
  await sleep(1700); // let the chase cam swing around, matching shotModule
  await page.screenshot({ path: `${OUT}/${filename}` });
  console.log('shot', filename);
}

// Run 1 claims the slot with ORDER_A: real entry calls prebuildDelveInteriors
// from the 'delveEntered' event handler; TS `private` is a compile-time-only
// restriction, so call it directly like the other live-browser PR-evidence
// scripts do (see ios_zone_eviction_shot.mjs).
await page.evaluate(() => {
  const g = window.__game;
  const sim = g.sim;
  const run = sim.delveRunForPlayer(sim.playerId);
  run.modules = ['litany_sluice', 'litany_apse'];
  run.moduleIndex = 0;
  g.renderer.prebuildDelveInteriors('drowned_litany');
});
await sleep(3500); // let both modules finish their async GLB builds

await shootModuleZero(`drowned-litany-slot-reuse-${LABEL}-1-first-run-sluice.png`);

// Slot reused: a SECOND run claims the SAME slot with the order reversed.
// Module index 0 is now litany_apse, at the SAME world z-offset sluice
// occupied a moment ago. This is the exact scenario pickDelveModules
// produces on a recycled slot.
await page.evaluate(() => {
  const g = window.__game;
  const sim = g.sim;
  const run = sim.delveRunForPlayer(sim.playerId);
  run.modules = ['litany_apse', 'litany_sluice'];
  run.moduleIndex = 0;
  g.renderer.prebuildDelveInteriors('drowned_litany');
});
await sleep(3500);

await shootModuleZero(`drowned-litany-slot-reuse-${LABEL}-2-slot-reused-apse-expected.png`);

await browser.close();
console.log('done');
