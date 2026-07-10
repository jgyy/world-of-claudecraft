// Screenshot tour for the vale_marsh_ridge_tunnel (content/tunnels.ts): a
// real, walkable through-tunnel connecting Eastbrook Vale (zone1) to Mirefen
// Marsh (zone2) on the EAST side (x=128), rendered by the production
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
//
// Round 8: fixed the backstop safety planes reading as a giant floating rock
// slab (removed the enclosing box entirely, see tunnel_overlay.ts), shifted
// both mouths east from x=110 to x=128 to clear the Fallen Chapel mob camp,
// deepened the crest from y=-37 to y=-52.5, and pushed both mouths further
// out (z=66/294, was z=96/264) to keep every segment under the 30 degree
// grade cap given the extra depth. All coordinates and floor heights below
// are recomputed for this geometry (world seed 20061).
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

// The tunnel S-curves in x between the two mouths (both at x=128, see
// content/tunnels.ts); TX_AT gives the interpolated centerline x at a given
// z, matching the waypoint polyline exactly, so exterior/interior shots stay
// centered on the actual passage.
const TUNNEL_WAYPOINTS_XZ = [
  { x: 128, z: 66 },
  { x: 134, z: 88 },
  { x: 130, z: 114 },
  { x: 122, z: 142 },
  { x: 128, z: 180 },
  { x: 134, z: 218 },
  { x: 130, z: 246 },
  { x: 122, z: 272 },
  { x: 128, z: 294 },
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
// seed 20061, round 8: deeper crest, y=-57.5 at x=128 exactly - the sim
// crest waypoint itself is y=-52.5, but tunnelColumnAt reports the true
// floor-carve boundary, slightly below the waypoint's own centerline). The
// player stands 0.15yd above it (never clips into the mesh).
const FLOOR = {
  100: -17.12,
  106: -19.98,
  112: -22.86,
  118: -25.89,
  124: -28.95,
  130: -32.01,
  136: -35.06,
  142: -38.27,
  148: -41.51,
  154: -44.74,
  160: -47.96,
  166: -51.18,
  172: -54.39,
  178: -57.39,
  180: -57.54,
  184: -56.92,
  190: -53.6,
  196: -50.67,
  202: -47.72,
  208: -44.77,
  214: -41.81,
  220: -38.88,
  226: -36.03,
  232: -33.23,
  238: -30.44,
  244: -27.64,
  250: -24.83,
};
const standY = (z) => FLOOR[z] + 0.15;
// Base eye height for interior shots: floor + standing height + a bit more,
// roughly mid-chamber. camDy/lookDy below are small deltas off this base.
const eyeY = (z) => FLOOR[z] + 2.2;

// Exterior shots: ordinary chase camera, character renders normally. Both
// mouths now sit at x=128 (round 8: shifted east from x=110 to clear the
// Fallen Chapel mob camp), z=66/294 (moved further out to keep the deeper
// crest under a 30 degree grade), each cut into its own irregular,
// foliage-framed entrance mound (moundRadius 14yd, moundHeight 12yd) with no
// tree/rock/bush decoration within its clearance radius (world.ts
// isNearTunnelMound). 23 shots, including sky-checks and mound-overhead
// passes that verify the round-8 backstop fix (no floating rock slab, no
// rocky sky) and the clear approach at both mouths.
const EXTERIOR_SHOTS = [
  { name: '00_overhead_scurve_zone1', z: 112, camDist: 40, camPitch: -0.9, camYaw: 0.15 },
  { name: '00b_overhead_scurve_full', z: 180, camDist: 70, camPitch: -0.96, camYaw: 0.15 },
  { name: '01_wide_establishing_zone1', z: 10, camDist: 16, camPitch: -0.05, camYaw: 0 },
  { name: '02_approaching_ridge', z: 38, camDist: 14, camPitch: -0.1, camYaw: 0 },
  { name: '03_mouth_a_exterior_wide', z: 50, camDist: 15, camPitch: -0.12, camYaw: 0 },
  { name: '04_mouth_a_closeup', z: 60, camDist: 11, camPitch: -0.03, camYaw: 0 },
  // Frontal, dead-on views of each mouth: the shape a reviewer wants to read
  // as a tall, upright doorway (archScale 2.6 / floorScale 0.85), never a
  // round hole lying flat on the ground to fall through.
  { name: '04b_mouth_a_door_frontal', z: 64, camDist: 8, camPitch: 0, camYaw: 0 },
  { name: '05_mouth_a_closeup_side_angle', z: 60, camDist: 11, camPitch: -0.02, camYaw: 0.5 },
  { name: '06_mouth_b_closeup', z: 300, camDist: 11, camPitch: -0.03, camYaw: Math.PI },
  { name: '06b_mouth_b_door_frontal', z: 296, camDist: 8, camPitch: 0, camYaw: Math.PI },
  { name: '07_mouth_b_exterior_wide', z: 310, camDist: 15, camPitch: -0.12, camYaw: Math.PI },
  { name: '08_wide_establishing_zone2', z: 330, camDist: 16, camPitch: -0.05, camYaw: Math.PI },
  // Round 8 fixes: the backstop safety planes used to be one box unioning
  // EVERY excluded terrain chunk across both tunnels in the level, and even
  // once scoped per-tunnel, the enclosing box's wall/ceiling planes still
  // poked up out of the ground wherever ambient terrain sat lower than the
  // tunnel/mound - a giant floating rock slab, not blended terrain at all.
  // Removed entirely in favor of a deep, invisible floor cap (tunnel_overlay
  // .ts). These shots verify open sky and no stray geometry at several
  // points along the whole (now longer, deeper) route.
  {
    name: '23_sky_check_zone1_looking_up',
    z: 100,
    xOff: 24,
    camDist: 6,
    camPitch: -1.4,
    camYaw: 0,
  },
  {
    name: '23b_sky_check_zone1_looking_up_mid',
    z: 150,
    xOff: 28,
    camDist: 6,
    camPitch: -1.4,
    camYaw: 0,
  },
  {
    name: '24_sky_check_zone2_looking_up',
    z: 260,
    xOff: 24,
    camDist: 6,
    camPitch: -1.4,
    camYaw: 0,
  },
  {
    name: '24b_sky_check_zone2_looking_up_mid',
    z: 210,
    xOff: 28,
    camDist: 6,
    camPitch: -1.4,
    camYaw: 0,
  },
  {
    name: '25_open_field_between_mounds_wide',
    z: 190,
    xOff: 30,
    camDist: 20,
    camPitch: -0.1,
    camYaw: Math.PI / 2,
  },
  {
    name: '25b_open_field_between_mounds_wide_west',
    z: 150,
    xOff: -30,
    camDist: 20,
    camPitch: -0.1,
    camYaw: -Math.PI / 2,
  },
  // Overhead top-down of each mound: confirms no tree/rock/bush decoration
  // spawns inside or clashing with the entrance knoll, and the mound reads
  // as one continuous piece of terrain, never a separate floating structure.
  { name: '26_mouth_a_overhead_no_clutter', z: 66, camDist: 30, camPitch: -1.5, camYaw: 0.4 },
  { name: '27_mouth_b_overhead_no_clutter', z: 294, camDist: 30, camPitch: -1.5, camYaw: 0.4 },
  // Ground-level approach: the cleared area right around the entrance mound,
  // confirming the doorway itself reads as open and unobstructed.
  {
    name: '28_mouth_a_ground_level_clear_approach',
    z: 54,
    camDist: 9,
    camPitch: -0.06,
    camYaw: 0,
  },
  {
    name: '29_mouth_b_ground_level_clear_approach',
    z: 306,
    camDist: 9,
    camPitch: -0.06,
    camYaw: Math.PI,
  },
  // Wide overhead pass at the crest emphasizing the extra round-8 depth.
  { name: '30_deeper_crest_wide', z: 180, camDist: 55, camPitch: -0.55, camYaw: 0.7 },
];

// Interior shots: free editorCam, framed down the tunnel's own axis but
// offset to the side (camDx) so the player's own body/helmet, right at the
// axis center, never fills the frame the way it does dead-on from behind.
// Round 8: the safe fully-enclosed span widened along with the deeper,
// longer route (z=100..250, was z=163..197), so this pass covers 27 stops
// across the whole descent/ascent instead of just the crest neighborhood.
// camDy is a fixed mild lift for framing; lookDy is computed from the real
// tunnel floor 7yd further along the player's own direction of travel
// (tunnel_traversal.ts's tunnelColumnAt), so the look-at point always lands
// at floor height on the sloped stretches instead of in the ceiling or
// underfoot. Every position verified open (not solid) against the live
// voxel field with isSolidVoxel, not eyeballed.
const CAM_DY = 0.3;
const LOOK_DZ = 7;
const INTERIOR_SHOTS = [
  { name: '09_entering_scurve', z: 100, camDx: 1.4, lookDy: -3.33 },
  { name: '09b_descending_0', z: 106, camDx: -1.4, lookDy: -3.37 },
  { name: '10_descending_1', z: 112, camDx: 1.4, lookDy: -3.54 },
  { name: '10b_descending_1b', z: 118, camDx: -1.4, lookDy: -3.57 },
  { name: '11_descending_2', z: 124, camDx: 1.4, lookDy: -3.57 },
  { name: '11b_descending_2b', z: 130, camDx: -1.4, lookDy: -3.68 },
  { name: '12_descending_3', z: 136, camDx: 1.4, lookDy: -3.75 },
  { name: '12b_descending_3b', z: 142, camDx: -1.4, lookDy: -3.78 },
  { name: '13_approaching_crest_1', z: 148, camDx: 1.4, lookDy: -3.77 },
  { name: '13b_approaching_crest_1b', z: 154, camDx: -1.4, lookDy: -3.76 },
  { name: '14_approaching_crest_2', z: 160, camDx: 1.4, lookDy: -3.75 },
  { name: '14b_approaching_crest_2b', z: 166, camDx: -1.4, lookDy: -4.03 },
  { name: '15_near_crest', z: 172, camDx: 1.4, lookDy: -3.11 },
  { name: '15b_near_crest_deep', z: 178, camDx: -1.4, lookDy: 0.87 },
  { name: '16_crest_boundary_z180_deep', z: 180, camDx: 1.4, lookDy: 2.33 },
  {
    name: '17_crest_boundary_z180_facing_back',
    z: 180,
    camDx: -1.4,
    camDz: 2.6,
    lookDz: -7,
    lookDy: 2.33,
  },
  { name: '18_past_crest', z: 184, camDx: -1.4, lookDy: 3.8 },
  { name: '18b_past_crest_b', z: 190, camDx: 1.4, lookDy: 3.43 },
  { name: '19_ascending_1', z: 196, camDx: -1.4, lookDy: 3.43 },
  { name: '19b_ascending_1b', z: 202, camDx: 1.4, lookDy: 3.44 },
  { name: '20_ascending_2', z: 208, camDx: -1.4, lookDy: 3.45 },
  { name: '20b_ascending_2b', z: 214, camDx: 1.4, lookDy: 3.36 },
  { name: '21_ascending_3', z: 220, camDx: -1.4, lookDy: 3.32 },
  { name: '21b_ascending_3b', z: 226, camDx: 1.4, lookDy: 3.26 },
  { name: '22_leaving_scurve', z: 232, camDx: -1.4, lookDy: 3.26 },
  { name: '22b_leaving_scurve_b', z: 238, camDx: 1.4, lookDy: 3.27 },
  { name: '22c_nearing_mouth_b', z: 244, camDx: -1.4, lookDy: 3.25 },
  { name: '22d_almost_at_mouth_b', z: 250, camDx: 1.4, lookDy: 3.05 },
].map((s) => ({
  camDz: -2.6,
  lookDz: LOOK_DZ,
  camDy: CAM_DY,
  ...s,
}));

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
    { ...s, x: TX_AT(s.z) + (s.xOff ?? 0) },
  );
  await capture(s.name);
}

// The world map marks each mound as a real "Cave" landmark
// (map_tunnel_portals.ts / map_window_painter.ts), mirroring the existing
// dungeon-portal dot+label - the natural sign in the map, matching the mound
// + worn path + framing foliage already read in the 3D world
// (tunnel_overlay.ts's addMouthFoliage).
async function captureMap(name, z) {
  await page.evaluate((zz) => {
    const g = window.__game;
    g.sim.player.pos.z = zz;
  }, z);
  await new Promise((r) => setTimeout(r, 200));
  await page.keyboard.press('KeyM');
  await new Promise((r) => setTimeout(r, 600)); // let the map window render + redraw
  await page.screenshot({ path: `${OUT}/tunnel_${name}.png` });
  console.log('captured', name);
  await page.keyboard.press('KeyM');
  await new Promise((r) => setTimeout(r, 200));
}
await captureMap('31_map_zone1_cave_marker', 40);
await captureMap('32_map_zone2_cave_marker', 330);

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
