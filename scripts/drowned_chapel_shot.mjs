// Screenshot harness for the Drowned Chapel (Zone 2 Mirefen Marsh ruin
// compound): a real 2-story voxel building that replaced the old freestanding
// perimeter wall. Boots the offline world, teleports the player/camera around
// the widened building and its interior Tripo-prop furnishings, and takes one
// shot per configured camera setup.
//
// Layout after the rework: center (100, 435), half-extent 8 (footprint x in
// [92,108], z in [427,443]); taller ground floor (5.5) plus an upper floor
// (4.5); door on the north wall (z=443); staircase landing near (96.5, 431.5).
//
// Two camera notes:
//  - EXTERIOR shots stand the player OUTSIDE the footprint so the free
//    open-world zoom applies (the indoor camera clamp is a no-op outdoors).
//  - INTERIOR shots stand the player INSIDE the footprint. The game's indoor
//    camera clamp then caps the zoom-out/pitch for safety, which is exactly
//    what we are demonstrating: even a deliberately extreme requested zoom/
//    pitch resolves to a readable interior, never the old ceiling/floor slit.
//  - For the upper-floor framing shots p.pos.y is raised by the ground-story
//    height so the camera sits on floor 2; a screenshot-only camera aid (same
//    precedent as clearing camp mobs below), not a movement-physics claim.

import fs from 'node:fs';
import puppeteer from 'puppeteer-core';
import { BROWSER_PATH } from './browser_path.mjs';

