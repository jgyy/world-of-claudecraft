// Screenshot tour for the new vale_marsh_ridge_tunnel (content/tunnels.ts):
// a real, walkable through-tunnel connecting Eastbrook Vale (zone1) to
// Mirefen Marsh (zone2), rendered by the production renderer via the new
// tunnel_overlay.ts (not the standalone whole-map voxel verification build).
// Needs `npm run dev` running.
import fs from 'node:fs';
import puppeteer from 'puppeteer-core';
import { BROWSER_PATH as EDGE } from './browser_path.mjs';
import { enterOfflineGame } from './enter_offline_game.mjs';

const BASE_URL = process.env.GAME_URL ?? 'http://localhost:5173';
const URL = `${BASE_URL}${BASE_URL.includes('?') ? '&' : '?'}gfx=ultra`;
const OUT = 'docs/screenshots';
fs.mkdirSync(OUT, { recursive: true });

const LAUNCH_ARGS = [
  '--window-size=1600,900',
  '--ignore-gpu-blocklist',
  '--enable-gpu-rasterization',
  '--use-gl=angle',
  '--use-angle=gl',
  '--enable-webgl',
  '--no-sandbox',
];

// x is held at -25 throughout (the tunnel's constant x). camYaw ~ facing
// north (+z) so the shot looks down the tunnel's own axis.
const SHOTS = [
  { name: '01_zone1_approach_surface', x: -25, z: 130, y: null, camPitch: -0.15 },
  { name: '02_mouth_a_eastbrook_vale', x: -25, z: 150, y: null, camPitch: -0.2 },
  { name: '03_interior_descending', x: -25, z: 165, y: -6.5, camPitch: -0.1 },
  { name: '04_crest_under_ridge_z180_boundary', x: -25, z: 180, y: -8, camPitch: 0.0 },
  { name: '05_interior_ascending', x: -25, z: 195, y: -6, camPitch: -0.05 },
  { name: '06_mouth_b_mirefen_marsh', x: -25, z: 209, y: null, camPitch: -0.2 },
  { name: '07_zone2_exit_surface', x: -25, z: 225, y: null, camPitch: -0.15 },
];

const browser = await puppeteer.launch({
  executablePath: EDGE,
  headless: 'new',
  args: LAUNCH_ARGS,
  defaultViewport: { width: 1600, height: 900 },
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGEERROR:', e.message));

await page.goto(URL, { waitUntil: 'networkidle0', timeout: 90000 });
await enterOfflineGame(page, { charClass: 'warrior', charName: 'TunnelTour', settleMs: 1500 });
await page.keyboard.press('Escape'); // skip the spawn cinematic
await new Promise((r) => setTimeout(r, 200));

await page.waitForFunction(() => Boolean(window.__game?.sim?.player), { timeout: 60000 });
await page.evaluate(() => {
  window.__game.sim.player.gm = true; // immune to camp mobs along the route
});
await page.evaluate(() => {
  const btn = document.querySelector('.tut-skip');
  if (btn instanceof HTMLElement) btn.click();
});
await new Promise((r) => setTimeout(r, 200));

for (const shot of SHOTS) {
  await page.evaluate((s) => {
    const g = window.__game;
    const player = g.sim.player;
    player.gm = true;
    player.hp = player.maxHp;
    player.pos.x = s.x;
    player.pos.z = s.z;
    if (s.y !== null) {
      player.pos.y = s.y;
      player.vy = 0;
      player.onGround = true;
    }
    player.facing = 0; // faces +z, i.e. looking from zone1 toward zone2
    g.input.camYaw = 0.05;
    g.input.camPitch = s.camPitch;
  }, shot);
  await new Promise((r) => setTimeout(r, 1200)); // let the tunnel-aware ground snap settle
  await page.screenshot({ path: `${OUT}/tunnel_${shot.name}.png` });
  console.log('captured', shot.name);
}

await browser.close();
console.log('wrote screenshots to', OUT);
