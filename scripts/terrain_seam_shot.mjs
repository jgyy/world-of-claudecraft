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

const URL = process.env.GAME_URL ?? 'http://localhost:5173';
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
await page.click('#btn-start-offline');
await page.waitForFunction(() => window.__game && window.__game.sim && window.__game.sim.player,
  { timeout: 90000 });
await sleep(800);

const staged = await page.evaluate(async () => {
  const w = await import('/src/sim/world.ts');
  const d = await import('/src/sim/data.ts');
  const g = window.__game;
  const sim = g.sim;
  const seed = sim.cfg.seed;
  const p = sim.player;
  const gh = (x, z) => w.groundHeight(x, z, seed);

  // The first zone-boundary ridge crest, off to the side of the central pass
  // where the wall is tall (the worst chord-sag point from the unit test).
  const ridgeZ = d.ZONES[0].zMax;
  let best = null;
  for (let x = 20; x <= 160; x += 1) {
    for (let dz = -8; dz <= 8; dz += 1) {
      const z = ridgeZ + dz;
      const h = gh(x, z);
      // local convexity along x at this crest (what the chord sags under)
      const sag = h - 0.5 * (gh(x - 3.5, z) + gh(x + 3.5, z));
      if (!best || sag > best.sag) best = { x, z, h, sag };
    }
  }

  // The seam runs ALONG x at constant z (the ridge latitude), so to read it as
  // a long receding line (as in the report) the camera looks DOWN the ridge
  // (+x), grazing the crest, not into the wall. Stand on the crest a touch
  // downhill so the wall surface beyond stays in view.
  const px = best.x, pz = best.z - 2;
  p.pos.x = px; p.pos.z = pz; p.pos.y = gh(px, pz);
  const r = g.renderer;
  const yaw = Math.PI / 2; // look toward +x, along the ridge
  p.facing = yaw;
  r.camYaw = yaw;
  r.camPitch = 0.04; // low, grazing angle
  r.camDist = 10;

  // god-mode so ridge mobs don't kill the camera, and pin the player so a few
  // frames of input/AI cannot drift the framing.
  p.hp = p.maxHp = 100000;
  if (!g.__seamHooked) {
    g.__seamHooked = true;
    const origSync = r.sync.bind(r);
    r.sync = (...args) => {
      p.pos.x = px; p.pos.z = pz; p.pos.y = gh(px, pz);
      p.facing = yaw;
      origSync(...args);
    };
  }
  return { ok: true, best, px, pz };
});
console.log('staged:', JSON.stringify(staged));
if (!staged.ok) { await browser.close(); process.exit(1); }

await sleep(1200); // let camera/terrain settle
await page.screenshot({ path: `tmp/terrain-seam-${TAG}.png` });
console.log(`wrote tmp/terrain-seam-${TAG}.png`);
await browser.close();
