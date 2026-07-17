// Before/after shots for the training dummy creature-model wiring: the dummy
// (src/sim/content/zone3.ts, templateId training_dummy, Highwatch hill at
// x:-40, z:648) had no VISUALS/MOB_KEYS entry and rendered as the generic
// humanoid mob fallback. Needs `npm run dev` running; pass GAME_URL if vite
// picked a non-default port.
import fs from 'node:fs';
import puppeteer from 'puppeteer-core';

import { BROWSER_PATH as EDGE } from './browser_path.mjs';

const URL = process.env.GAME_URL ?? 'http://localhost:5175';
const OUT = process.env.OUT_DIR ?? '/tmp/training_dummy_shots';
const NAME = process.env.SHOT_NAME ?? 'after_training_dummy';
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
    await page.type('#char-name', 'Trainee');
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
await new Promise((r) => setTimeout(r, 500));

async function shot(name, cam, target, settleMs = 2200) {
  await page.evaluate(
    async (c, t) => {
      const g = window.__game;
      const p = g.sim.player;
      p.maxHp = 99999;
      p.hp = 99999;
      p.pos.x = c.x;
      p.pos.z = c.z;
      p.prevPos.x = c.x;
      p.prevPos.z = c.z;
      await new Promise((r) => setTimeout(r, 250));
      const gy = p.pos.y;
      const dx = t.x - c.x;
      const dz = t.z - c.z;
      const dl = Math.hypot(dx, dz) || 1;
      p.pos.x = c.x - (dx / dl) * 3;
      p.pos.z = c.z - (dz / dl) * 3;
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
  await new Promise((r) => setTimeout(r, settleMs));
  await page.screenshot({ path: `${OUT}/${name}.png` });
  console.log('wrote', `${OUT}/${name}.png`);
}

// Highwatch training dummy: templateId training_dummy, center x:-40, z:648.
await shot(NAME, { x: -46, z: 642, h: 4 }, { x: -40, z: 648, h: 1.5 });

await browser.close();
console.log('done ->', OUT);
