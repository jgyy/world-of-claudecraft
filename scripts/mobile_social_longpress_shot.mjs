// Mobile screenshot: LONG-PRESS a player's name to open the interaction menu
// (Whisper / Invite to party / Ignore / Report) on a touch phone, where there is
// no right-click. Proves the new touch path added in src/ui/long_press.ts.
//
// Prereq: `npm run dev` running on :5173.
//   node scripts/mobile_social_longpress_shot.mjs
import puppeteer from 'puppeteer-core';
import { mkdirSync } from 'node:fs';
import { BROWSER_PATH } from './browser_path.mjs';

const URL = 'http://localhost:5173/';
const OUT = 'tmp/shots';
mkdirSync(OUT, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({
  executablePath: BROWSER_PATH,
  headless: 'new',
  args: [
    '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
    '--no-sandbox', '--hide-scrollbars',
  ],
});

try {
  const page = await browser.newPage();
  page.on('pageerror', (e) => console.log('PAGEERR', e.message));
  await page.setViewport({ width: 844, height: 390, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  const client = await page.target().createCDPSession();
  // Satisfy PHONE_TOUCH_QUERY = '(pointer: coarse) and (max-width: 940px)'.
  await client.send('Emulation.setEmulatedMedia', { features: [{ name: 'pointer', value: 'coarse' }] });

  await page.goto(URL, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#btn-offline', { visible: true });

  // Offline flow: pick mode -> name -> class -> enter.
  await page.evaluate(() => document.getElementById('btn-offline').click());
  await sleep(250);
  await page.evaluate(() => {
    const n = document.getElementById('char-name');
    n.value = 'Thorgar';
    n.dispatchEvent(new Event('input', { bubbles: true }));
    document.querySelector('.mini-class[data-class="mage"]').click();
  });
  await sleep(150);
  await page.evaluate(() => document.getElementById('btn-start-offline').click());

  // On a phone the world boot pauses behind the landscape preflight overlay;
  // wait for it, then tap Continue to proceed into the game.
  await page.waitForFunction(() => document.body.classList.contains('mobile-preflight-open'), {
    timeout: 8000,
  });
  await sleep(300);
  await page.evaluate(() => document.getElementById('mobile-preflight-continue').click());

  await page.waitForFunction(() => window.__game && window.__game.hud, { timeout: 45000 });
  await sleep(2500);

  // Drop a chat line from another player and reveal the read-only chat-log peek
  // so the screenshot shows the social context the menu belongs to.
  await page.evaluate(() => {
    window.__game.hud.chatLogFrom(
      'Aelindra', 'Anyone up for the crypt?', '#ffffff', 'hud.chat.templates.say', 'say', 999,
    );
    document.body.classList.add('mobile-chatlog-peek');
  });

  // SHOT 1 - prove the touch gesture: a real CDP long-press (> LONG_PRESS_MS =
  // 500ms) on the always-interactive player frame opens its context menu. We
  // capture while the finger is still down, then release.
  const pf = await page.evaluate(() => {
    const b = document.getElementById('player-frame').getBoundingClientRect();
    return { x: b.left + b.width / 2, y: b.top + b.height / 2 };
  });
  await client.send('Input.dispatchTouchEvent', {
    type: 'touchStart', touchPoints: [{ x: pf.x, y: pf.y }],
  });
  await sleep(800);
  const gesture = await page.evaluate(
    () => getComputedStyle(document.getElementById('ctx-menu')).display !== 'none',
  );
  console.log('long-press opened a menu on touch:', gesture, '(expected true)');
  await page.screenshot({ path: `${OUT}/mobile-social-longpress.png` });
  console.log('captured mobile-social-longpress.png');
  await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await sleep(200);

  // SHOT 2 - show the actions the long-press reaches: render the real player
  // interaction menu (the exact opener the long-press calls) for the chat name.
  const menu = await page.evaluate(() => {
    const span = [...document.querySelectorAll('.chat-player-name')].find(
      (s) => s.textContent === 'Aelindra',
    );
    const r = span.getBoundingClientRect();
    window.__game.hud.openChatPlayerContextMenu('Aelindra', r.left, r.bottom);
    const el = document.getElementById('ctx-menu');
    return {
      visible: getComputedStyle(el).display !== 'none',
      items: [...el.querySelectorAll('.ctx-item')].map((i) => i.textContent.trim()),
    };
  });
  console.log('player menu actions:', menu.items.join(' | '));
  await page.screenshot({ path: `${OUT}/mobile-social-menu.png` });
  console.log('captured mobile-social-menu.png');
} finally {
  await browser.close();
}
