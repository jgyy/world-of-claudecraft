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

// The tunnel S-curves in x between the two mouths (both still at x=110, see
// content/tunnels.ts); TX_AT gives the interpolated centerline x at a given
// z, matching the waypoint polyline exactly, so exterior/interior shots stay
// centered on the actual passage rather than a stale constant x=110.
const TUNNEL_WAYPOINTS_XZ = [
  { x: 110, z: 96 },
  { x: 116, z: 112 },
  { x: 112, z: 131 },
  { x: 104, z: 152 },
  { x: 110, z: 180 },
  { x: 116, z: 208 },
  { x: 112, z: 229 },
  { x: 104, z: 248 },
  { x: 110, z: 264 },
];
function TX_AT(z) {
  const wps = TUNNEL_WAYPOINTS_XZ;
  for (let i = 0; i + 1 < wps.length; i++) {
    const a = wps[i];
    const b = wps[i + 1];
    if (z >= a.z && z <= b.z) return a.x + (b.x - a.x) * ((z - a.z) / (b.z - a.z));
  }
  return wps[z < wps[0].z ? 0 : wps.length - 1].x;
}

// Tunnel floor at each z (see tunnel_traversal.ts's tunnelColumnAt, world
// seed 20061, round 7: deeper crest (y=-37, was -22) and both mouths moved
// out to z=96/264 (was z=128/232) to keep every segment's grade at or under
// 30 degrees given the extra depth - see content/tunnels.ts). The player
// stands 0.15yd above it (never clips into the mesh).
const FLOOR = {
  152: -28.14,
  163: -34.06,
  167: -36.21,
  170: -37.81,
  174: -40.44,
  177: -41.69,
  178.5: -41.96,
  180: -42.04,
  183: -41.69,
  187: -39.68,
  190: -38.32,
  194: -36.5,
  208: -30.1,
};
const standY = (z) => FLOOR[z] + 0.15;
// Base eye height for interior shots: floor + standing height + a bit more,
// roughly mid-chamber. camDy/lookDy below are small deltas off this base.
const eyeY = (z) => FLOOR[z] + 2.2;

// Exterior shots: ordinary chase camera, character renders normally. Mouths
// now sit at z=96/264 (round 7: moved out from z=128/232 to keep every
// segment's grade at or under 30 degrees given the deeper crest - see
// content/tunnels.ts), each cut into its own irregular, foliage-framed
// entrance mound (moundRadius 14yd) rather than just a dip in the ambient
// ridge slope. Also includes two wide overhead-ish shots (00/00b) that show
// the S-curve path from above. 10 shots.
const EXTERIOR_SHOTS = [
  { name: '00_overhead_scurve_zone1', z: 130, camDist: 40, camPitch: -0.9, camYaw: 0.15 },
  { name: '00b_overhead_scurve_full', z: 180, camDist: 60, camPitch: -0.95, camYaw: 0.15 },
  { name: '01_wide_establishing_zone1', z: 40, camDist: 16, camPitch: -0.05, camYaw: 0 },
  { name: '02_approaching_ridge', z: 68, camDist: 14, camPitch: -0.1, camYaw: 0 },
  { name: '03_mouth_a_exterior_wide', z: 80, camDist: 15, camPitch: -0.12, camYaw: 0 },
  { name: '04_mouth_a_closeup', z: 90, camDist: 11, camPitch: -0.03, camYaw: 0 },
  { name: '05_mouth_a_closeup_side_angle', z: 90, camDist: 11, camPitch: -0.02, camYaw: 0.5 },
  { name: '06_mouth_b_closeup', z: 270, camDist: 11, camPitch: -0.03, camYaw: Math.PI },
  { name: '07_mouth_b_exterior_wide', z: 280, camDist: 15, camPitch: -0.12, camYaw: Math.PI },
  { name: '08_wide_establishing_zone2', z: 300, camDist: 16, camPitch: -0.05, camYaw: Math.PI },
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
    name: '09_entering_scurve',
    z: 152,
    camDx: 1.4,
    camDz: -2.6,
    camDy: 1.37,
    lookDz: 7,
    lookDy: -3.78,
  },
  {
    name: '10_descending_1',
    z: 163,
    camDx: 1.4,
    camDz: -2.6,
    camDy: 1.4,
    lookDz: 7,
    lookDy: -3.75,
  },
  {
    name: '11_descending_2',
    z: 167,
    camDx: -1.4,
    camDz: -2.6,
    camDy: 1.39,
    lookDz: 7,
    lookDy: -4.24,
  },
  {
    name: '12_descending_3',
    z: 170,
    camDx: 1.4,
    camDz: -2.6,
    camDy: 1.39,
    lookDz: 7,
    lookDy: -3.88,
  },
  {
    name: '13_approaching_crest_1',
    z: 174,
    camDx: -1.4,
    camDz: -2.6,
    camDy: 1.88,
    lookDz: 7,
    lookDy: -1.56,
  },
  {
    name: '14_approaching_crest_2',
    z: 177,
    camDx: 1.4,
    camDz: -2.6,
    camDy: 1.0,
    lookDz: 7,
    lookDy: 0.29,
  },
  {
    name: '15_near_crest',
    z: 178.5,
    camDx: -1.4,
    camDz: -2.6,
    camDy: 0.59,
    lookDz: 7,
    lookDy: 1.21,
  },
  {
    name: '16_crest_boundary_z180_deep',
    z: 180,
    camDx: 1.4,
    camDz: -2.6,
    camDy: 0.26,
    lookDz: 7,
    lookDy: 2.36,
  },
  {
    name: '17_crest_boundary_z180_facing_back',
    z: 180,
    camDx: -1.4,
    camDz: 2.6,
    camDy: 0.26,
    lookDz: -7,
    lookDy: 2.36,
  },
  {
    name: '18_past_crest',
    z: 183,
    camDx: -1.4,
    camDz: -2.6,
    camDy: -0.34,
    lookDz: 7,
    lookDy: 3.37,
  },
  {
    name: '19_ascending_1',
    z: 187,
    camDx: 1.4,
    camDz: -2.6,
    camDy: -1.57,
    lookDz: 7,
    lookDy: 3.18,
  },
  {
    name: '20_ascending_2',
    z: 190,
    camDx: -1.4,
    camDz: -2.6,
    camDy: -1.18,
    lookDz: 7,
    lookDy: 3.19,
  },
  {
    name: '21_ascending_3',
    z: 194,
    camDx: 1.4,
    camDz: -2.6,
    camDy: -1.18,
    lookDz: 7,
    lookDy: 3.19,
  },
  {
    name: '22_leaving_scurve',
    z: 208,
    camDx: -1.4,
    camDz: -2.6,
    camDy: -1.19,
    lookDz: 7,
    lookDy: 3.16,
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
    { ...s, x: TX_AT(s.z) },
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
    { ...s, x: TX_AT(s.z), standY: standY(s.z), eyeY: eyeY(s.z) },
  );
  await capture(s.name);
}

await browser.close();
console.log('wrote screenshots to', OUT);
