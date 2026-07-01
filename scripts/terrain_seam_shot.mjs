// Before/after proof for the terrain LOD seam fix.
//
// At a chunk LOD boundary that crosses the convex zone-boundary mountain ridge,
// the OLD fixed 0.3u skirt was overrun by the coarse neighbour's chord sag, so
// the background showed through as a thin bright line running the width of the
// map at that latitude (mirrored on both sides of the central pass). The fix
// (src/render/terrain_skirt.ts) sizes each skirt vertex to its local chord sag.
//
// This drives the REAL offline renderer and frames a ridge LOD boundary. It does
// not toggle anything in-page: run it once on the fixed tree and once on the
// pre-fix tree (the orchestration in the PR notes git-stashes the source between
// runs) so the SAME camera captures both. Writes tmp/terrain-seam-<tag>.png.
//
// Needs `npm run dev`. Override the port with GAME_URL, the output tag with TAG.
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import { BROWSER_PATH } from './browser_path.mjs';

// High tier to match the live client where the seam was reported. GFX override
// via GFX env (e.g. GFX=low). The report's HUD coords land on a LOD boundary.
const URL = (process.env.GAME_URL ?? 'http://localhost:5173')
  + (process.env.GFX ? `?gfx=${process.env.GFX}` : '');
// Anchor on the Mirefen/Thornpeak ridge crest (z=540) near the reported x, the
// mountain wall the bug screenshot looks NW toward. Override with AX/AZ.
const ANCHOR = { x: Number(process.env.AX ?? 110), z: Number(process.env.AZ ?? 540) };
const TAG = process.env.TAG ?? 'after';
fs.mkdirSync('tmp', { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({
  executablePath: BROWSER_PATH,
  headless: 'new',
  args: ['--window-size=1280,820', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  defaultViewport: { width: 1280, height: 820 },
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGEERROR:', e.message));
page.on('console', (m) => { if (m.type() === 'error') console.log('CONSOLE:', m.text()); });

await page.goto(URL, { waitUntil: 'networkidle0', timeout: 30000 });
await page.evaluate(() => document.querySelector('#btn-offline').click());
await sleep(300);
await page.type('#char-name', 'Seamwatch');
await page.evaluate(() => {
  const el = document.querySelector('#offline-select .mini-class[data-class="mage"]');
  if (el) el.click();
});
await page.evaluate(() => document.querySelector('#btn-start-offline').click());
await page.waitForFunction(() => window.__game && window.__game.sim && window.__game.sim.player,
  { timeout: 150000 });
await sleep(800);

const staged = await page.evaluate(async (ANCHOR) => {
  const w = await import('/src/sim/world.ts');
  const g = window.__game;
  const sim = g.sim;
  const seed = sim.cfg.seed;
  const p = sim.player;
  const gh = (x, z) => w.groundHeight(x, z, seed);

  // Anchor at the reported location and look NW (as in the bug screenshot). Use
  // the anchor directly as the focus point; it sits on a LOD band boundary.
  const best = { bx: ANCHOR.x, z: ANCHOR.z, jump: 0, score: 0 };

  // god-mode so mobs don't kill the camera; pin the player and drive the camera
  // from g.__seamCam so the Node side can sweep angles without restaging.
  p.hp = p.maxHp = 100000;
  g.__seamGh = (x, z) => gh(x, z);
  g.__seamBest = best;
  g.__seamCam = { px: best.bx, pz: best.z - 16, yaw: 0, pitch: 0.18, dist: 8 };
  if (!g.__seamHooked) {
    g.__seamHooked = true;
    const r = g.renderer;
    const origSync = r.sync.bind(r);
    r.sync = (...args) => {
      const c = g.__seamCam;
      p.pos.x = c.px; p.pos.z = c.pz; p.pos.y = g.__seamGh(c.px, c.pz);
      p.facing = c.yaw;
      r.camYaw = c.yaw; r.camPitch = c.pitch; r.camDist = c.dist;
      origSync(...args);
    };
  }
  return { ok: true, best };
}, ANCHOR);
console.log('staged:', JSON.stringify(staged));
if (!staged.ok) { await browser.close(); process.exit(1); }

// Sweep camera presets around the anchor, mostly looking NW (yaw -pi/4) as in
// the bug screenshot, at grazing angles; one run yields a contact sheet.
// Stand in the Mirefen valley SOUTH of the ridge crest and look N/NW at the
// mountain wall (matching the report), at gameplay camera angles.
const N = 0, NW = -Math.PI / 4;
const presets = [
  { dz: -55, yaw: N, pitch: 0.16, dist: 9 },   // valley, look N at the wall
  { dz: -55, yaw: NW, pitch: 0.16, dist: 9 },  // look NW (as reported)
  { dz: -40, yaw: N, pitch: 0.10, dist: 8 },   // closer, flatter
  { dz: -75, yaw: N, pitch: 0.22, dist: 11 },  // farther back, more sky
  { dz: -55, yaw: NW, pitch: 0.08, dist: 8 },  // NW, grazing
  { dz: -55, yaw: 0.4, pitch: 0.16, dist: 9 }, // pan NE
];
const only = process.env.FRAME != null ? [Number(process.env.FRAME)] : presets.map((_, i) => i);
for (const i of only) {
  const c = presets[i];
  await page.evaluate((c) => {
    const b = window.__game.__seamBest;
    window.__game.__seamCam = {
      px: b.bx + (c.dx ?? 0), pz: b.z + (c.dz ?? 0),
      yaw: c.yaw, pitch: c.pitch, dist: c.dist,
    };
  }, c);
  await sleep(700);
  const out = process.env.FRAME != null ? `tmp/terrain-seam-${TAG}.png` : `tmp/seam-f${i}-${TAG}.png`;
  await page.screenshot({ path: out });
  console.log('wrote', out);
}
await browser.close();
