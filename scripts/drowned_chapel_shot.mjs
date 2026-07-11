// Screenshot harness for the Drowned Chapel (Zone 2 Mirefen Marsh ruin
// compound): a real 2-story voxel building that replaced the old
// freestanding perimeter wall. Boots the offline world, teleports the
// player/camera around the building and its Tripo-prop furnishings, and
// takes one shot per configured camera setup. Same pattern as the prior
// ruin_decor_shot.mjs, extended to cover the building.
//
// For the two upper-floor interior shots this script sets p.pos.y directly
// to the floor-2 walkable height (chapelFloorY) so the camera frames the
// interior correctly; this is a screenshot-only camera aid (matching the
// existing "screenshot-only cleanup" precedent in ruin_decor_shot.mjs for
// clearing camp mobs), not a claim about normal player movement physics.

import fs from 'node:fs';
import puppeteer from 'puppeteer-core';
import { BROWSER_PATH } from './browser_path.mjs';

const URL = (process.env.GAME_URL ?? 'http://localhost:5173') + '/?gfx=ultra';
fs.mkdirSync('docs/screenshots', { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Chapel center (100, 435), half-extent 6: door on the north wall (z=441),
// staircase landing near (96.5, 431.5). Floor-2 world Y (seed 42, the
// offline default) is used for the two interior-upstairs shots.
const SHOTS = [
  // Exterior wide/aerial from multiple angles
  { name: 'chapel-exterior-wide-north', x: 100, z: 435, camYaw: 0.3, camDist: 30, camPitch: 0.45 },
  {
    name: 'chapel-exterior-wide-south',
    x: 100,
    z: 435,
    camYaw: Math.PI + 0.3,
    camDist: 30,
    camPitch: 0.45,
  },
  {
    name: 'chapel-exterior-wide-east',
    x: 100,
    z: 435,
    camYaw: Math.PI / 2,
    camDist: 28,
    camPitch: 0.4,
  },
  {
    name: 'chapel-exterior-wide-west',
    x: 100,
    z: 435,
    camYaw: -Math.PI / 2,
    camDist: 28,
    camPitch: 0.4,
  },
  { name: 'chapel-aerial-overview', x: 100, z: 435, camYaw: 0.6, camDist: 42, camPitch: 1.1 },

  // Entrance / door
  { name: 'chapel-entrance-approach', x: 100, z: 448, camYaw: 0.1, camDist: 20, camPitch: 0.25 },
  { name: 'chapel-door-close', x: 100, z: 444, camYaw: 0.1, camDist: 8, camPitch: 0.12 },

  // Ground floor, wide + close
  { name: 'chapel-ground-floor-wide', x: 100, z: 436, camYaw: 3.0, camDist: 9, camPitch: 0.15 },
  {
    name: 'chapel-ground-floor-sanctum-close',
    x: 100,
    z: 434,
    camYaw: 3.05,
    camDist: 5,
    camPitch: 0.1,
  },

  // The staircase
  { name: 'chapel-staircase-ground', x: 98, z: 432, camYaw: -0.7, camDist: 6, camPitch: 0.2 },

  // Upper floor, wide + close (camera pos.y forced to floor 2 height)
  {
    name: 'chapel-upper-floor-wide',
    x: 100,
    z: 436,
    y: 'floor2',
    camYaw: 3.0,
    camDist: 8,
    camPitch: 0.1,
  },
  {
    name: 'chapel-upper-floor-close',
    x: 97,
    z: 435,
    y: 'floor2',
    camYaw: 1.2,
    camDist: 5,
    camPitch: 0.08,
  },

  // Carved windows, inside and outside
  { name: 'chapel-window-interior', x: 103, z: 435, camYaw: 1.6, camDist: 4.5, camPitch: 0.1 },
  { name: 'chapel-window-exterior', x: 108, z: 433, camYaw: -1.6, camDist: 8, camPitch: 0.2 },

  // Each Tripo prop placement
  { name: 'chapel-sanctum-altar-statue', x: 100, z: 429, camYaw: 3.0, camDist: 7, camPitch: 0.12 },
  {
    name: 'chapel-braziers-flanking-stairs',
    x: 99,
    z: 436,
    camYaw: 2.2,
    camDist: 6,
    camPitch: 0.12,
  },
  { name: 'chapel-landing-pedestal-urn', x: 97, z: 432, camYaw: 0.5, camDist: 5, camPitch: 0.1 },
  {
    name: 'chapel-obelisk-colonnade-gate',
    x: 100,
    z: 450,
    camYaw: 0.9,
    camDist: 14,
    camPitch: 0.3,
  },
  { name: 'chapel-well-satellite', x: 90, z: 435, camYaw: 1.57, camDist: 10, camPitch: 0.2 },
  { name: 'chapel-graveyard-satellite', x: 110, z: 428, camYaw: -1.3, camDist: 10, camPitch: 0.2 },
  { name: 'chapel-bench-approach', x: 100, z: 448, camYaw: -0.6, camDist: 10, camPitch: 0.2 },
];

const browser = await puppeteer.launch({
  executablePath: BROWSER_PATH,
  headless: 'new',
  args: ['--window-size=1600,900', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
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
await page.type('#char-name', 'Chapelwatch');
await page.click('#offline-select .mini-class[data-class="warrior"]');
await page.click('#btn-start-offline');
await page.waitForFunction(() => window.__game?.hud && window.__game?.renderer, {
  timeout: 60000,
});
await sleep(2500);

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

for (const shot of SHOTS) {
  await page.evaluate((s) => {
    const p = window.__game.sim.player;
    p.pos.x = s.x;
    p.pos.z = s.z;
    if (s.y === 'floor2') {
      // camera-only aid to frame the upper floor for this screenshot; see
      // module header
      p.pos.y += 4;
    }
    p.facing = s.camYaw;
    window.__game.input.camYaw = s.camYaw;
    window.__game.input.camDist = s.camDist;
    window.__game.input.camPitch = s.camPitch;
  }, shot);
  await sleep(700);
  const path = `docs/screenshots/${shot.name}.png`;
  await page.screenshot({ path });
  console.log(`screenshot -> ${path}`);
}

await browser.close();
