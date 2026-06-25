// Before/after capture for the floating-combat-text (FCT) anti-overlap fix.
//
// A dense elite pack (e.g. the Thornpeak Crusher war-camp) can resolve a wall of
// "MISS" at the same screen anchor in one tick. Without stacking the texts pile on top
// of each other into an illegible blob (BEFORE). The fix (src/ui/fct_layout.ts
// placeFctY, consumed by FctPainter.position) lays the burst out in legible rows (AFTER).
//
// This renders the two layouts on a dark panel using the game's real `.fct` text style
// and the real placeFctY row math, so the difference is crisp and the capture is
// deterministic (no live-game boot needed). tests/fct_layout.test.ts pins the shipped
// implementation; the inline copy here only positions the demo.

import fs from 'node:fs';
import puppeteer from 'puppeteer-core';
import { BROWSER_PATH as EXEC } from './browser_path.mjs';

fs.mkdirSync('tmp', { recursive: true });

const browser = await puppeteer.launch({
  executablePath: EXEC,
  headless: 'new',
  defaultViewport: { width: 1040, height: 600, deviceScaleFactor: 2 },
});
const page = await browser.newPage();

// Mirror of src/ui/fct_layout.ts placeFctY (lowest free row, stack upward).
const placeFctY = (existing, anchorX, anchorY, rowHeight, columnWidth, maxRows) => {
  const col = existing.filter((e) => Math.abs(e.x - anchorX) < columnWidth);
  for (let row = 0; row < maxRows; row++) {
    const y = anchorY - row * rowHeight;
    if (!col.some((e) => Math.abs(e.y - y) < rowHeight)) return y;
  }
  return anchorY;
};

const COUNT = 7;
const ROW = 34;
const anchorY = 0; // texts stack upward from the target anchor
const before = [];
const after = [];
for (let i = 0; i < COUNT; i++) {
  before.push({ x: Math.round(20 * (Math.random() - 0.5)), y: 0 }); // old: same top, jitter
  const y = placeFctY(after, 0, anchorY, ROW, 70, COUNT);
  after.push({ x: Math.round(16 * (Math.random() - 0.5)), y });
}

const panel = (title, sub, entries) => {
  const dots = entries
    .map(
      (e) =>
        `<div class="fct" style="left:calc(50% + ${e.x}px); top:calc(58% + ${e.y}px)">MISS</div>`,
    )
    .join('');
  return `<div class="panel"><div class="title">${title}</div>
    <div class="anchor" title="target"></div>${dots}
    <div class="sub">${sub}</div></div>`;
};

await page.setContent(`<!doctype html><html><head><meta charset="utf-8"></head>
<body>
<style>
  :root { --title-font: 'Trebuchet MS', 'Segoe UI', sans-serif; }
  * { box-sizing: border-box; }
  body { margin: 0; background: #14100b; font-family: var(--title-font); }
  .wrap { display: flex; gap: 22px; padding: 22px; }
  .panel { position: relative; flex: 1; height: 540px; border-radius: 12px; overflow: hidden;
           background: radial-gradient(120% 90% at 50% 30%, #2a2417 0%, #1a160f 70%, #120f0a 100%);
           border: 1px solid #5a4a30; }
  .title { position: absolute; top: 0; left: 0; right: 0; padding: 14px; text-align: center;
           color: #e7d4a4; font-weight: bold; letter-spacing: .6px; font-size: 20px;
           border-bottom: 1px solid #3a3020; background: #00000033; }
  .sub { position: absolute; bottom: 14px; left: 0; right: 0; text-align: center;
         color: #9c8d68; font-size: 14px; }
  .anchor { position: absolute; left: 50%; top: 58%; width: 12px; height: 12px; margin: -6px 0 0 -6px;
            border-radius: 50%; background: #d8b25a; box-shadow: 0 0 12px #d8b25a; }
  /* Real game .fct style (index.html): bold, shadowed, centered on its point. */
  .fct { position: absolute; transform: translate(-50%, -50%); font-weight: bold; font-size: 30px;
         color: #cfcfcf; text-shadow: 1px 1px 3px #000, 0 0 5px #000; white-space: nowrap; pointer-events: none; }
</style>
<div class="wrap">
  ${panel('BEFORE: pile-up', '7 misses, one tick, same anchor', before)}
  ${panel('AFTER: stacked rows', 'placeFctY lays each on its own row', after)}
</div>
</body></html>`);
await page.evaluate(() => document.fonts.ready);

// Combined strip plus each panel on its own (near-square, easy to view/embed).
await page.screenshot({ path: 'tmp/fct_stack.png' });
const panels = await page.$$('.panel');
await panels[0].screenshot({ path: 'tmp/fct_before.png' });
await panels[1].screenshot({ path: 'tmp/fct_after.png' });
await browser.close();
console.log('shots: tmp/fct_stack.png, tmp/fct_before.png, tmp/fct_after.png');
