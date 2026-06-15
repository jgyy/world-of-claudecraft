// E2E Verification Script: checks the mobile "More" tray (#mobile-extra-controls)
// stays fully on-screen horizontally across landscape phone widths.
//
// The tray is a fixed-width 2-column grid anchored near screen-centre
// (left: calc(50% + 176px)). On a narrow landscape phone that pushes its
// rightmost button column off the right edge. The fix clamps the left edge so
// the tray never overflows, while keeping the More-aligned position on wide
// screens.
//
// Usage: `npm run dev` in one shell, then `node scripts/mobile_tray_horizontal_overflow.mjs`.
import puppeteer from 'puppeteer-core';
import { BROWSER_PATH } from './browser_path.mjs';

const URL = process.env.GAME_URL ?? 'http://localhost:5173';
// Common landscape phone widths plus a wide tablet to prove no regression.
const WIDTHS = [568, 667, 740, 844, 1180];
const MARGIN = 8; // minimum px the tray's right edge must keep from the viewport edge

async function waitForServer(url, timeoutMs = 15000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch (e) {
      // ignore connection errors
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`Timeout waiting for server at ${url}`);
}

async function main() {
  await waitForServer(URL);
  const browser = await puppeteer.launch({
    executablePath: BROWSER_PATH,
    headless: 'new',
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
    defaultViewport: { width: 844, height: 390 },
  });
  const page = await browser.newPage();

  let failures = 0;
  console.log('  width | tray left → right | viewport | overflow | status');
  console.log('  ------+-------------------+----------+----------+-------');
  for (const width of WIDTHS) {
    await page.setViewport({ width, height: 390 });
    await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 15000 });
    // Force the touch layout + open tray (matchMedia can't report coarse pointer headlessly).
    const m = await page.evaluate(() => {
      document.body.classList.add('mobile-touch', 'game-active', 'mobile-more-open');
      const r = document.getElementById('mobile-extra-controls').getBoundingClientRect();
      return { left: Math.round(r.left), right: Math.round(r.right), vw: window.innerWidth };
    });
    const overflow = m.right - m.vw;
    const ok = overflow <= -MARGIN; // right edge stays at least MARGIN px inside the viewport
    if (!ok) failures++;
    console.log(
      `  ${String(width).padStart(5)} | ${String(m.left).padStart(5)} → ${String(m.right).padStart(5)}     | ${String(m.vw).padStart(6)}   | ${String(overflow).padStart(6)}   | ${ok ? 'OK' : 'OVERFLOW'}`,
    );
  }

  await browser.close();
  if (failures > 0) {
    console.error(`\nFAIL: ${failures} viewport(s) clip the More tray off the right edge.`);
    process.exit(1);
  }
  console.log('\nPASS: the More tray stays fully on-screen at every tested width.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
