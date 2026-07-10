// Screenshots of the Eastbrook Vale keep (src/sim/content/keep.ts,
// src/render/voxel_building.ts, src/render/keep_interior_decor.ts,
// src/render/keep_stairs.ts): the flattened terrain pad + four-story-plus-attic
// exterior from several angles, every floor interior (wide + close), the real
// visible staircases at each transition, the attic under the pitched roof, the
// carved-through windows (inside looking out AND outside), and interior torch
// lighting. Forces `?gfx=ultra` (post pipeline, SSAO, MSAA x4, full PBR
// materials). Needs `npm run dev` running. Browser via scripts/browser_path.mjs.
//
// The swiftshader software GL used here leaks GPU memory over a long ultra tour
// and eventually crashes the tab, so this driver auto-relaunches the browser
// and reboots the offline world when a shot fails, then retries it. Interior
// floors are set directly on the local player (god-mode screenshot rig) so the
// right per-floor decor is always framed regardless of stair-trigger timing.
import fs from 'node:fs';
import puppeteer from 'puppeteer-core';

import { BROWSER_PATH as EDGE } from './browser_path.mjs';

const BASE_URL = process.env.GAME_URL ?? 'http://localhost:5173';
const URL = `${BASE_URL}${BASE_URL.includes('?') ? '&' : '?'}gfx=ultra`;
const OUT = process.env.OUT_DIR ?? 'docs/screenshots';
fs.mkdirSync(OUT, { recursive: true });

let browser = null;
let page = null;

async function boot() {
  browser = await puppeteer.launch({
    executablePath: EDGE,
    headless: 'new',
    args: [
      '--window-size=1600,900',
      '--use-angle=swiftshader',
      '--enable-unsafe-swiftshader',
      '--no-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu-sandbox',
    ],
    defaultViewport: { width: 1600, height: 900 },
  });
  page = await browser.newPage();
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
  if (!booted) throw new Error('could not boot the offline world');
  await new Promise((r) => setTimeout(r, 2500));
  await page.evaluate(() => {
    const skip = [...document.querySelectorAll('button')].find((b) =>
      (b.textContent || '').includes('Skip Tutorial'),
    );
    skip?.click();
  });
  // Let the spawn cinematic (src/game/spawn_cinematic.ts) finish before any
  // editorCam shots or it wins the frame.
  await new Promise((r) => setTimeout(r, 9500));
}

async function reboot() {
  try {
    await browser?.close();
  } catch {}
  await boot();
}

async function settle(ms) {
  await new Promise((r) => setTimeout(r, ms));
}

// Frame + capture one shot. `floor` (0 = exterior) parks the local player off
// any stair landing and stamps activeFloor directly so the interior decor and
// per-floor markers match, then drives editorCam. `cam`/`target` are world
// coords with a height offset `h` above the resolved floor Y (or an absolute
// `y`). Auto-reboots + retries once if the tab has crashed.
async function shot(name, floor, cam, target, settleMs = 1300) {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      await page.evaluate(
        (c, t, fl) => {
          const g = window.__game;
          const p = g.sim.player;
          p.maxHp = 99999;
          p.hp = 99999;
          p.dead = false;
          p.ghost = false;
          // Park at keep center (off every stair landing) so nextKeepState
          // preserves the stamped floor, then stamp activeFloor.
          p.pos.x = -120;
          p.pos.z = -30;
          p.prevPos.x = -120;
          p.prevPos.z = -30;
          p.activeFloor = fl;
          p.keepLandingLock = -1;
          const gy = c.y ?? p.pos.y;
          g.renderer.editorCam = {
            pos: { x: c.x, y: gy + (c.h ?? 0), z: c.z },
            target: { x: t.x, y: (t.y ?? gy) + (t.h ?? 0), z: t.z },
          };
        },
        cam,
        target,
        floor,
      );
      await settle(settleMs);
      await page.screenshot({ path: `${OUT}/${name}.png` });
      console.log('wrote', `${OUT}/${name}.png`);
      return;
    } catch (err) {
      console.log(`shot ${name} failed (attempt ${attempt + 1}):`, err.message);
      if (attempt === 0) await reboot();
    }
  }
  console.log(`GIVING UP on ${name}`);
}

await boot();

// Base ground Y at the keep (flat pad), sampled from outside the footprint.
await page.evaluate(() => {
  const p = window.__game.sim.player;
  p.pos.x = -120;
  p.pos.z = -50;
  p.prevPos.x = -120;
  p.prevPos.z = -50;
});
await settle(500);
const baseY = await page.evaluate(() => window.__game.sim.player.pos.y);
console.log('keep base Y (flat pad):', baseY);

const KX = -120;
const KZ = -30;
const FH = 4.5;
const floorY = (floor) => baseY + (floor - 1) * FH; // walkable surface Y
const eye = (floor) => floorY(floor) + 1.6;

// Landings (KEEP_STAIRS): alternating corners.
const L12 = { x: KX + 4, z: KZ + 3 };
const L23 = { x: KX - 4, z: KZ + 3 };
const L34 = { x: KX + 4, z: KZ - 3 };
const L45 = { x: KX - 4, z: KZ - 3 };

