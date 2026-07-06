// Screenshots of Glimmervein Cavern (src/sim/content/zone1.ts + zone2.ts +
// src/sim/data.ts GLIMMERVEIN_* + src/render/cave_tunnel.ts): a real
// underground TUNNEL bored under the zone1/zone2 ridge on the east ("right")
// side of both zones, x=110, walkable as ordinary open-world terrain (no
// loading, no instance transition). Unlike an open-air pass or valley, the
// surface above the tunnel stays ordinary ground except at its two small
// mouths: this script deliberately includes an ambient wide shot and an
// in-game top-down camera over the run to show that. Boots the offline
// world with the tutorial and first-spawn cinematic pre-marked seen (clean
// gameplay shots, no onboarding chrome), teleports the player through the
// approach, both ramps, the flat body (camps, ore vein, support pillars),
// both mouths, plus the full HUD world-map for each zone. Needs `npm run
// dev` running. Browser via scripts/browser_path.mjs.

import fs from 'node:fs';
import puppeteer from 'puppeteer-core';

import { BROWSER_PATH as EDGE } from './browser_path.mjs';

const URL = process.env.GAME_URL ?? 'http://localhost:5173';
const OUT = 'docs/screenshots';
fs.mkdirSync(OUT, { recursive: true });

const browser = await puppeteer.launch({
  executablePath: EDGE,
  headless: 'new',
  args: ['--window-size=1600,900', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  defaultViewport: { width: 1600, height: 900 },
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGEERROR:', e.message));

await page.goto(URL, { waitUntil: 'networkidle0', timeout: 30000 });
// No tutorial popup, no first-spawn cinematic: mark both as already-seen
// before the character is created (tutorial.ts STORAGE_KEY, main.ts
// INTRO_SEEN_KEY for the offline:<class>:<name> scope this script always
// uses), so screenshots are clean gameplay shots, not onboarding chrome.
await page.evaluate(() => {
  localStorage.setItem('woc.tutorial.v1', 'done');
  localStorage.setItem('woc_spawn_intro_seen:offline:warrior:Prospector', '1');
});
await page.evaluate(() => document.querySelector('#btn-offline').click());
await new Promise((r) => setTimeout(r, 200));
await page.type('#char-name', 'Prospector');
await page.evaluate(() =>
  document.querySelector('#offline-select .mini-class[data-class="warrior"]').click(),
);
await page.evaluate(() => document.querySelector('#btn-start-offline').click());
await page.waitForFunction(() => window.__game && window.__game.sim, { timeout: 20000 });
await new Promise((r) => setTimeout(r, 1500));

// God-mode so camp mobs never interrupt the camera (gm flag: dealDamage no-ops).
await page.evaluate(() => {
  const p = window.__game.sim.player;
  p.gm = true;
  p.hp = p.maxHp;
});

async function shootAt(name, x, z, lookX, lookZ, pitch = -0.1, dist) {
  await page.evaluate(
    (o) => {
      const g = window.__game;
      const p = g.sim.player;
      p.hp = p.maxHp;
      p.pos.x = o.x;
      p.pos.z = o.z;
      p.facing = Math.atan2(o.lookX - o.x, o.lookZ - o.z);
      g.input.camYaw = p.facing;
      g.input.camPitch = o.pitch;
      if (o.dist != null) g.input.camDist = o.dist;
    },
    { x, z, lookX, lookZ, pitch, dist },
  );
  await new Promise((r) => setTimeout(r, 1200));
  await page.screenshot({ path: `${OUT}/${name}.png` });
  console.log('wrote', name);
}

async function shootMap(name, x, z) {
  await page.evaluate(
    (o) => {
      const p = window.__game.sim.player;
      p.pos.x = o.x;
      p.pos.z = o.z;
    },
    { x, z },
  );
  // Teleporting across the zone1/zone2 ridge triggers the zone-transition
  // title banner, which renders above the map window and would otherwise
  // still be fading when the map opens; give it time to clear first.
  await new Promise((r) => setTimeout(r, 2500));
  await page.evaluate(() => window.__game.hud.toggleMap?.());
  await new Promise((r) => setTimeout(r, 500));
  await page.screenshot({ path: `${OUT}/${name}.png` });
  console.log('wrote', name);
  await page.evaluate(() => {
    const hud = window.__game.hud;
    const win = document.querySelector('#map-window');
    if (win && win.style.display !== 'none') hud.toggleMap?.();
  });
  await new Promise((r) => setTimeout(r, 200));
}

// Glimmervein Cavern is a real underground TUNNEL (not an open-air pass or
// valley), bored at x=110 (GLIMMERVEIN_PASS_X in data.ts) under the
// zone1/zone2 ridge, on the east ("right") side of both zones. Approach
// along the new Zone1 road (Boar Meadow -> cavern), down the south ramp
// (roofed the whole way, not an open trench), through the flat, ~24yd-wide
// bored body (support pillars, crystal light, camps, ore vein), up the north
// ramp into Mirefen Marsh.
await shootAt('glimmervein_01_approach_zone1', 85, 55, 110, 100, -0.05);
await shootAt('glimmervein_02_south_mouth', 110, 98, 110, 118, -0.1);
await shootAt('glimmervein_03_ramp_descent', 110, 118, 110, 140, -0.15);
await shootAt('glimmervein_04_spider_camp', 110, 138, 110, 150, -0.1);
await shootAt('glimmervein_05_ore_vein', 107, 152, 110, 150, -0.1);
await shootAt('glimmervein_06_bat_camp', 110, 158, 110, 168, -0.1);
await shootAt('glimmervein_07_body_west_wall', 110, 180, 96, 180, -0.1);
await shootAt('glimmervein_08_body_east_wall', 110, 180, 124, 180, -0.1);
await shootAt('glimmervein_09_body_full_width', 100, 175, 120, 178, -0.1);
await shootAt('glimmervein_10_center_pillars', 110, 172, 110, 190, -0.2);
await shootAt('glimmervein_11_broodling_camp', 110, 198, 110, 208, -0.1);
await shootAt('glimmervein_12_ramp_ascent', 110, 244, 110, 258, -0.1);
await shootAt('glimmervein_13_north_mouth_daylight', 110, 275, 110, 250, -0.05);
// A wide shot from a distance, well off to the side of the whole run:
// confirms the surface above the tunnel reads as ORDINARY ground (no long
// valley/gouge), only the two small mouths breaking it.
await shootAt('glimmervein_14_ambient_no_valley', 165, 180, 110, 180, -0.08, 22);
// Steep, near-vertical in-game camera over the tunnel's own footprint
// (camPitch is clamped to [-0.4, 1.35] in game/input.ts; positive is looking
// DOWN, so 1.3 is as close to a true top-down look as the follow camera
// allows): confirms the same thing from directly overhead, distinct from the
// flat HUD world-map shots below.
await shootAt('glimmervein_15_overhead_topdown', 110, 180, 110, 181, 1.3, 22);

// Full top-down HUD world-map view, zoomed to show the WHOLE zone (mapZoom
// default = 1, "the whole committed zone" per map_window_view.ts), once from
// each side of the cavern, so the new route is visible against each zone's
// full layout, not just a close-up crop.
await shootMap('glimmervein_16_map_zone1_eastbrook_vale', 110, 150);
await shootMap('glimmervein_17_map_zone2_mirefen_marsh', 110, 210);

await browser.close();
console.log('wrote screenshots to', OUT);
