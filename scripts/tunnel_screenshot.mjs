// Screenshot tour for the new vale_marsh_ridge_tunnel (content/tunnels.ts):
// a real, walkable through-tunnel connecting Eastbrook Vale (zone1) to
// Mirefen Marsh (zone2), rendered by the production renderer via the new
// tunnel_overlay.ts (not the standalone whole-map voxel verification build).
// Needs `npm run dev` running.
//
// Camera, exterior shots: the ordinary chase camera (camYaw/camPitch/camDist,
// see renderer.ts updateCamera).
//
// Camera, interior shots: the chase camera's own occlusion system pulls the
// camera back toward the player whenever it raycasts a blocked line of sight
// - and that raycast is against the ORDINARY (tunnel-unaware) world geometry,
// so underground it decides the classic terrain surface overhead is "in the
// way" and pulls the camera up to just under the real ground surface, not
// into the tunnel's own open interior. So every interior shot instead uses
// renderer.editorCam (the same free-cam seam the map editor's 3D mode uses,
// see renderer.ts's updateCamera): an explicit pos/target that bypasses the
// chase-cam and its occlusion entirely, framed straight down the tunnel's own
// axis so the walls/floor/ceiling are what's actually in frame.
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

const TX = -25; // the tunnel's constant x
// Tunnel floor/ceiling at each z (see tunnel_traversal.ts's tunnelColumnAt,
// world seed 20061). Infinity means open to sky at that column (near a mouth).
const COL = {
  162: { floor: -7.41, ceil: -1.37 },
  170: { floor: -8.81, ceil: -3.13 },
  175: { floor: -9.31, ceil: -3.69 },
  180: { floor: -9.8, ceil: -4.19 },
  185: { floor: -9.31, ceil: -3.69 },
  190: { floor: -8.81, ceil: -3.13 },
  198: { floor: -7.41, ceil: -1.37 },
};
// Player stands 0.1yd above the floor (never clips into the mesh). The
// editorCam eye height sits well above that, roughly mid-chamber, so the
// frame shows floor, walls, and (where there is one) ceiling together.
const standY = (z) => COL[z].floor + 0.1;
const eyeY = (z) => COL[z].floor + 2.2;

// Exterior shots: ordinary chase camera.
const EXTERIOR_SHOTS = [
  { name: '01_wide_establishing_zone1', x: TX, z: 100, camDist: 14, camPitch: -0.05, camYaw: 0 },
  { name: '02_approaching_ridge', x: TX, z: 135, camDist: 10, camPitch: -0.1, camYaw: 0 },
  { name: '03_mouth_a_exterior_wide', x: TX, z: 145, camDist: 8, camPitch: -0.15, camYaw: 0 },
  { name: '04_mouth_a_closeup', x: TX, z: 149, camDist: 5, camPitch: -0.1, camYaw: 0 },
  {
    name: '15_mouth_b_exterior_closeup',
    x: TX,
    z: 212,
    camDist: 5,
    camPitch: -0.1,
    camYaw: Math.PI,
  },
  {
    name: '16_wide_establishing_zone2',
    x: TX,
    z: 230,
    camDist: 14,
    camPitch: -0.05,
    camYaw: Math.PI,
  },
];

// Interior shots: free editorCam, framed down the tunnel's own axis but
// offset to the side (camDx) so the player's own body/helmet, right at the
// axis center, never fills the frame the way it does dead-on from behind.
// dz>0 looks deeper into the tunnel (toward zone2), dz<0 looks back the way
// the player came.
const INTERIOR_SHOTS = [
  {
    name: '05_inside_mouth_a_looking_in',
    z: 162,
    camDx: 1.6,
    camDz: -1,
    camDy: 1.6,
    lookDz: 9,
    lookDy: 0.3,
  },
  {
    name: '06_inside_mouth_a_looking_out',
    z: 162,
    camDx: -1.6,
    camDz: 1,
    camDy: 1.6,
    lookDz: -9,
    lookDy: -0.3,
  },
  { name: '07_descending_1', z: 170, camDx: 1.6, camDz: -1, camDy: 1.8, lookDz: 9, lookDy: -0.5 },
  { name: '08_descending_2', z: 175, camDx: -1.6, camDz: -1, camDy: 2, lookDz: 9, lookDy: -0.8 },
  {
    name: '09_crest_boundary_z180',
    z: 180,
    camDx: 1.6,
    camDz: -1,
    camDy: 2.2,
    lookDz: 9,
    lookDy: 0.5,
  },
  {
    name: '10_crest_boundary_z180_alt_angle',
    z: 180,
    camDx: -1.8,
    camDz: 1,
    camDy: 1,
    lookDz: -9,
    lookDy: 1.5,
  },
  { name: '11_ascending_1', z: 185, camDx: -1.6, camDz: 1, camDy: 2, lookDz: 9, lookDy: 0.8 },
  { name: '12_ascending_2', z: 190, camDx: 1.6, camDz: 1, camDy: 1.8, lookDz: 9, lookDy: 0.5 },
  {
    name: '13_inside_mouth_b_looking_out',
    z: 198,
    camDx: -1.6,
    camDz: 1,
    camDy: 1.6,
    lookDz: 9,
    lookDy: -0.3,
  },
  {
    name: '14_inside_mouth_b_looking_in',
    z: 198,
    camDx: 1.6,
    camDz: -1,
    camDy: 1.6,
    lookDz: -9,
    lookDy: 0.3,
  },
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

async function capture(name) {
  await new Promise((r) => setTimeout(r, 1200)); // let the tunnel-aware ground snap and camera settle
  await page.screenshot({ path: `${OUT}/tunnel_${name}.png` });
  console.log('captured', name);
}

for (const s of EXTERIOR_SHOTS) {
  await page.evaluate((shot) => {
    const g = window.__game;
    g.renderer.editorCam = null; // ordinary chase camera for exterior shots
    const player = g.sim.player;
    player.gm = true;
    player.hp = player.maxHp;
    player.pos.x = shot.x;
    player.pos.z = shot.z;
    player.facing = 0;
    g.input.camYaw = shot.camYaw;
    g.input.camPitch = shot.camPitch;
    g.input.camDist = shot.camDist;
  }, s);
  await capture(s.name);
}

for (const s of INTERIOR_SHOTS) {
  await page.evaluate(
    (shot) => {
      const g = window.__game;
      const player = g.sim.player;
      player.gm = true;
      player.hp = player.maxHp;
      player.pos.x = shot.x;
      player.pos.z = shot.z;
      player.pos.y = shot.standY;
      player.vy = 0;
      player.onGround = true;
      player.facing = 0;
      g.renderer.editorCam = {
        pos: { x: shot.x + shot.camDx, y: shot.eyeY + shot.camDy, z: shot.z + shot.camDz },
        target: { x: shot.x, y: shot.eyeY + shot.lookDy, z: shot.z + shot.camDz + shot.lookDz },
      };
    },
    {
      ...s,
      x: TX,
      standY: standY(s.z),
      eyeY: eyeY(s.z),
    },
  );
  await capture(s.name);
}

await browser.close();
console.log('wrote screenshots to', OUT);
