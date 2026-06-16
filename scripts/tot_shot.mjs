// Screenshot the Target-of-Target frame (#381): boots offline, targets a wolf,
// makes the wolf target the player, and captures the top-left HUD.
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import { BROWSER_PATH as EDGE } from './browser_path.mjs';

const URL = process.env.GAME_URL ?? 'http://localhost:5173';
fs.mkdirSync('tmp', { recursive: true });

const browser = await puppeteer.launch({
  executablePath: EDGE,
  headless: 'new',
  args: ['--window-size=1600,900', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  defaultViewport: { width: 1600, height: 900 },
});
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));
page.on('console', (msg) => { if (msg.type() === 'error') errors.push('CONSOLE: ' + msg.text()); });

await page.goto(URL, { waitUntil: 'networkidle0', timeout: 30000 });
await page.click('#btn-offline');
await new Promise((r) => setTimeout(r, 200));
await page.type('#char-name', 'Tankadin');
await page.click('#offline-select .mini-class[data-class="warrior"]');
await page.click('#btn-start-offline');
await new Promise((r) => setTimeout(r, 2500));

// Target a wolf and make it target the player so ToT reads "You".
const info = await page.evaluate(() => {
  const g = window.__game;
  const sim = g.sim, p = sim.player;
  let wolf = null, d = 1e9;
  for (const e of sim.entities.values()) {
    if (e.templateId === 'forest_wolf' && !e.dead) {
      const dd = Math.hypot(e.pos.x - p.pos.x, e.pos.z - p.pos.z);
      if (dd < d) { d = dd; wolf = e; }
    }
  }
  p.pos.x = wolf.pos.x + 4; p.pos.z = wolf.pos.z;
  p.facing = Math.atan2(wolf.pos.x - p.pos.x, wolf.pos.z - p.pos.z);
  g.input.camYaw = p.facing;
  sim.targetEntity(wolf.id);
  wolf.targetId = p.id;        // the wolf is now hitting the player
  wolf.hp = Math.round(wolf.maxHp * 0.7);
  return { wolfId: wolf.id, wolfName: wolf.name };
});
console.log('setup:', JSON.stringify(info));
await new Promise((r) => setTimeout(r, 600));

// Re-assert each frame so combat AI doesn't clear it before the shot.
for (let i = 0; i < 8; i++) {
  await page.evaluate((id) => {
    const g = window.__game, sim = g.sim, p = sim.player;
    if (p.targetId !== id) sim.targetEntity(id);
    const w = sim.entities.get(id);
    if (w) w.targetId = p.id;
  }, info.wolfId);
  await new Promise((r) => setTimeout(r, 120));
}

const shown = await page.evaluate(() => {
  const el = document.getElementById('target-of-target-frame');
  return { display: getComputedStyle(el).display, name: document.getElementById('tot-name').textContent };
});
console.log('ToT frame:', JSON.stringify(shown));

// Full HUD, then a tight crop of the unit frames.
await page.screenshot({ path: 'tmp/tot_fullhud.png' });
await page.screenshot({ path: 'tmp/tot_closeup.png', clip: { x: 0, y: 0, width: 420, height: 170 } });

console.log(errors.length ? '\nERRORS:\n' + errors.slice(0, 10).join('\n') : 'no page errors');
await browser.close();