const URL = (process.env.GAME_URL ?? 'http://localhost:5173') + '/?gfx=high';
fs.mkdirSync('docs/screenshots', { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const GROUND_H = 5.5; // CHAPEL_GROUND_FLOOR_HEIGHT

const SHOTS = [
  // ---- Exterior wide / aerial (player OUTSIDE the footprint) ----
  {
    name: 'chapel-exterior-wide-north',
    x: 100,
    z: 458,
    camYaw: Math.PI,
    camDist: 26,
    camPitch: 0.4,
  },
  { name: 'chapel-exterior-wide-south', x: 100, z: 412, camYaw: 0, camDist: 26, camPitch: 0.4 },
  {
    name: 'chapel-exterior-wide-east',
    x: 124,
    z: 435,
    camYaw: -Math.PI / 2,
    camDist: 26,
    camPitch: 0.4,
  },
  {
    name: 'chapel-exterior-wide-west',
    x: 76,
    z: 435,
    camYaw: Math.PI / 2,
    camDist: 26,
    camPitch: 0.4,
  },
  { name: 'chapel-aerial-overview', x: 100, z: 462, camYaw: Math.PI, camDist: 40, camPitch: 1.0 },
  {
    name: 'chapel-flat-terrain-base',
    x: 100,
    z: 452,
    camYaw: Math.PI,
    camDist: 18,
    camPitch: 0.12,
  },

  // ---- Entrance / door (outside, approaching north) ----
  { name: 'chapel-entrance-approach', x: 100, z: 451, camYaw: Math.PI, camDist: 16, camPitch: 0.2 },
  { name: 'chapel-door-close', x: 100, z: 447, camYaw: Math.PI, camDist: 7, camPitch: 0.1 },

  // ---- Open (unglazed) windows, outside and inside ----
  {
    name: 'chapel-window-exterior',
    x: 116,
    z: 431,
    camYaw: -Math.PI / 2,
    camDist: 8,
    camPitch: 0.18,
  },
  {
    name: 'chapel-window-exterior-upper',
    x: 100,
    z: 452,
    camYaw: Math.PI,
    camDist: 14,
    camPitch: 0.5,
  },
  {
    name: 'chapel-window-interior',
    x: 104,
    z: 435,
    camYaw: Math.PI / 2,
    camDist: 4,
    camPitch: 0.1,
  },

  // ---- Interior, ground floor (inside; clamp keeps it readable) ----
  { name: 'chapel-ground-floor-wide', x: 100, z: 437, camYaw: Math.PI, camDist: 9, camPitch: 0.12 },
  { name: 'chapel-interior-brighter', x: 100, z: 438, camYaw: Math.PI, camDist: 6, camPitch: 0.15 },
  // The old degenerate request (dist 30, hard pitch) now resolves, via the
  // indoor clamp, to a normal readable interior instead of a ceiling slit.
  {
    name: 'chapel-interior-safe-was-badcam',
    x: 100,
    z: 437,
    camYaw: 3.0,
    camDist: 30,
    camPitch: 0.45,
  },
  {
    name: 'chapel-interior-safe-lookdown',
    x: 100,
    z: 437,
    camYaw: 0.4,
    camDist: 28,
    camPitch: -0.4,
  },

  // ---- The staircase with railings, multiple angles (shallower 30-35 degree pitch) ----
  { name: 'chapel-staircase-ground', x: 96.5, z: 433, camYaw: -0.6, camDist: 7, camPitch: 0.16 },
  { name: 'chapel-staircase-side', x: 101, z: 433, camYaw: 1.5, camDist: 8, camPitch: 0.12 },
  {
    name: 'chapel-staircase-railing-close',
    x: 94.5,
    z: 435,
    camYaw: 0.9,
    camDist: 4,
    camPitch: 0.1,
  },

  // ---- Upper floor (camera raised to floor 2) ----
  {
    name: 'chapel-upper-floor-wide',
    x: 100,
    z: 437,
    y: 'floor2',
    camYaw: Math.PI,
    camDist: 8,
    camPitch: 0.12,
  },
  {
    name: 'chapel-upper-floor-landing',
    x: 96.5,
    z: 437,
    y: 'floor2',
    camYaw: 1.0,
    camDist: 6,
    camPitch: 0.1,
  },

  // ---- Each relocated interior Tripo prop ----
  {
    name: 'chapel-sanctum-altar-statue',
    x: 100,
    z: 435,
    camYaw: Math.PI,
    camDist: 7,
    camPitch: 0.12,
  },
  { name: 'chapel-archway-entrance', x: 100, z: 439, camYaw: Math.PI, camDist: 5, camPitch: 0.12 },
  { name: 'chapel-obelisk-colonnade', x: 100, z: 435, camYaw: 2.2, camDist: 8, camPitch: 0.14 },
  { name: 'chapel-braziers-stairs', x: 100, z: 434, camYaw: 2.4, camDist: 6, camPitch: 0.12 },
  { name: 'chapel-pedestal-well-aisle', x: 98, z: 433, camYaw: 1.3, camDist: 6, camPitch: 0.12 },
  { name: 'chapel-urn-rubble-aisle', x: 102, z: 433, camYaw: -1.3, camDist: 6, camPitch: 0.12 },
  {
    name: 'chapel-gravemarker-bench-aisle',
    x: 100,
    z: 436,
    camYaw: 0.7,
    camDist: 7,
    camPitch: 0.12,
  },
  { name: 'chapel-wallfragment-aisle', x: 103, z: 431, camYaw: -0.8, camDist: 5, camPitch: 0.12 },
];

const browser = await puppeteer.launch({
  executablePath: BROWSER_PATH,
  headless: 'new',
  args: [
    '--window-size=1600,900',
    '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader',
    '--disable-dev-shm-usage',
  ],
  defaultViewport: { width: 1600, height: 900, deviceScaleFactor: 1 },
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
await page.type('#char-name', 'Chapelwatch');
await page.click('#offline-select .mini-class[data-class="warrior"]');
await page.click('#btn-start-offline');
await page.waitForFunction(() => window.__game?.hud && window.__game?.renderer, {
  timeout: 120000,
});
// Extra headroom (beyond the base settle): the chapel's voxel building mesh
// builds asynchronously, and an isolated single-shot run (SHOT_START/SHOT_END
// slicing a single index, used to work around swiftshader crashing on a long
// batch in this sandbox) has no prior shots to absorb that build time, so the
// very first teleport can land before the building mesh exists.
await sleep(4000);

// skip the new-adventurer tutorial popup and clear the drowned-dead camp mobs
// near the chapel, screenshot-only cleanup (this is a visual verification
// script, not a gameplay test)
await page.evaluate(() => {
  const skip = [...document.querySelectorAll('button')].find((b) =>
    b.textContent?.includes('Skip Tutorial'),
  );
  skip?.click();
  const sim = window.__game.sim;
  for (const [id, e] of sim.entities) {
    if (e.kind === 'mob' && Math.hypot(e.pos.x - 100, e.pos.z - 435) < 75) {
      sim.entities.delete(id);
    }
  }
});
await sleep(300);
await page.addStyleTag({
  content: '#chat-window, #quest-tracker, .fct-layer { display: none !important; }',
});

// Warm-up teleport: the chapel's voxel building mesh builds asynchronously the
// first time a player enters its footprint, so the very FIRST teleport of a
// session (before that mesh exists yet) would otherwise render as open
// exterior terrain instead of the building interior. Priming with one
// discarded teleport+settle before the real shot loop fixes every shot,
// including an isolated single-shot SHOT_START/SHOT_END run.
await page.evaluate(() => {
  const p = window.__game.sim.player;
  p.pos.x = 100;
  p.pos.z = 435;
  window.__game.sim.tick();
});
await sleep(1500);

// Optional SHOT_START/SHOT_END env slicing: swiftshader's software GL context
// occasionally drops mid-run on a long batch in this sandbox; splitting into
// smaller batches works around it without changing what gets captured.
const shotStart = Number(process.env.SHOT_START ?? 0);
const shotEnd = Number(process.env.SHOT_END ?? SHOTS.length);
for (const shot of SHOTS.slice(shotStart, shotEnd)) {
  await page.evaluate(
    (s, groundH) => {
      const p = window.__game.sim.player;
      p.pos.x = s.x;
      p.pos.z = s.z;
      if (s.y === 'floor2') {
        // camera-only aid to frame the upper floor for this screenshot; see
        // module header
        p.pos.y += groundH;
      }
      p.facing = s.camYaw;
      window.__game.input.camYaw = s.camYaw;
      window.__game.input.camDist = s.camDist;
      window.__game.input.camPitch = s.camPitch;
      if (s.y !== 'floor2') {
        for (let i = 0; i < 5; i++) window.__game.sim.tick();
      }
    },
    shot,
    GROUND_H,
  );
  // let the sim settle the chapelFloor flag and the camera clamp
  await sleep(900);
  const path = `docs/screenshots/${shot.name}.png`;
  await page.screenshot({ path });
  console.log(`screenshot -> ${path}`);
}

await browser.close();
