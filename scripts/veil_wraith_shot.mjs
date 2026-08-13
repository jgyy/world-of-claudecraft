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
  defaultViewport: { width: 1600, height: 900, deviceScaleFactor: 2 },
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGEERROR:', e.message));

// Content showcase, not a graphics-tier comparison, so this rig deliberately
// departs from the lowest-preset capture default: seed the top canned preset
// (6, Insane; see src/ui/options_view.ts) before boot for the sharpest look.
await page.evaluateOnNewDocument(() => {
  try {
    localStorage.setItem('woc_settings', JSON.stringify({ graphicsPreset: 6 }));
  } catch {
    /* ignore */
  }
});

await page.goto(URL, { waitUntil: 'load', timeout: 90000 });
const booted = await enterOfflineGame(page, { charClass: 'priest', charName: 'Vesper' });
if (!booted) throw new Error('world did not boot');

// Dismiss the boot-time software-rendering notice (src/ui/gpu_notice_toast.ts,
// .gpu-notice-dismiss): expected under swiftshader and not part of the
// capture's content. NOT the same toast as perf_nudge_toast.ts (that one
// only checks every 30s, src/game/perf_nudge.ts, so it never fires in this
// script's runtime); poll briefly since it mounts a beat after boot.
async function dismissPerfNudgeIfShown() {
  for (let i = 0; i < 8; i++) {
    const clicked = await page
      .evaluate(() => {
        const btn = document.querySelector('.gpu-notice-dismiss');
        if (!btn) return false;
        btn.click();
        return true;
      })
      .catch(() => false);
    if (clicked) return;
    await sleep(300);
  }
}
await dismissPerfNudgeIfShown();

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
await dismissPerfNudgeIfShown();

// Idle stance shot.
await page.screenshot({ path: `${OUT_DIR}/veil-wraith-courser-idle.png` });
console.log('idle:', `${OUT_DIR}/veil-wraith-courser-idle.png`);

// A short run so the shot shows the gait mid-stride.
await page.keyboard.down('w');
await sleep(1200);
await dismissPerfNudgeIfShown();
await page.screenshot({ path: `${OUT_DIR}/veil-wraith-courser-run.png` });
await page.keyboard.up('w');
console.log('run:', `${OUT_DIR}/veil-wraith-courser-run.png`);

console.log('state:', await page.evaluate(() => ({ mountKey: window.__game.sim.player.mountKey })));

await browser.close();
