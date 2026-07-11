// Screenshot harness for the expanded Zone 2 ruin-ring decoration pass
// (public/models/props/ruin_*.glb, placed via ZONE2_PROPS.ruinDecor/statues).
// Boots the offline world, teleports the player around the ring, and takes
// one shot per configured camera setup.

import fs from 'node:fs';
import puppeteer from 'puppeteer-core';
import { BROWSER_PATH } from './browser_path.mjs';

const URL = (process.env.GAME_URL ?? 'http://localhost:5173') + '/?gfx=ultra';
fs.mkdirSync('docs/screenshots', { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// camera position = player - (sin(yaw), cos(yaw)) * dist * cos(pitch), and the
// camera looks back at the player, so yaw=0 frames whatever is north (+z) of
// the player position, yaw=PI frames south (-z), etc (src/render/renderer.ts).
// Layout: a walled temple compound around the existing column ring (center
// 100, 435): archway entrance (north) -> stairway -> altar -> idol statue
// (south), a broken perimeter wall with 4 corner obelisks, and peripheral
// satellite features (well, graveyard, benches, rubble) outside the wall.
const SHOTS = [
  { name: 'ruin-compound-wide-overview', x: 100, z: 435, camYaw: 0.3, camDist: 34, camPitch: 0.5 },
  {
    name: 'ruin-compound-wide-opposite',
    x: 100,
    z: 435,
    camYaw: Math.PI + 0.3,
    camDist: 34,
    camPitch: 0.5,
  },
  { name: 'ruin-compound-aerial', x: 100, z: 435, camYaw: 0.5, camDist: 46, camPitch: 1.15 },
  { name: 'ruin-archway-entrance', x: 100, z: 445, camYaw: 0.15, camDist: 10, camPitch: 0.2 },
  { name: 'ruin-processional-axis', x: 100, z: 447, camYaw: 0.1, camDist: 22, camPitch: 0.3 },
  { name: 'ruin-altar-idol', x: 100, z: 433, camYaw: 3.0, camDist: 10, camPitch: 0.18 },
  { name: 'ruin-perimeter-wall-east', x: 110, z: 435, camYaw: 1.6, camDist: 10, camPitch: 0.2 },
  { name: 'ruin-corner-obelisks', x: 100, z: 435, camYaw: 0.9, camDist: 16, camPitch: 0.4 },
  { name: 'ruin-well-satellite', x: 90, z: 435, camYaw: 1.57, camDist: 10, camPitch: 0.2 },
  { name: 'ruin-graveyard-satellite', x: 110, z: 428, camYaw: -1.3, camDist: 10, camPitch: 0.2 },
  { name: 'ruin-bench-approach', x: 100, z: 448, camYaw: -0.6, camDist: 10, camPitch: 0.2 },
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
await page.type('#char-name', 'Decorwatch');
await page.click('#offline-select .mini-class[data-class="warrior"]');
await page.click('#btn-start-offline');
await page.waitForFunction(() => window.__game?.hud && window.__game?.renderer, {
  timeout: 60000,
});
await sleep(2500);

// skip the new-adventurer tutorial popup and clear the drowned-dead camp mobs
// near the ring, screenshot-only cleanup (this is a visual verification
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
