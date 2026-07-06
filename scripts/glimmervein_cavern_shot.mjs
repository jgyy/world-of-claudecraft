// Screenshots of Glimmervein Cavern (src/sim/content/zone1.ts + zone2.ts +
// src/sim/data.ts GLIMMERVEIN_* + src/render/cave_tunnel.ts): a real
// underground ROOM through the natural zone1/zone2 mountain ridge, west of
// the x=0 causeway, walkable as ordinary open-world terrain (no loading, no
// instance transition). Boots the offline world with the tutorial and
// first-spawn cinematic pre-marked seen (clean gameplay shots, no onboarding
// chrome), teleports the player through the room at several depths and
// widths, an in-game top-down camera over the room itself, and the full HUD
// world-map for each zone. Needs `npm run dev` running. Browser via
// scripts/browser_path.mjs.

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

// Glimmervein Cavern is now a whole underground ROOM (not a corridor),
// carved through the natural zone1/zone2 mountain ridge at x=-70
// (GLIMMERVEIN_PASS_X in data.ts), ~32yd wide (GLIMMERVEIN_PASS_HALF_WIDTH),
// well WEST of the x=0 causeway. Approach along the new Zone1 road (Sableweb
// -> cavern), descending into the southern mouth, through the wide enclosed
// room under the rock ceiling (support pillars, crystal light), then
// ascending out the northern mouth into Mirefen Marsh.
await shootAt('glimmervein_01_approach_zone1', -55, 110, -70, 148, -0.05);
await shootAt('glimmervein_02_descent_mouth', -70, 143, -70, 165, -0.08);
await shootAt('glimmervein_03_room_west_wall', -70, 155, -86, 155, -0.15);
await shootAt('glimmervein_04_room_east_wall', -70, 155, -54, 155, -0.15);
await shootAt('glimmervein_05_spider_camp', -70, 160, -78, 150, -0.1);
await shootAt('glimmervein_06_ore_vein', -67, 162, -70, 160, -0.1);
await shootAt('glimmervein_07_room_center_pillars', -70, 172, -70, 184, -0.25);
await shootAt('glimmervein_08_ridge_crest_overhead', -70, 180, -55, 180, -0.35);
await shootAt('glimmervein_09_room_full_width', -70, 178, -54, 178, -0.05);
await shootAt('glimmervein_10_bat_pack', -70, 188, -70, 196, -0.15);
await shootAt('glimmervein_11_broodling_camp', -70, 200, -66, 205, -0.1);
await shootAt('glimmervein_12_ascent_zone2_exit', -55, 250, -70, 210, -0.05);
await shootAt('glimmervein_13_ambient_ridge', -30, 180, -70, 180, -0.15);
// Steep, near-vertical in-game camera over the room's center (camPitch is
// clamped to [-0.4, 1.35] in game/input.ts; positive is looking DOWN, so 1.3
// is as close to a true top-down look as the follow camera allows): an actual
// top-down look at the cavern's own footprint (distinct from the flat HUD
// world-map shots below), at max camera distance so as much of the ~32yd
// wide, ~90yd long room as possible is in frame at once.
await shootAt('glimmervein_14_overhead_topdown', -70, 178, -70, 179, 1.3, 22);

// Full top-down HUD world-map view, zoomed to show the WHOLE zone (mapZoom
// default = 1, "the whole committed zone" per map_window_view.ts), once from
// each side of the cavern, so the new route is visible against each zone's
// full layout, not just a close-up crop.
await shootMap('glimmervein_15_map_zone1_eastbrook_vale', -70, 155);
await shootMap('glimmervein_16_map_zone2_mirefen_marsh', -70, 205);

await browser.close();
console.log('wrote screenshots to', OUT);
