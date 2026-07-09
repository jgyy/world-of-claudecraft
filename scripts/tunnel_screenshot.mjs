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
// seed 20061, after the max-30-degree-grade profile, the two entrance
// mounds, and the upright-mouth rework). The player stands 0.15yd above it
// (never clips into the mesh).
const FLOOR = {
  163: -19.04,
  167: -21.22,
  170: -22.85,
  174: -25.53,
  177: -26.71,
  178.5: -26.96,
  180: -27.04,
  183: -26.71,
  187: -24.79,
  190: -22.85,
  194: -20.68,
};
const standY = (z) => FLOOR[z] + 0.15;
// Base eye height for interior shots: floor + standing height + a bit more,
// roughly mid-chamber. camDy/lookDy below are small deltas off this base.
const eyeY = (z) => FLOOR[z] + 2.2;

// Exterior shots: ordinary chase camera, character renders normally. Mouths
// now sit at z=128/232 (moved out from 146/214 to keep every segment's
// grade at or under 30 degrees given the deeper crest - see
// content/tunnels.ts), each cut into its own protruding entrance mound
// (moundRadius 14yd) rather than just a dip in the ambient ridge slope. 8
// shots.
const EXTERIOR_SHOTS = [
  { name: '01_wide_establishing_zone1', z: 70, camDist: 16, camPitch: -0.05, camYaw: 0 },
  { name: '02_approaching_ridge', z: 100, camDist: 12, camPitch: -0.1, camYaw: 0 },
  { name: '03_mouth_a_exterior_wide', z: 118, camDist: 9, camPitch: -0.15, camYaw: 0 },
  { name: '04_mouth_a_closeup', z: 126, camDist: 6, camPitch: -0.05, camYaw: 0 },
  { name: '05_mouth_a_closeup_side_angle', z: 126, camDist: 6, camPitch: -0.04, camYaw: 0.5 },
  { name: '06_mouth_b_closeup', z: 234, camDist: 6, camPitch: -0.05, camYaw: Math.PI },
  { name: '07_mouth_b_exterior_wide', z: 246, camDist: 9, camPitch: -0.15, camYaw: Math.PI },
  { name: '08_wide_establishing_zone2', z: 270, camDist: 16, camPitch: -0.05, camYaw: Math.PI },
];

// Interior shots: free editorCam, framed down the tunnel's own axis but
// offset to the side (camDx) so the player's own body/helmet, right at the
// axis center, never fills the frame the way it does dead-on from behind.
// Held to the core z=163..197 span (the fully-enclosed stretch with a real
// rock ceiling both sides of the crest, clear of both mouths' shallower,
// still-open-to-sky transitional stretches) for extra safety on top of
// tunnel_overlay.ts's own backstop. 12 shots.
// The tunnel's centerline is not flat, though every segment now holds to a
// walkable max-30-degree grade (content/tunnels.ts). A fixed eye height
// (floor+2.2) still isn't enough headroom to cover both the camera position
// and its forward look-at target on the sloped stretches, so both camDy and
// lookDy below are computed per shot from the tunnel's own local floor at
// the camera's/target's actual (offset) z, not just the shot's nominal z -
// the player always walks +z start to finish (128 -> 232; "ascending" means
// climbing y, not reversing z), so every shot but 16 (the one deliberate
// look-back) frames forward. Every position verified open (not solid)
// against the live voxel field with isSolidVoxel, not eyeballed.
const INTERIOR_SHOTS = [
  {
    name: '09_descending_1',
    z: 163,
    camDx: 1.4,
    camDz: -2.6,
    camDy: 1.63,
    lookDz: 7,
    lookDy: -3.41,
  },
  {
    name: '10_descending_2',
    z: 167,
    camDx: -1.4,
    camDz: -2.6,
    camDy: 1.62,
    lookDz: 7,
    lookDy: -3.91,
  },
  {
    name: '11_descending_3',
    z: 170,
    camDx: 1.4,
    camDz: -2.6,
    camDy: 1.61,
    lookDz: 7,
    lookDy: -3.46,
  },
  {
    name: '12_approaching_crest_1',
    z: 174,
    camDx: -1.4,
    camDz: -2.6,
    camDy: 2.12,
    lookDz: 7,
    lookDy: -1.08,
  },
  {
    name: '13_approaching_crest_2',
    z: 177,
    camDx: 1.4,
    camDz: -2.6,
    camDy: 1.15,
    lookDz: 7,
    lookDy: 0.68,
  },
  {
    name: '14_near_crest',
    z: 178.5,
    camDx: -1.4,
    camDz: -2.6,
    camDy: 0.76,
    lookDz: 7,
    lookDy: 1.55,
  },
  {
    name: '15_crest_boundary_z180',
    z: 180,
    camDx: 1.4,
    camDz: -2.6,
    camDy: 0.45,
    lookDz: 7,
    lookDy: 2.65,
  },
  {
    name: '16_crest_boundary_z180_facing_back',
    z: 180,
    camDx: -1.4,
    camDz: 2.6,
    camDy: 0.45,
    lookDz: -7,
    lookDy: 2.65,
  },
  {
    name: '17_past_crest',
    z: 183,
    camDx: -1.4,
    camDz: -2.6,
    camDy: -0.13,
    lookDz: 7,
    lookDy: 4.26,
  },
  {
    name: '18_ascending_1',
    z: 187,
    camDx: 1.4,
    camDz: -2.6,
    camDy: -1.31,
    lookDz: 7,
    lookDy: 4.51,
  },
  {
    name: '19_ascending_2',
    z: 190,
    camDx: -1.4,
    camDz: -2.6,
    camDy: -1.34,
    lookDz: 7,
    lookDy: 4.21,
  },
  {
    name: '20_ascending_3',
    z: 194,
    camDx: 1.4,
    camDz: -2.6,
    camDy: -1.21,
    lookDz: 7,
    lookDy: 4.02,
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
