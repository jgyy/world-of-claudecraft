// Screenshots of the Eastbrook Vale keep (src/sim/content/keep.ts,
// src/render/voxel_building.ts, src/render/keep_interior_decor.ts): the
// textured exterior from two angles, all 3 floor interiors (each from two
// angles covering the room's furniture), a stairwell transition, a zoomed-in
// shot proving the camera zoom clamp keeps the walls opaque, and a torch
// lighting close-up. Forces `?gfx=ultra` (post pipeline, SSAO, MSAA x4, full
// PBR materials, see src/render/gfx.ts) so the shots reflect the real max
// visual quality, not whatever tier the browser would auto-detect.
// Needs `npm run dev` running. Browser via scripts/browser_path.mjs.
import fs from 'node:fs';
import puppeteer from 'puppeteer-core';

import { BROWSER_PATH as EDGE } from './browser_path.mjs';

const BASE_URL = process.env.GAME_URL ?? 'http://localhost:5173';
const URL = `${BASE_URL}${BASE_URL.includes('?') ? '&' : '?'}gfx=ultra`;
const OUT = process.env.OUT_DIR ?? 'docs/screenshots';
fs.mkdirSync(OUT, { recursive: true });

const browser = await puppeteer.launch({
  executablePath: EDGE,
  headless: 'new',
  args: ['--window-size=1600,900', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  defaultViewport: { width: 1600, height: 900 },
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGEERROR:', e.message));

let booted = false;
for (let attempt = 0; attempt < 4 && !booted; attempt++) {
  try {
    await page.goto(URL, { waitUntil: 'load', timeout: 45000 });
    await page.waitForSelector('#btn-offline', { timeout: 30000 });
    await new Promise((r) => setTimeout(r, 2500));
    await page.evaluate(() => document.querySelector('#btn-offline').click());
    await new Promise((r) => setTimeout(r, 400));
    await page.type('#char-name', 'Keeper');
    await page.evaluate(() => {
      document.querySelector('#offline-select .mini-class[data-class="warrior"]').click();
      document.querySelector('#btn-start-offline').click();
    });
    await page.waitForFunction(() => !!window.__game?.sim?.player, {
      timeout: 120000,
      polling: 500,
    });
    booted = true;
  } catch (err) {
    console.log(`boot attempt ${attempt + 1} failed:`, err.message);
  }
}
if (!booted) {
  await browser.close();
  throw new Error('could not boot the offline world');
}
await new Promise((r) => setTimeout(r, 2500));
await page.evaluate(() => {
  const skip = [...document.querySelectorAll('button')].find((b) =>
    (b.textContent || '').includes('Skip Tutorial'),
  );
  skip?.click();
});
// The new-character spawn cinematic (src/game/spawn_cinematic.ts) drives
// input.camYaw/camPitch/camDist for its own fixed 9s duration regardless of
// where the player is teleported; let it finish before taking any editorCam
// shots or it wins the frame over our framing.
await new Promise((r) => setTimeout(r, 9500));

// God-mode + teleport helper: every reposition zeroes fall damage risk
// (maxHp/hp maxed, dead/ghost cleared) BEFORE moving, since the tall
// exterior shot can otherwise leave the player dead for the interior steps.
async function teleport(x, z) {
  await page.evaluate(
    (x, z) => {
      const g = window.__game;
      const p = g.sim.player;
      p.maxHp = 99999;
      p.hp = 99999;
      p.dead = false;
      p.ghost = false;
      p.pos.x = x;
      p.pos.z = z;
      p.prevPos.x = x;
      p.prevPos.z = z;
    },
    x,
    z,
  );
}

async function settle(ms) {
  await new Promise((r) => setTimeout(r, ms));
}

async function shot(name, cam, target, settleMs = 1600) {
  await teleport(cam.x, cam.z);
  await settle(250); // let the sim settle ground y
  await page.evaluate(
    (c, t) => {
      const g = window.__game;
      const p = g.sim.player;
      const gy = c.y ?? p.pos.y;
      const dx = t.x - c.x;
      const dz = t.z - c.z;
      const dl = Math.hypot(dx, dz) || 1;
      // step the player back a hair so the rig stays out of frame
      p.pos.x = c.x - (dx / dl) * 2;
      p.pos.z = c.z - (dz / dl) * 2;
      p.prevPos.x = p.pos.x;
      p.prevPos.z = p.pos.z;
      g.renderer.editorCam = {
        pos: { x: c.x, y: gy + c.h, z: c.z },
        target: { x: t.x, y: gy + t.h, z: t.z },
      };
    },
    cam,
    target,
  );
  await settle(settleMs);
  await page.screenshot({ path: `${OUT}/${name}.png` });
  console.log('wrote', `${OUT}/${name}.png`);
}

// The keep sits at (-120, -30) with a 14x14 footprint, the door on the
// south wall, and the two stair landings at (-116,-27) and (-124,-27)
// (see src/sim/content/keep.ts: KEEP_POS, KEEP_STAIRS).
const KX = -120;
const KZ = -30;
const LANDING_1_2 = { x: KX + 4, z: KZ + 3 }; // floor 1 <-> 2
const LANDING_2_3 = { x: KX - 4, z: KZ + 3 }; // floor 2 <-> 3

// 1. Exterior, front: from the south, straight on to the textured door
// frame + window insets (KEEP_HALF=7, KEEP_TOTAL_HEIGHT=3*4+0.5=12.5).
await shot('keep-01-exterior-front', { x: KX, z: KZ - 22, h: 6 }, { x: KX, z: KZ - 3, h: 4 });

// 2. Exterior, 3/4 angle: from the southeast, showing the pitched roof
// silhouette and the stone/plaster band split on the walls.
await shot('keep-02-exterior-angle', { x: KX + 20, z: KZ - 22, h: 12 }, { x: KX, z: KZ - 3, h: 6 });

// Ground truth for the building's base Y: settle OUTSIDE the footprint (pure
// outdoor terrain physics, unambiguous) rather than trusting p.pos.y right at
// the door threshold, so every interior camera below is framed at the real
// floor height (KEEP_FLOOR_HEIGHT=4 apart) instead of wherever the player
// physically settled (colliders.ts is column-based: the player's own y never
// actually rises between floors, only activeFloor does).
await teleport(KX, KZ - 20);
await settle(500);
const baseY = await page.evaluate(() => window.__game.sim.player.pos.y);
console.log('keep base Y (outdoor ground):', baseY);
const floorY = (floor) => baseY + (floor - 1) * 4 + 1.6; // eye height above that floor's surface

// 3. Walk in the door onto floor 1 via real gameplay (walk into the
// footprint the same way a player would; the sim's own per-tick check,
// keep_floor.ts's nextKeepState, flips activeFloor 0 -> 1), then shoot the
// great hall (long table + chairs) from a wide angle, then a close angle on
// the furniture.
await teleport(KX, KZ);
await settle(500);
const floor1 = await page.evaluate(() => window.__game.sim.player.activeFloor);
console.log('activeFloor after walking in the door:', floor1);
await shot(
  'keep-03-floor1-hall-wide',
  { x: KX, z: KZ, y: floorY(1), h: 0 },
  { x: KX + 4, z: KZ + 3, y: floorY(1), h: 0 },
  1200,
);
await shot(
  'keep-04-floor1-hall-close',
  { x: KX + 2, z: KZ + 1.5, y: floorY(1), h: 0 },
  { x: KX, z: KZ + 0.5, y: floorY(1), h: -0.4 },
  1000,
);

// 4. Step onto the floor1<->2 landing to trigger the transition, then move
// OFF the landing's trigger radius (KEEP_STAIRS r=1.6) before framing the
// shot: shot() repositions the player to its own camera coordinates, and if
// those were still the landing point, the landing's two-way trigger would
// immediately flip the floor back down while the frame settles. Frame the
// landing itself first as the stairwell transition shot.
await teleport(LANDING_1_2.x, LANDING_1_2.z);
await settle(500);
const floor2 = await page.evaluate(() => window.__game.sim.player.activeFloor);
console.log('activeFloor after the first landing (1 -> 2):', floor2);
await shot(
  'keep-05-stairwell-transition',
  { x: KX + 2, z: KZ, y: floorY(1) + 1, h: 0 },
  { x: LANDING_1_2.x, z: LANDING_1_2.z, y: floorY(1), h: 0 },
  1000,
);
await teleport(KX - 4, KZ); // step off the landing, staying on floor 2
await settle(300);
await shot(
  'keep-06-floor2-storage-wide',
  { x: KX - 4, z: KZ, y: floorY(2), h: 0 },
  { x: KX + 4, z: KZ + 3, y: floorY(2), h: 0 },
  1200,
);
await shot(
  'keep-07-floor2-storage-close',
  { x: KX + 3, z: KZ + 2, y: floorY(2), h: 0 },
  { x: KX + 5.5, z: KZ + 5.5, y: floorY(2), h: -0.3 },
  1000,
);

// 5. Step onto the floor2<->3 landing to trigger the transition, then move
// off it the same way before framing the floor 3 shots.
await teleport(LANDING_2_3.x, LANDING_2_3.z);
await settle(500);
const floor3 = await page.evaluate(() => window.__game.sim.player.activeFloor);
await teleport(KX + 4, KZ); // step off the landing, staying on floor 3
await settle(300);
console.log('activeFloor after the second landing (2 -> 3):', floor3);
await shot(
  'keep-08-floor3-study-wide',
  { x: KX + 4, z: KZ, y: floorY(3), h: 0 },
  { x: KX - 4, z: KZ + 3, y: floorY(3), h: 0 },
  1200,
);
await shot(
  'keep-09-floor3-study-close',
  { x: KX - 2, z: KZ - 1, y: floorY(3), h: 0 },
  { x: KX + 5, z: KZ + 5, y: floorY(3), h: -0.3 },
  1000,
);

// 6. Torch lighting close-up: frame the floor-1 west wall torch face-on so a
// dim interior area lit only by its PointLight is clearly visible.
await teleport(KX, KZ);
await settle(400);
await shot(
  'keep-10-torch-lighting',
  { x: KX - 2, z: KZ + 0.5, y: floorY(1), h: 0 },
  { x: KX - 6.7, z: KZ, y: floorY(1), h: 0 },
  1200,
);

// 7. Zoomed-in shot proving the real chase-camera zoom clamp (main.ts calls
// input.setMaxZoomDist(activeFloor ? 6 : 22) every frame) keeps the player
// from pulling the camera out through the walls while inside: drop
// editorCam so the normal follow camera drives the frame, try to zoom the
// wheel all the way out (as if the player scrolled to the outdoor max of
// 22), and confirm the live loop re-clamps it back down.
const clampInfo = await page.evaluate(async () => {
  const g = window.__game;
  g.renderer.editorCam = null;
  g.input.camYaw = 0; // look straight along +z, toward the exterior wall
  g.input.camPitch = 0.1;
  g.input.zoomBy(999); // simulate scrolling all the way out
  const afterScroll = g.input.camDist;
  await new Promise((r) => setTimeout(r, 300)); // let a couple of real frames run
  const afterFrames = g.input.camDist;
  return {
    activeFloor: g.sim.player.activeFloor,
    maxZoomDist: g.input.maxZoomDist,
    afterScroll,
    afterFrames,
  };
});
console.log('zoom clamp:', JSON.stringify(clampInfo));
if (clampInfo.afterFrames > 6.5) {
  console.log('WARNING: zoom clamp did not tighten as expected:', clampInfo);
}
await settle(1200);
await page.screenshot({ path: `${OUT}/keep-11-zoom-clamp-inside.png` });
console.log('wrote', `${OUT}/keep-11-zoom-clamp-inside.png`);

await browser.close();
console.log('done ->', OUT);
