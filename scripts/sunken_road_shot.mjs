// Visual proof of the Sunken Road: a deep, enclosed tunnel connecting
// Eastbrook Vale (Zone 1) to Mirefen Marsh (Zone 2). Boots the offline game,
// skips the first-spawn intro cinematic, teleports through the tunnel at
// several waypoints, and captures the world map for both zones plus the
// tunnel's own dedicated underground map schematic.
//   node scripts/sunken_road_shot.mjs    (needs `npm run dev` on :5173)
import fs from 'node:fs';
import puppeteer from 'puppeteer-core';

import { BROWSER_PATH as EDGE } from './browser_path.mjs';

const URL = process.env.GAME_URL ?? 'http://localhost:5173';
fs.mkdirSync('docs/screenshots', { recursive: true });

const browser = await puppeteer.launch({
  executablePath: EDGE,
  headless: 'new',
  args: ['--window-size=1600,900', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  defaultViewport: { width: 1600, height: 900 },
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGEERROR:', e.message));

await page.goto(URL, { waitUntil: 'networkidle0', timeout: 30000 });
const jsClick = (sel) =>
  page.evaluate((s) => {
    const el = document.querySelector(s);
    if (!el) throw new Error(`missing ${s}`);
    el.click();
  }, sel);
await page.waitForSelector('#btn-offline', { timeout: 20000 });
await new Promise((r) => setTimeout(r, 400));
await jsClick('#btn-offline');
await new Promise((r) => setTimeout(r, 300));
await page.type('#char-name', 'Tunneler');
await jsClick('#offline-select .mini-class[data-class="warrior"]');
await jsClick('#btn-start-offline');
await page.waitForFunction(() => window.__game?.sim?.player, { timeout: 40000 });
await new Promise((r) => setTimeout(r, 500));

// Skip the first-spawn intro cinematic (opens far out and glides in over
// several seconds): Escape jumps straight to the end, same as a player would.
await page.keyboard.press('Escape');
await new Promise((r) => setTimeout(r, 300));

// Dismiss the new-adventurer tutorial overlay, which otherwise intercepts input.
await page.evaluate(() => {
  const btn = [...document.querySelectorAll('button')].find((b) =>
    /skip tutorial/i.test(b.textContent || ''),
  );
  btn?.click();
});
await new Promise((r) => setTimeout(r, 400));

// Level up so a stray camp mob doesn't kill the camera mid-tour.
await page.evaluate(() => window.__game.sim.chat('/dev level 10'));
await new Promise((r) => setTimeout(r, 300));

async function teleportAndShoot(x, z, name, faceDeg, opts = {}) {
  await page.evaluate(
    (px, pz) => {
      window.__game.sim.chat(`/dev tp ${px} ${pz}`);
    },
    x,
    z,
  );
  if (faceDeg !== undefined) {
    await page.evaluate((deg) => {
      window.__game.sim.player.facing = (deg * Math.PI) / 180;
    }, faceDeg);
  }
  if (opts.camDist !== undefined || opts.camPitch !== undefined) {
    await page.evaluate(
      (dist, pitch) => {
        if (dist !== undefined) window.__game.input.camDist = dist;
        if (pitch !== undefined) window.__game.input.camPitch = pitch;
      },
      opts.camDist,
      opts.camPitch,
    );
  }
  await new Promise((r) => setTimeout(r, 700));
  await page.screenshot({ path: `docs/screenshots/${name}.png` });
  console.log(`captured docs/screenshots/${name}.png at (${x},${z})`);
}

// --- Entrances: a wide shot from OUTSIDE each mouth, standing on natural
// grade well clear of the graded ramp and facing straight down it (so the
// walkable descent into the tunnel mouth is unambiguous), then the close
// approach standing at the mouth itself. ---
await teleportAndShoot(-70, -15, 'sunken_road_entrance_wide_zone1', -90, {
  camDist: 25,
  camPitch: -0.7,
});
await teleportAndShoot(-80, -15, 'sunken_road_approach_zone1', -90, {
  camDist: 12,
  camPitch: -0.9,
});

// Foreman Delke, the quest giver standing right at the Eastbrook mouth.
await teleportAndShoot(-85, -12, 'sunken_road_npc_foreman_delke', 160);

// Interior, zone1 stretch (west of Mirror Lake).
await teleportAndShoot(-100, 20, 'sunken_road_interior_1', 180);
await teleportAndShoot(-140, 50, 'sunken_road_interior_2', 180);
await teleportAndShoot(-172, 80, 'sunken_road_interior_3', 180);
await teleportAndShoot(-140, 110, 'sunken_road_interior_4', 200);
// Ridge crossing.
await teleportAndShoot(-110, 180, 'sunken_road_ridge_crossing', 180);
// Interior, zone2 stretch.
await teleportAndShoot(-110, 205, 'sunken_road_interior_5', 180);
await teleportAndShoot(-110, 230, 'sunken_road_interior_6', 180);

// Looking straight up from deep inside the tunnel (well clear of both
// mouths): the enclosed shell should block the sky entirely.
await page.evaluate(() => window.__game.sim.chat('/dev tp -172 80'));
await new Promise((r) => setTimeout(r, 400));
await page.evaluate(() => {
  window.__game.input.camPitch = -1.4;
  window.__game.input.camDist = 8;
});
await new Promise((r) => setTimeout(r, 400));
await page.screenshot({ path: 'docs/screenshots/sunken_road_looking_up.png' });
console.log('captured docs/screenshots/sunken_road_looking_up.png');

// A close shot on one of the crystal glow lights, proving the tunnel is lit by
// its own light sources (not just ambient/sun light dropped underground).
await page.evaluate(() => {
  window.__game.input.camPitch = -0.15;
  window.__game.input.camDist = 5;
});
await new Promise((r) => setTimeout(r, 400));
await page.screenshot({ path: 'docs/screenshots/sunken_road_crystal_light.png' });
console.log('captured docs/screenshots/sunken_road_crystal_light.png');
await page.evaluate(() => {
  window.__game.input.camPitch = -0.3;
  window.__game.input.camDist = 12;
});

// A wide side-on shot, well back from the tunnel, to see the corridor's
// actual cross-section (width vs the shell) from outside/beside it.
await page.evaluate(() => window.__game.sim.chat('/dev tp -110 205'));
await new Promise((r) => setTimeout(r, 300));
await page.evaluate(() => {
  window.__game.input.camDist = 22;
  window.__game.input.camPitch = -0.5;
});
await new Promise((r) => setTimeout(r, 400));
await page.screenshot({ path: 'docs/screenshots/sunken_road_cross_section.png' });
console.log('captured docs/screenshots/sunken_road_cross_section.png');
await page.evaluate(() => {
  window.__game.input.camDist = 12;
});

// The Old Prospector (named elite) at the ridge-crossing camp.
await teleportAndShoot(-108, 178, 'sunken_road_old_prospector', 90, { camDist: 14 });

// A gravemite/stalker camp along the route.
await teleportAndShoot(-110, 230, 'sunken_road_camp', 180, { camDist: 16 });

// Fenbridge mouth: close approach, then a wide outside shot facing down the ramp.
await teleportAndShoot(-125, 258, 'sunken_road_exit_zone2', -90, { camDist: 12, camPitch: -0.9 });
await teleportAndShoot(-115, 258, 'sunken_road_exit_wide_zone2', -90, {
  camDist: 25,
  camPitch: -0.7,
});

// The Sunken Road's OWN underground map: opening the map window while inside
// the tunnel switches to a dedicated schematic instead of the surface map
// (mapWindowMode 'sunkenRoad' branch, src/ui/map_window_view.ts).
await page.evaluate(() => window.__game.sim.chat('/dev tp -172 80'));
await new Promise((r) => setTimeout(r, 400));
await jsClick('#mm-map');
await new Promise((r) => setTimeout(r, 500));
await page.screenshot({ path: 'docs/screenshots/sunken_road_underground_map.png' });
console.log('captured docs/screenshots/sunken_road_underground_map.png');
await jsClick('#mm-map');
await new Promise((r) => setTimeout(r, 300));

// World map: zone 1 (Eastbrook Vale), showing the Sunken Road as a POI on
// the west side, and Mirror Lake as a clean circular lake (no double-ring).
await page.evaluate(() => window.__game.sim.chat('/dev tp 0 0'));
await new Promise((r) => setTimeout(r, 500));
await jsClick('#mm-map');
await new Promise((r) => setTimeout(r, 500));
await page.screenshot({ path: 'docs/screenshots/sunken_road_map_zone1.png' });
console.log('captured docs/screenshots/sunken_road_map_zone1.png');
await jsClick('#mm-map');
await new Promise((r) => setTimeout(r, 300));

// World map: zone 2 (Mirefen Marsh).
await page.evaluate(() => window.__game.sim.chat('/dev tp 0 300'));
await new Promise((r) => setTimeout(r, 500));
await jsClick('#mm-map');
await new Promise((r) => setTimeout(r, 500));
await page.screenshot({ path: 'docs/screenshots/sunken_road_map_zone2.png' });
console.log('captured docs/screenshots/sunken_road_map_zone2.png');

await browser.close();
