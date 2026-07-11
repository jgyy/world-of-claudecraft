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
const SHOTS = [
  { name: 'ruin-ring-wide-overview', x: 100, z: 435, camYaw: 0.3, camDist: 20, camPitch: 0.6 },
  {
    name: 'ruin-ring-wide-opposite',
    x: 100,
    z: 435,
    camYaw: Math.PI + 0.3,
    camDist: 20,
    camPitch: 0.6,
  },
  { name: 'ruin-archway-entrance', x: 100, z: 448, camYaw: 0, camDist: 8, camPitch: 0.2 },
  { name: 'ruin-altar-closeup', x: 100, z: 428, camYaw: 0.4, camDist: 6, camPitch: 0.15 },
  { name: 'ruin-statue-idol', x: 109, z: 421, camYaw: 0, camDist: 7, camPitch: 0.12 },
  { name: 'ruin-stairway-obelisk', x: 90, z: 434, camYaw: -0.7, camDist: 9, camPitch: 0.25 },
  { name: 'ruin-well-gravemarker', x: 110, z: 435, camYaw: 2.6, camDist: 8, camPitch: 0.2 },
  { name: 'ruin-bench-pedestal', x: 106, z: 424, camYaw: -2.0, camDist: 7, camPitch: 0.18 },
  { name: 'ruin-brazier-rubble', x: 90, z: 436, camYaw: 1.2, camDist: 8, camPitch: 0.2 },
  { name: 'ruin-wallfragment-urn', x: 98, z: 424, camYaw: -0.3, camDist: 7, camPitch: 0.18 },
  { name: 'ruin-ring-aerial', x: 100, z: 435, camYaw: 0.8, camDist: 30, camPitch: 1.1 },
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
    if (e.kind === 'mob' && Math.hypot(e.pos.x - 100, e.pos.z - 435) < 60) {
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
