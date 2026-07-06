// Screenshots of Glimmervein Cavern (src/sim/content/zone1.ts + zone2.ts +
// src/sim/data.ts GLIMMERVEIN_* + src/render/cave_tunnel.ts): a winding
// sunken trench on the WEST side of both zones, entering/leaving each zone
// at roughly its own vertical middle. No wall/ceiling/pillar props: the
// concave HeightStamp bowl at each waypoint IS the wall, the same way a lake
// basin's shore needs no fence. Walkable as ordinary open-world terrain (no
// loading, no instance transition). Boots the offline world with the
// tutorial and first-spawn cinematic pre-marked seen (clean gameplay shots,
// no onboarding chrome), then walks the FULL winding centerline (a copy of
// GLIMMERVEIN_WAYPOINTS in src/sim/data.ts; keep the two in sync if the
// curve changes), one interior shot per segment looking toward the next
// waypoint, plus the approach, both mouths, both camps, the ore veins, an
// ambient wide shot, an in-game top-down camera, and the full HUD world-map
// for each zone. Needs `npm run dev` running. Browser via
// scripts/browser_path.mjs.

import fs from 'node:fs';
import puppeteer from 'puppeteer-core';

import { BROWSER_PATH as EDGE } from './browser_path.mjs';

// Mirrors GLIMMERVEIN_WAYPOINTS in src/sim/data.ts.
const GLIMMERVEIN_WAYPOINTS = [
  { x: -95, z: 0 },
  { x: -70, z: 25 },
  { x: -44, z: 50 },
  { x: -27, z: 75 },
  { x: -28, z: 100 },
  { x: -41, z: 120 },
  { x: -56, z: 135 },
  { x: -73, z: 150 },
  { x: -84, z: 160 },
  { x: -93, z: 170 },
  { x: -100, z: 180 },
  { x: -105, z: 190 },
  { x: -107, z: 200 },
  { x: -106, z: 210 },
  { x: -99, z: 225 },
  { x: -76, z: 250 },
  { x: -48, z: 275 },
  { x: -29, z: 300 },
  { x: -26, z: 325 },
  { x: -41, z: 350 },
  { x: -67, z: 375 },
  { x: -84, z: 390 },
];

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

const wp = GLIMMERVEIN_WAYPOINTS;
const first = wp[0];
const last = wp[wp.length - 1];

// Approach from outside Eastbrook Vale, looking at the mouth ahead.
await shootAt('glimmervein_00_approach_zone1', first.x + 20, first.z - 45, first.x, first.z, -0.05);

// One interior shot PER SEGMENT of the whole winding centerline, each
// looking from the current waypoint toward the next one, so the entire
// curve is covered end to end (not just a handful of hand-picked spots).
for (let i = 0; i + 1 < wp.length; i++) {
  const a = wp[i];
  const b = wp[i + 1];
  const label = String(i + 1).padStart(2, '0');
  await shootAt(`glimmervein_${label}_interior`, a.x, a.z, b.x, b.z, -0.12);
}

// Exit into Mirefen Marsh, looking back at the mouth from outside.
await shootAt('glimmervein_exit_zone2', last.x - 20, last.z + 45, last.x, last.z, -0.05);

// A wide shot from a distance, well off to the side of the whole run:
// confirms the surface above the trench reads as ORDINARY ground (no long
// valley/gouge), only the two small mouths breaking it.
const midZ = wp[Math.floor(wp.length / 2)];
await shootAt('glimmervein_ambient_no_valley', midZ.x + 90, midZ.z, midZ.x, midZ.z, -0.08, 22);

// Steep, near-vertical in-game camera over the ridge-crossing waypoint
// (camPitch is clamped to [-0.4, 1.35] in game/input.ts; positive is looking
// DOWN, so 1.3 is as close to a true top-down look as the follow camera
// allows): confirms the same thing from directly overhead, distinct from
// the flat HUD world-map shots below.
const ridgeWp = wp.find((w) => w.z === 180) ?? wp[Math.floor(wp.length / 2)];
await shootAt(
  'glimmervein_overhead_topdown',
  ridgeWp.x,
  ridgeWp.z,
  ridgeWp.x,
  ridgeWp.z + 1,
  1.3,
  22,
);

// Full top-down HUD world-map view, zoomed to show the WHOLE zone (mapZoom
// default = 1, "the whole committed zone" per map_window_view.ts), once from
// each side of the trench, so the new route is visible against each zone's
// full layout, not just a close-up crop.
await shootMap('glimmervein_map_zone1_eastbrook_vale', wp[3].x, wp[3].z);
await shootMap('glimmervein_map_zone2_mirefen_marsh', wp[wp.length - 4].x, wp[wp.length - 4].z);

await browser.close();
console.log('wrote screenshots to', OUT);
