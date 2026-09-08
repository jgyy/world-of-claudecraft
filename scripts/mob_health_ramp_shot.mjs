// PR evidence for the random-mob-health-ramp change: spawns a known non-elite
// trash template (forest_wolf) at level 20 via /dev spawn, targets it, and
// screenshots the target frame's HP text (#tf-hp-text, always-on current/max
// text per src/ui/unit_frame.ts unitFrameCurrentMaxText, no setting needed).
// Run once on main/base (BEFORE) and once on this branch (AFTER); the sim
// change is client-side only for offline play, so no server restart is
// needed between runs, only a page reload picks up the new Vite transform.
import fs from 'node:fs';
import puppeteer from 'puppeteer-core';
import { BROWSER_PATH } from './browser_path.mjs';
import { enterOfflineGame } from './enter_offline_game.mjs';

const URL = process.env.GAME_URL ?? 'http://localhost:5173';
const OUT_DIR = process.env.SHOTS_DIR ?? 'tmp/mob_health_ramp';
const OUT_NAME = process.env.OUT_NAME ?? 'shot';
fs.mkdirSync(OUT_DIR, { recursive: true });

const browser = await puppeteer.launch({
  executablePath: BROWSER_PATH,
  headless: 'new',
  args: ['--window-size=1280,800', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  defaultViewport: { width: 1280, height: 800 },
});
const page = await browser.newPage();

// Standing capture rule: seed the lowest graphics preset before boot.
await page.evaluateOnNewDocument(() => {
  localStorage.setItem('woc_settings', JSON.stringify({ graphicsPreset: 1 }));
});

await page.goto(URL, { waitUntil: 'networkidle0', timeout: 90000 });
const booted = await enterOfflineGame(page, { charName: 'RampCheck' });
if (!booted) {
  console.error('world never booted');
  await browser.close();
  process.exit(1);
}

const setup = await page.evaluate(() => {
  const sim = window.__game.sim;
  const pid = sim.player.id;
  sim.chat('/dev god', pid); // invincible: the wolf spawns hostile and adjacent
  sim.chat('/dev level 20', pid);
  sim.chat('/dev spawn forest_wolf 1 20', pid);
  // devSpawnOwnerId is stamped only on this player's own /dev-spawned mobs
  // (spawnMobsForDev), which distinguishes it from an ambient world forest_wolf
  // camp spawn (there is one near the starting zone, at its own authored level).
  let targetId = null;
  for (const [id, e] of sim.entities) {
    if (e.kind === 'mob' && e.templateId === 'forest_wolf' && e.devSpawnOwnerId === pid) {
      targetId = id;
      break;
    }
  }
  if (targetId === null) return { ok: false, reason: 'wolf never spawned' };
  sim.player.targetId = targetId;
  const wolf = sim.entities.get(targetId);
  return { ok: true, targetId, level: wolf.level, maxHp: wolf.maxHp };
});
console.log('setup:', JSON.stringify(setup));
if (!setup.ok) {
  console.error('setup failed:', setup.reason);
  await browser.close();
  process.exit(1);
}

// Let the HUD's next paint pick up the new target frame state.
await new Promise((r) => setTimeout(r, 1500));

const rect = await page.evaluate(() => {
  const el = document.querySelector('#target-frame');
  const r = el.getBoundingClientRect();
  return { x: r.x, y: r.y, width: r.width, height: r.height };
});

const path = `${OUT_DIR}/${OUT_NAME}.png`;
const pad = 12;
await page.screenshot({
  path,
  clip: {
    x: Math.max(0, rect.x - pad),
    y: Math.max(0, rect.y - pad),
    width: rect.width + pad * 2,
    height: rect.height + pad * 2,
  },
});
console.log('wrote', path, 'maxHp:', setup.maxHp);

fs.writeFileSync(`${OUT_DIR}/${OUT_NAME}.json`, JSON.stringify(setup, null, 2));
await browser.close();
