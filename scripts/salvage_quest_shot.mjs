// Screenshot harness for the Deepfen Salvage quest chain (zone2 / Mirefen Marsh).
// Boots the offline world, teleports the player to Salvage-Diver Brel in Fenbridge,
// levels them so the whole chain is offered, and opens the quest dialog.
//
// Needs `npm run dev` on :5173 (override with GAME_URL). Writes to tmp/.
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import { BROWSER_PATH } from './browser_path.mjs';

const URL = process.env.GAME_URL ?? 'http://localhost:5173';
fs.mkdirSync('tmp', { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({
  executablePath: BROWSER_PATH,
  headless: 'new',
  args: ['--window-size=1600,900', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  defaultViewport: { width: 1600, height: 900 },
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGEERROR:', e.message));
page.on('console', (m) => { if (m.type() === 'error') console.log('CONSOLE:', m.text()); });

await page.goto(URL, { waitUntil: 'networkidle0', timeout: 30000 });
await page.evaluate(() => document.querySelector('#btn-offline').click());
await sleep(200);
await page.type('#char-name', 'Pearldiver');
await page.click('#offline-select .mini-class[data-class="warrior"]');
await page.click('#btn-start-offline');
await sleep(2500);

const info = await page.evaluate(() => {
  const g = window.__game;
  g.sim.setPlayerLevel(12);
  const p = g.sim.player;
  // find Salvage-Diver Brel by his content (template) id
  let brel = null;
  for (const e of g.sim.entities.values()) {
    if (e.templateId === 'salvager_brel') { brel = e; break; }
  }
  if (!brel) return { ok: false };
  // stand beside him, face him, frame the camera over his shoulder
  p.pos.x = brel.pos.x + 3; p.pos.z = brel.pos.z + 3;
  p.facing = Math.atan2(brel.pos.x - p.pos.x, brel.pos.z - p.pos.z);
  g.input.camYaw = p.facing;
  g.input.camPitch = 0.12;
  g.hud.openQuestDialog(brel.id);
  return { ok: true, npcId: brel.id, name: brel.name, quests: brel.questIds };
});
console.log('npc:', JSON.stringify(info));
await sleep(4000); // let the zone-entry banner fade
await page.screenshot({ path: 'tmp/salvage-quest.png' });

// Accept the whole chain's first few quests and open the quest log to show objectives.
await page.evaluate(() => {
  const g = window.__game;
  const ids = ['q_salvage_bank', 'q_salvage_snappers', 'q_salvage_ravenous', 'q_salvage_drowned', 'q_salvage_glutton'];
  for (const id of ids) { try { g.sim.acceptQuest?.(id); } catch (_) {} }
  g.hud.closeQuestDialog?.();
  g.hud.toggleQuestLog?.();
});
await sleep(900);
await page.screenshot({ path: 'tmp/salvage-questlog.png' });

await browser.close();
console.log('done -> tmp/salvage-quest.png, tmp/salvage-questlog.png');
