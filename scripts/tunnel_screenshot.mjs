// Screenshot tour for the vale_marsh_ridge_tunnel (content/tunnels.ts): a
// real, walkable through-tunnel connecting Eastbrook Vale (zone1) to Mirefen
// Marsh (zone2) on the EAST side (x=110), rendered by the production
// renderer as one continuous terrain+cave surface (see tunnel_overlay.ts and
// terrain.ts's chunkNearAnyTunnel exclusion), not a separate overlay.
// Needs `npm run dev` running.
//
// Camera, exterior shots: the ordinary chase camera (camYaw/camPitch/
// camDist, see renderer.ts updateCamera) - the character renders normally.
//
// Camera, interior shots: the chase camera's own occlusion system raycasts
// against the ORDINARY (tunnel-unaware) terrainHeight, so underground it
// always decides the classic surface overhead is "in the way" and pulls the
// camera back up to just under it, never into the tunnel's real interior.
// So every interior shot instead uses renderer.editorCam (the same free-cam
// seam the map editor's 3D mode uses): camera positioned a few yards BEHIND
// the player (along -z, roughly head height) with the look target close to
// the player's own head (not far ahead down the corridor) - that keeps the
// player's model itself in frame, per the whole point of these shots being
// "you can see your character actually standing in the tunnel."
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

const TX = 110; // the tunnel's constant x, east side of both zones
// Tunnel floor at each z (see tunnel_traversal.ts's tunnelColumnAt, world
// seed 20061). The player stands 0.15yd above it (never clips into the mesh).
const FLOOR = {
  148: -6.3,
  152: -7.84,
  155: -9.6,
  158: -11.47,
  162: -13.96,
  166: -16.55,
  170: -19.14,
  174: -21.33,
  178: -23.08,
  180: -23.4,
  182: -23.08,
  186: -21.33,
  190: -19.14,
  194: -16.55,
  198: -13.96,
  202: -11.47,
  206: -8.97,
  210: -7.27,
  212: -6.63,
};
const standY = (z) => FLOOR[z] + 0.15;

// Exterior shots: ordinary chase camera, character renders normally.
const EXTERIOR_SHOTS = [
  { name: '01_wide_establishing_zone1', z: 90, camDist: 16, camPitch: -0.05, camYaw: 0 },
  { name: '02_approaching_ridge', z: 120, camDist: 12, camPitch: -0.1, camYaw: 0 },
  { name: '03_mouth_a_exterior_wide', z: 138, camDist: 9, camPitch: -0.15, camYaw: 0 },
  { name: '04_mouth_a_exterior_medium', z: 144, camDist: 7, camPitch: -0.12, camYaw: 0.15 },
  { name: '05_mouth_a_closeup', z: 148, camDist: 5, camPitch: -0.1, camYaw: 0 },
  { name: '06_mouth_a_closeup_side_angle', z: 148, camDist: 5, camPitch: -0.08, camYaw: 0.5 },
  {
    name: '20_mouth_b_exterior_medium',
    z: 216,
    camDist: 7,
    camPitch: -0.12,
    camYaw: Math.PI - 0.15,
  },
  { name: '21_mouth_b_closeup', z: 212, camDist: 5, camPitch: -0.1, camYaw: Math.PI },
  {
    name: '22_mouth_b_closeup_side_angle',
    z: 212,
    camDist: 5,
    camPitch: -0.08,
    camYaw: Math.PI + 0.5,
  },
  { name: '23_wide_establishing_zone2', z: 240, camDist: 16, camPitch: -0.05, camYaw: Math.PI },
];

// Interior shots: free editorCam, camera a few yards behind the player
// (camDz < 0 relative to travel direction +z) looking near the player's own
// head, so the player's model is always the visible subject with the
// textured tunnel walls/floor/ceiling around them. camDx offsets the camera
// a little to one side for a less perfectly-centered, more natural angle.
const INTERIOR_SHOTS = [
  { name: '07_inside_mouth_a', z: 152, camDx: 1.2, camDz: -7, camDy: 1.8, lookDy: 1.3 },
  { name: '08_inside_mouth_a_alt', z: 155, camDx: -1.4, camDz: -6, camDy: 2.0, lookDy: 1.4 },
  { name: '09_descending_1', z: 158, camDx: 1.3, camDz: -7, camDy: 1.9, lookDy: 1.3 },
  { name: '10_descending_2', z: 162, camDx: -1.3, camDz: -7, camDy: 2.1, lookDy: 1.4 },
  { name: '11_descending_3', z: 166, camDx: 1.4, camDz: -7, camDy: 2.2, lookDy: 1.4 },
  { name: '12_descending_4', z: 170, camDx: -1.4, camDz: -7, camDy: 2.3, lookDy: 1.5 },
  { name: '13_approaching_crest', z: 174, camDx: 1.4, camDz: -7, camDy: 2.4, lookDy: 1.5 },
  { name: '14_crest_boundary_z180', z: 180, camDx: 1.5, camDz: -7, camDy: 1.9, lookDy: 1.4 },
  {
    name: '15_crest_boundary_z180_facing_back',
    z: 180,
    camDx: -1.5,
    camDz: 7,
    camDy: 1.9,
    lookDy: 1.4,
  },
  { name: '16_past_crest', z: 186, camDx: -1.4, camDz: 7, camDy: 2.4, lookDy: 1.5 },
  { name: '17_ascending_1', z: 190, camDx: 1.4, camDz: 7, camDy: 2.3, lookDy: 1.5 },
  { name: '18_ascending_2', z: 194, camDx: -1.3, camDz: 7, camDy: 2.1, lookDy: 1.4 },
  { name: '19_inside_mouth_b', z: 198, camDx: 1.3, camDz: 7, camDy: 1.9, lookDy: 1.3 },
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
  await page.evaluate(
    (shot) => {
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
    },
    { ...s, x: TX },
  );
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
        pos: { x: shot.x + shot.camDx, y: shot.standY + shot.camDy, z: shot.z + shot.camDz },
        target: { x: shot.x, y: shot.standY + shot.lookDy, z: shot.z },
      };
    },
    { ...s, x: TX, standY: standY(s.z) },
  );
  await capture(s.name);
}

await browser.close();
console.log('wrote screenshots to', OUT);
