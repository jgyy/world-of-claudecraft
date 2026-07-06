// Screenshots of Glimmervein Cavern (src/sim/content/zone1.ts + zone2.ts): the ore
// cavern with crystal spiders that links Eastbrook Vale and Mirefen Marsh as an
// alternate route around the causeway. Boots the offline world, teleports the
// player to four vantage points, and captures each. Needs `npm run dev` running.
// Browser via scripts/browser_path.mjs.

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

async function shootAt(name, x, z, lookX, lookZ, pitch = -0.12) {
  await page.evaluate(
    (o) => {
      const g = window.__game;
      const p = g.sim.player;
      p.pos.x = o.x;
      p.pos.z = o.z;
      p.facing = Math.atan2(o.lookX - o.x, o.lookZ - o.z);
      g.input.camYaw = p.facing;
      g.input.camPitch = o.pitch;
    },
    { x, z, lookX, lookZ, pitch },
  );
  await new Promise((r) => setTimeout(r, 1400));
  await page.screenshot({ path: `${OUT}/${name}.png` });
  console.log('wrote', name);
}

// Southern (Eastbrook Vale) entrance: on the road spur, looking north into the cavern.
await shootAt('glimmervein_entrance_zone1', 20, 155, 45, 155);

// Interior: among the crystal spider camp and the ore vein, near the seam.
await shootAt('glimmervein_interior', 45, 170, 45, 180, -0.05);

// Northern (Mirefen Marsh) exit: on the road spur, looking back south.
await shootAt('glimmervein_exit_zone2', 60, 205, 30, 195);

// Full ambient shot from a rise overlooking the whole cavern footprint.
await shootAt('glimmervein_ambient', 70, 180, 40, 180, -0.2);

await browser.close();
console.log('wrote screenshots to', OUT);
