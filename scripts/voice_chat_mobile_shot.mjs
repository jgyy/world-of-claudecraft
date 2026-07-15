import fs from 'node:fs';
import puppeteer from 'puppeteer-core';
import { BROWSER_PATH as EDGE } from './browser_path.mjs';

const URL = process.env.GAME_URL ?? 'http://localhost:5175';
const CLASS = process.env.GAME_CLASS ?? 'mage';
const OUT_DIR = 'docs/screenshots';
fs.mkdirSync(OUT_DIR, { recursive: true });

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const tap = (page, sel) => page.evaluate((s) => document.querySelector(s)?.click(), sel);

async function enterOfflineWorld(page) {
  await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await wait(1500);
  await tap(page, '#btn-offline');
  await wait(400);
  await page.evaluate(() => {
    const n = document.querySelector('#char-name');
    if (n) {
      n.value = 'Proximity';
      n.dispatchEvent(new Event('input', { bubbles: true }));
    }
  });
  await tap(page, `#offline-select .mini-class[data-class="${CLASS}"]`);
  await wait(300);
  await tap(page, '#btn-start-offline');
  await wait(600);
  // Mobile shows a "Play in Landscape Fullscreen" preflight interstitial
  // before the loading screen; dismiss it.
  await tap(page, '#mobile-preflight-continue');
  await page.waitForFunction(() => !!window.__game?.hud, { timeout: 90000 });
  await wait(500);
  await page.evaluate(() => {
    document.querySelector('#start-screen')?.remove();
    const ui = document.querySelector('#ui');
    if (ui) ui.style.setProperty('display', 'block', 'important');
  });
  await page.evaluate(() => {
    try {
      const s = window.__game?.settings;
      if (s?.set) {
        s.set('graphicsPreset', 4);
        s.set('renderScale', 2);
      }
    } catch {}
  });
  await wait(300);
}

async function openAudioPanel(page) {
  await page.evaluate(() => window.__game.hud.toggleOptionsMenu());
  await wait(400);
  await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('#options-menu .opt-btn'));
    buttons.find((b) => /audio/i.test(b.textContent ?? ''))?.click();
  });
  await wait(700);
}

const panelBox = async (page) => {
  const r = await page.evaluate(() => {
    const el = document.querySelector('#options-menu');
    return el ? el.getBoundingClientRect().toJSON() : null;
  });
  return r
    ? {
        x: Math.max(0, Math.round(r.x)),
        y: Math.max(0, Math.round(r.y)),
        width: Math.round(r.width),
        height: Math.round(r.height),
      }
    : null;
};

const clickVoiceToggle = (page) =>
  page.evaluate(() => {
    const rows = Array.from(document.querySelectorAll('#options-menu .set-row'));
    const row = rows.find(
      (r) => r.querySelector('.set-name')?.textContent === 'Voice Chat (Proximity)',
    );
    row?.querySelector('button')?.click();
  });

const scrollToVoiceRow = (page) =>
  page.evaluate(() => {
    const rows = Array.from(document.querySelectorAll('#options-menu .set-row'));
    const row = rows.find(
      (r) => r.querySelector('.set-name')?.textContent === 'Voice Chat (Proximity)',
    );
    row?.scrollIntoView({ block: 'center' });
  });

const browser = await puppeteer.launch({
  executablePath: EDGE,
  headless: 'new',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
try {
  const page = await browser.newPage();
  // Mobile is landscape-only in-game (src/ui/CLAUDE.md); use landscape metrics.
  const client = await page.createCDPSession();
  await client.send('Emulation.setDeviceMetricsOverride', {
    width: 844,
    height: 390,
    deviceScaleFactor: 2,
    mobile: true,
  });
  await client.send('Emulation.setTouchEmulationEnabled', { enabled: true });
  page.on('pageerror', () => {});
  await enterOfflineWorld(page);
  await openAudioPanel(page);

  await scrollToVoiceRow(page);
  await wait(200);
  let box = await panelBox(page);
  if (box)
    await page.screenshot({ path: `${OUT_DIR}/voice-chat-mobile-audio-panel-off.png`, clip: box });
  await page.screenshot({ path: `${OUT_DIR}/voice-chat-mobile-options-open-off.png` });

  await clickVoiceToggle(page);
  await wait(300);
  await scrollToVoiceRow(page);
  await wait(200);
  box = await panelBox(page);
  if (box)
    await page.screenshot({ path: `${OUT_DIR}/voice-chat-mobile-audio-panel-on.png`, clip: box });
  await page.screenshot({ path: `${OUT_DIR}/voice-chat-mobile-options-open-on.png` });

  await page.close();
  console.log('mobile shots done');
} finally {
  await browser.close();
}
