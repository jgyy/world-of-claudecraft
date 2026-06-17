// Screenshot the priest's Inner Fire self-buff in the offline client.
// Boots the game as a priest, levels to where Inner Fire is known, casts it,
// and captures the resulting holy armor buff on the player unit frame plus
// the spellbook tooltip.
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';

import { BROWSER_PATH as EDGE } from './browser_path.mjs';
const URL = process.env.GAME_URL ?? 'http://localhost:5173';
fs.mkdirSync('tmp', { recursive: true });

const browser = await puppeteer.launch({
  executablePath: EDGE,
  headless: 'new',
  args: ['--window-size=1600,900', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'],
  defaultViewport: { width: 1600, height: 900 },
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGEERROR: ' + e.message));

await page.goto(URL, { waitUntil: 'networkidle0', timeout: 30000 });
await page.evaluate(() => document.querySelector('#btn-offline').click());
await new Promise((r) => setTimeout(r, 200));
await page.type('#char-name', 'Liadrin');
await page.click('#offline-select .mini-class[data-class="priest"]');
await page.click('#btn-start-offline');
await new Promise((r) => setTimeout(r, 2500));

const result = await page.evaluate(() => {
  const g = window.__game;
  const sim = g.sim;
  const p = sim.player;
  const meta = sim.resolve(p.id).meta;
  // Level the priest up so Inner Fire (learnLevel 12) is in the spellbook,
  // then refresh the known-ability + stat caches that consume the level.
  p.level = 20;
  sim.recomputeTalents(meta);
  const armorBefore = p.stats?.armor;
  sim.castAbility('inner_fire', p.id);
  for (let i = 0; i < 3; i++) sim.tick();
  sim.recomputeTalents(meta); // re-run the stat pass so the buff_armor aura counts
  const armorAfter = p.stats?.armor;
  const buff = p.auras.find((a) => a.name === 'Inner Fire' || a.kind === 'buff_armor');
  return { armorBefore, armorAfter, hasBuff: !!buff, buffValue: buff?.value, buffRemaining: buff?.remaining };
});
console.log('inner_fire result:', JSON.stringify(result));

await new Promise((r) => setTimeout(r, 600));
await page.screenshot({ path: 'tmp/inner_fire_full.png' });

// Crop tightly around the player unit frame + buff bar.
const box = await page.evaluate(() => {
  const bar = document.querySelector('#buff-bar');
  if (!bar) return null;
  const r = bar.getBoundingClientRect();
  return { x: r.left, y: r.top, w: r.width, h: r.height };
});
if (box) {
  const pad = 16;
  await page.screenshot({
    path: 'tmp/inner_fire_frame.png',
    clip: {
      x: Math.max(0, box.x - pad), y: Math.max(0, box.y - pad),
      width: box.w + pad * 2, height: box.h + pad * 2,
    },
  });
  await page.mouse.move(box.x + box.w / 2, box.y + box.h / 2);
  await new Promise((r) => setTimeout(r, 500));
  await page.screenshot({
    path: 'tmp/inner_fire_tooltip.png',
    clip: {
      x: Math.max(0, box.x - 320), y: Math.max(0, box.y - 10),
      width: 320 + box.w + 20, height: 160,
    },
  });
}

// Open the spellbook and surface the Inner Fire entry + its tooltip.
await page.evaluate(() => window.__game.hud.toggleSpellbook());
await new Promise((r) => setTimeout(r, 500));
const spellBox = await page.evaluate(() => {
  const book = document.querySelector('#spellbook');
  if (!book || book.style.display !== 'block') return null;
  // Find the row whose text mentions Inner Fire.
  // Smallest element whose text mentions Inner Fire (the entry's row/name).
  const matches = Array.from(book.querySelectorAll('*')).filter((el) =>
    /Inner Fire/i.test(el.textContent || ''),
  );
  matches.sort((a, b) => (a.textContent || '').length - (b.textContent || '').length);
  const leaf = matches[0];
  const row = leaf?.closest('[role="listitem"], .spell-item, li') || leaf;
  if (!row) return null;
  const r = row.getBoundingClientRect();
  const b = book.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2, bx: b.left, by: b.top, bw: b.width, bh: b.height };
});
if (spellBox) {
  await page.mouse.move(spellBox.x, spellBox.y);
  await new Promise((r) => setTimeout(r, 500));
  await page.screenshot({ path: 'tmp/inner_fire_spellbook.png' });
  const pad = 20;
  await page.screenshot({
    path: 'tmp/inner_fire_spellbook_crop.png',
    clip: {
      x: Math.max(0, spellBox.bx - 340), y: Math.max(0, spellBox.by - pad),
      width: 340 + spellBox.bw + pad, height: spellBox.bh + pad * 2,
    },
  });
  console.log('saved spellbook captures');
} else {
  console.log('spellbook row not found');
}

console.log('saved tmp/inner_fire_full.png, inner_fire_frame.png, inner_fire_tooltip.png');
await browser.close();