// ---- Exteriors (floor 0): flat pad, four stories + attic, carved windows ----
await shot(
  'keep-ext-front',
  0,
  { x: KX, z: KZ - 26, y: baseY, h: 8 },
  { x: KX, z: KZ, y: baseY, h: 9 },
);
await shot(
  'keep-ext-southeast',
  0,
  { x: KX + 26, z: KZ - 26, y: baseY, h: 14 },
  { x: KX, z: KZ, y: baseY, h: 8 },
);
await shot(
  'keep-ext-northwest',
  0,
  { x: KX - 26, z: KZ + 26, y: baseY, h: 14 },
  { x: KX, z: KZ, y: baseY, h: 8 },
);
await shot(
  'keep-ext-groundline',
  0,
  { x: KX, z: KZ - 20, y: baseY, h: 1.2 },
  { x: KX, z: KZ, y: baseY, h: 3 },
);
await shot(
  'keep-ext-high',
  0,
  { x: KX + 30, z: KZ - 30, y: baseY, h: 24 },
  { x: KX, z: KZ, y: baseY, h: 10 },
);
await shot(
  'keep-windows-outside',
  0,
  { x: KX + 22, z: KZ + 4, y: baseY, h: 10 },
  { x: KX, z: KZ, y: baseY, h: 9 },
);

// ---- Floor 1 (great hall) ----
await shot('keep-floor1-wide', 1, { x: KX, z: KZ, y: eye(1) }, { x: KX + 4, z: KZ + 3, y: eye(1) });
await shot(
  'keep-floor1-close',
  1,
  { x: KX + 2, z: KZ + 1.5, y: eye(1) },
  { x: KX, z: KZ + 0.5, y: eye(1), h: -0.4 },
);
await shot(
  'keep-floor1-window-inside',
  1,
  { x: KX, z: KZ + 2, y: eye(1) },
  { x: KX + 3.4, z: KZ + 9, y: eye(1), h: 0.2 },
);

// ---- Stairs 1 -> 2, then floor 2 (storage) ----
await shot(
  'keep-stairs-1-2',
  1,
  { x: KX + 1.5, z: KZ + 1, y: eye(1), h: 0.4 },
  { x: L12.x, z: L12.z, y: floorY(1) },
);
await shot(
  'keep-floor2-wide',
  2,
  { x: KX - 4, z: KZ, y: eye(2) },
  { x: KX + 4, z: KZ + 3, y: eye(2) },
);
await shot(
  'keep-floor2-close',
  2,
  { x: KX + 3, z: KZ + 2, y: eye(2) },
  { x: KX + 5.5, z: KZ + 5.5, y: eye(2), h: -0.3 },
);

// ---- Stairs 2 -> 3, then floor 3 (study) ----
await shot(
  'keep-stairs-2-3',
  2,
  { x: KX - 1.5, z: KZ + 1, y: eye(2), h: 0.4 },
  { x: L23.x, z: L23.z, y: floorY(2) },
);
await shot(
  'keep-floor3-wide',
  3,
  { x: KX + 4, z: KZ, y: eye(3) },
  { x: KX - 4, z: KZ + 3, y: eye(3) },
);
await shot(
  'keep-floor3-close',
  3,
  { x: KX - 2, z: KZ - 1, y: eye(3) },
  { x: KX + 5, z: KZ + 5, y: eye(3), h: -0.3 },
);

// ---- Stairs 3 -> 4, then floor 4 (solar) ----
await shot(
  'keep-stairs-3-4',
  3,
  { x: KX + 1.5, z: KZ - 1, y: eye(3), h: 0.4 },
  { x: L34.x, z: L34.z, y: floorY(3) },
);
await shot(
  'keep-floor4-wide',
  4,
  { x: KX - 4, z: KZ, y: eye(4) },
  { x: KX + 4, z: KZ + 3, y: eye(4) },
);
await shot(
  'keep-floor4-close',
  4,
  { x: KX + 2, z: KZ + 2, y: eye(4) },
  { x: KX - 3, z: KZ + 4, y: eye(4), h: -0.3 },
);
await shot(
  'keep-floor4-window-inside',
  4,
  { x: KX + 2, z: KZ, y: eye(4) },
  { x: KX + 9, z: KZ + 3.4, y: eye(4), h: 0.2 },
);

// ---- Stairs 4 -> attic, then the attic under the pitched roof ----
await shot(
  'keep-stairs-4-attic',
  4,
  { x: KX - 1.5, z: KZ - 1, y: eye(4), h: 0.4 },
  { x: L45.x, z: L45.z, y: floorY(4) },
);
await shot(
  'keep-attic-wide',
  5,
  { x: KX + 3, z: KZ + 3, y: eye(5) },
  { x: KX - 1, z: KZ - 1, y: eye(5), h: 0.4 },
);
await shot(
  'keep-attic-close',
  5,
  { x: KX - 1, z: KZ + 2, y: eye(5) },
  { x: KX, z: KZ - 1, y: eye(5) },
);
await shot(
  'keep-attic-roofline',
  5,
  { x: KX + 2, z: KZ, y: eye(5) },
  { x: KX - 3, z: KZ, y: eye(5), h: 1.8 },
);

// ---- Interior torch lighting on the ground floor ----
await shot(
  'keep-torch-lighting',
  1,
  { x: KX - 2, z: KZ + 0.5, y: eye(1) },
  { x: KX - 6.7, z: KZ, y: eye(1) },
);

await browser.close();
console.log('done ->', OUT);
