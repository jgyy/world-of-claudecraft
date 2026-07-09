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
// seam the map editor's 3D mode uses): camera offset a couple yards to the
// side and just behind the player, looking FAR down the corridor (not
// fixed on the player's own head - that framing crops the character almost
// entirely out at any distance close enough to also avoid wall clipping).
// This is the seam that showed the raw scene background through a mesh
// gap in an earlier pass; the real, permanent fix for that lives in
// tunnel_overlay.ts (correct backstop wall orientation, double-sided
// material, a wide terrain.ts exclusion margin) and applies to every
// camera - the ordinary in-game chase camera included, not just this
// script - not just this specific editorCam framing.
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
// seed 20061, after doubling the tunnel's depth). The player stands 0.15yd
// above it (never clips into the mesh).
const FLOOR = {
  164: -28.37,
  167: -32.17,
  170: -35.9,
  173: -38.55,
  176: -41.11,
  178: -42.02,
  180: -42.3,
  184: -41.11,
  187: -38.55,
  190: -35.9,
  193: -32.17,
};
const standY = (z) => FLOOR[z] + 0.15;
// Base eye height for interior shots: floor + standing height + a bit more,
// roughly mid-chamber. camDy/lookDy below are small deltas off this base.
const eyeY = (z) => FLOOR[z] + 2.2;

// Exterior shots: ordinary chase camera, character renders normally. 8 shots.
const EXTERIOR_SHOTS = [
  { name: '01_wide_establishing_zone1', z: 90, camDist: 16, camPitch: -0.05, camYaw: 0 },
  { name: '02_approaching_ridge', z: 120, camDist: 12, camPitch: -0.1, camYaw: 0 },
  { name: '03_mouth_a_exterior_wide', z: 138, camDist: 9, camPitch: -0.15, camYaw: 0 },
  { name: '04_mouth_a_closeup', z: 148, camDist: 5, camPitch: -0.1, camYaw: 0 },
  { name: '05_mouth_a_closeup_side_angle', z: 148, camDist: 5, camPitch: -0.08, camYaw: 0.5 },
  { name: '06_mouth_b_closeup', z: 212, camDist: 5, camPitch: -0.1, camYaw: Math.PI },
  { name: '07_mouth_b_exterior_wide', z: 222, camDist: 9, camPitch: -0.15, camYaw: Math.PI },
  { name: '08_wide_establishing_zone2', z: 240, camDist: 16, camPitch: -0.05, camYaw: Math.PI },
];

// Interior shots: free editorCam, framed down the tunnel's own axis but
// offset to the side (camDx) so the player's own body/helmet, right at the
// axis center, never fills the frame the way it does dead-on from behind -
// this is the exact camera pattern that reliably framed the full character
// earlier (a small camDz offset from the player, target FAR ahead down the
// corridor rather than fixed on the player's own head, which is what
// actually keeps the player's model in frame at a natural scale). Held to
// the core z=164..196 span (clear of both mouths' shallower transitional
// stretches, the hardest case for the voxel mesher) for extra safety on top
// of tunnel_overlay.ts's own backstop. 12 shots.
// The tunnel's centerline is not flat: it dives roughly 1.2yd in y per 1yd
// of z near each mouth and while climbing back out past the crest. A fixed
// eye height (floor+2.2, fine on the near-flat crest-adjacent stretch)
// isn't enough headroom on those sloped stretches, and a lookDz-ahead
// target computed at a FIXED y clips into the rising floor or ceiling
// instead of following the slope. Both camDy (near each mouth, shots
// 09-11/19-20) and lookDy (past the crest, shots 15-20, where "ahead"
// means climbing back toward daylight) are bumped up on the affected shots
// so both the camera position and its look-at target sit in open space -
// verified against the live voxel field with isSolidVoxel, not eyeballed.
const INTERIOR_SHOTS = [
  { name: '09_descending_1', z: 164, camDx: 1.6, camDz: -2.2, camDy: 2, lookDz: 9, lookDy: -0.3 },
  { name: '10_descending_2', z: 167, camDx: -1.6, camDz: -2.2, camDy: 2, lookDz: 9, lookDy: -0.3 },
  { name: '11_descending_3', z: 170, camDx: 1.6, camDz: -2.2, camDy: 2, lookDz: 9, lookDy: -0.5 },
  {
    name: '12_approaching_crest_1',
    z: 173,
    camDx: -1.6,
    camDz: -2.2,
    camDy: 0.2,
    lookDz: 9,
    lookDy: -0.5,
  },
  {
    name: '13_approaching_crest_2',
    z: 176,
    camDx: 1.6,
    camDz: -2.2,
    camDy: 0.4,
    lookDz: 9,
    lookDy: -0.6,
  },
  { name: '14_near_crest', z: 178, camDx: -1.6, camDz: -2.2, camDy: 0.4, lookDz: 9, lookDy: -0.6 },
  {
    name: '15_crest_boundary_z180',
    z: 180,
    camDx: 1.6,
    camDz: -2.2,
    camDy: 0.6,
    lookDz: 9,
    lookDy: 3,
  },
  {
    name: '16_crest_boundary_z180_facing_back',
    z: 180,
    camDx: -1.6,
    camDz: 2.2,
    camDy: 0.6,
    lookDz: -9,
    lookDy: 3,
  },
  { name: '17_past_crest', z: 184, camDx: -1.6, camDz: 2.2, camDy: 0.4, lookDz: 9, lookDy: 11 },
  { name: '18_ascending_1', z: 187, camDx: 1.6, camDz: 2.2, camDy: 0.2, lookDz: 9, lookDy: 13 },
  { name: '19_ascending_2', z: 190, camDx: -1.6, camDz: 2.2, camDy: 2, lookDz: 9, lookDy: 13 },
  { name: '20_ascending_3', z: 193, camDx: 1.6, camDz: 2.2, camDy: 2, lookDz: 9, lookDy: 13 },
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
        pos: { x: shot.x + shot.camDx, y: shot.eyeY + shot.camDy, z: shot.z + shot.camDz },
        target: {
          x: shot.x,
          y: shot.eyeY + shot.lookDy,
          z: shot.z + shot.camDz + shot.lookDz,
        },
      };
    },
    { ...s, x: TX, standY: standY(s.z), eyeY: eyeY(s.z) },
  );
  await capture(s.name);
}

await browser.close();
console.log('wrote screenshots to', OUT);
