// One-off capture for the Veil-Wraith Courser mount PR: grants the reins via
// the dev sim handle (offline, no server needed), rides it, and screenshots
// the world plus the bag icon close up. Not a permanent tour script.
//   node scripts/veil_wraith_shot.mjs   (needs `npm run dev`; GAME_URL overrides :5173)
import fs from 'node:fs';
import puppeteer from 'puppeteer-core';
import { BROWSER_PATH as EDGE } from './browser_path.mjs';
import { enterOfflineGame } from './enter_offline_game.mjs';

const URL = process.env.GAME_URL ?? 'http://localhost:5173';
const OUT_DIR = 'docs/screenshots/veil-wraith-courser-mount';
fs.mkdirSync(OUT_DIR, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({
  executablePath: EDGE,
  headless: 'new',
  args: ['--window-size=1600,900', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  defaultViewport: { width: 1600, height: 900 },
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGEERROR:', e.message));

await page.goto(URL, { waitUntil: 'load', timeout: 90000 });
const booted = await enterOfflineGame(page, { charClass: 'priest', charName: 'Vesper' });
if (!booted) throw new Error('world did not boot');

await page.evaluate(() => {
  const sim = window.__game.sim;
  sim.setPlayerLevel(20, sim.playerId);
  sim.addItem('reins_veil_wraith_courser', 1);
  // Skip the riding-lesson quest for this capture: grant the skill directly
  // (normally Marla's 80g purchase after q_riding_lessons).
  sim.players.get(sim.playerId).ridingTrained = true;
});
await sleep(300);

// There is deliberately no "selected mount" picker (src/world_api/mounts.ts):
// riding is USING the reins item, which routes through useItem ->
// summonMountItem and channels for MOUNT_SUMMON_SECONDS.
await page.evaluate(() => {
  window.__game.sim.useItem('reins_veil_wraith_courser');
});
await page.waitForFunction(() => window.__game.sim.player.mountKey === 'veil_wraith_courser', {
  timeout: 15000,
  polling: 250,
});
await page.waitForFunction(
  () => !!window.__game.renderer?.views?.get(window.__game.sim.playerId)?.mountVisual,
  { timeout: 20000, polling: 300 },
);
await sleep(1000);

// Zoom the chase camera in for a closer look at the coat pattern (scroll
// wheel, the same input a player would use).
await page.mouse.move(800, 450);
for (let i = 0; i < 4; i++) {
  await page.mouse.wheel({ deltaY: -80 });
  await sleep(50);
}
await sleep(400);

// Idle stance shot.
await page.screenshot({ path: `${OUT_DIR}/veil-wraith-courser-idle.png` });
console.log('idle:', `${OUT_DIR}/veil-wraith-courser-idle.png`);

// A short run so the shot shows the gait mid-stride.
await page.keyboard.down('w');
await sleep(1200);
await page.screenshot({ path: `${OUT_DIR}/veil-wraith-courser-run.png` });
await page.keyboard.up('w');
console.log('run:', `${OUT_DIR}/veil-wraith-courser-run.png`);

console.log('state:', await page.evaluate(() => ({ mountKey: window.__game.sim.player.mountKey })));

await browser.close();
