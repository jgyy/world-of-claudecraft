// Visual capture for issue 2652 (zone map shows no party markers, only the
// minimap does). Boots the offline game at MAX graphics (?gfx=ultra), builds
// a real small party in the Sim (leader + an alive mage + a dead priest,
// bypassing invite/accept the way raid_to_party_shot.mjs does), opens the
// zone map window, and screenshots it. Run once against the unmodified
// upstream build (BEFORE: no party markers) and once against the fixed build
// (AFTER: a class-colored dot + name per member). Needs `npm run dev` running
// at GAME_URL (see the two dev servers this task started on :5198 / :5199).
//
// Usage: GAME_URL=http://localhost:5198 OUT_PREFIX=tmp/before node scripts/zone_map_party_markers_shot.mjs
//        GAME_URL=http://localhost:5199 OUT_PREFIX=tmp/after  node scripts/zone_map_party_markers_shot.mjs
// Add MOBILE=1 to also capture a 390x844 mobile-viewport shot.

import fs from 'node:fs';
import puppeteer from 'puppeteer-core';
import { BROWSER_PATH } from './browser_path.mjs';
import { enterOfflineGame } from './enter_offline_game.mjs';

const BASE_URL = process.env.GAME_URL ?? 'http://localhost:5173';
const OUT_PREFIX = process.env.OUT_PREFIX ?? 'tmp/zone_map_party';
const MOBILE = process.env.MOBILE === '1';
fs.mkdirSync('tmp', { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function buildPartyAndOpenMap(page) {
  // Build a real 3-member party (self + alive mage + dead priest) directly in
  // the Sim, positioned a few yards from the player inside the current zone's
  // view, the same technique raid_to_party_shot.mjs uses (going through
  // invite/accept in a single offline HUD queues a stale invite card).
  const built = await page.evaluate(() => {
    const sim = window.__game.sim;
    const me = sim.primaryId;
    const p = sim.player;
    const alivePid = sim.addPlayer('mage', 'Emberlyn');
    const deadPid = sim.addPlayer('priest', 'Fallenora');
    const alive = sim.entities.get(alivePid);
    if (alive) {
      alive.pos = { x: p.pos.x + 12, y: p.pos.y, z: p.pos.z + 4 };
      alive.prevPos = { ...alive.pos };
    }
    const dead = sim.entities.get(deadPid);
    if (dead) {
      dead.pos = { x: p.pos.x - 12, y: p.pos.y, z: p.pos.z - 6 };
      dead.prevPos = { ...dead.pos };
      dead.dead = true;
      dead.hp = 0;
    }
    const party = {
      id: sim.party.nextPartyId++,
      leader: me,
      members: [me, alivePid, deadPid],
      raid: false,
      raidGroups: new Map(),
      lootStrategies: {},
    };
    sim.party.parties.set(party.id, party);
    sim.party.partyByPid.set(me, party.id);
    sim.party.partyByPid.set(alivePid, party.id);
    sim.party.partyByPid.set(deadPid, party.id);
    const info = sim.partyInfo;
    return { members: info?.members?.map((m) => ({ name: m.name, cls: m.cls, dead: m.dead })) };
  });
  console.log('party built:', JSON.stringify(built));

  // Open the zone map window (M / minimap click both route to Hud.toggleMap()).
  await page.evaluate(() => window.__game.hud.toggleMap());
  await sleep(700);
  return built;
}

async function clipElement(page, selector, path, margin = 8) {
  const box = await page.evaluate(
    (sel, m) => {
      const el = document.querySelector(sel);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return {
        x: Math.max(0, r.x - m),
        y: Math.max(0, r.y - m),
        width: r.width + m * 2,
        height: r.height + m * 2,
      };
    },
    selector,
    margin,
  );
  if (!box || box.width < 10) {
    console.log(`WARN: ${selector} not found or too small, falling back to full page`);
    await page.screenshot({ path });
    return;
  }
  await page.screenshot({ path, clip: box });
}

async function run(viewport, outPath) {
  const browser = await puppeteer.launch({
    executablePath: BROWSER_PATH,
    headless: 'new',
    protocolTimeout: 300000,
    args: [
      `--window-size=${viewport.width},${viewport.height}`,
      '--use-angle=swiftshader',
      '--enable-unsafe-swiftshader',
      '--no-sandbox',
      '--disable-breakpad',
      '--disable-crash-reporter',
      '--disable-dev-shm-usage',
    ],
    defaultViewport: viewport,
  });
  try {
    const page = await browser.newPage();
    page.on('pageerror', (e) => console.log('PAGEERROR:', e.message));
    if (viewport.isMobile) await page.setViewport(viewport);
    await page.goto(`${BASE_URL}/?gfx=ultra`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    const booted = await enterOfflineGame(page, {
      charClass: 'warrior',
      charName: 'Mapkeeper',
      settleMs: 2500,
      gameBootTimeoutMs: 240000,
      mobilePreflightTimeoutMs: 10000,
    });
    if (!booted) {
      console.log(`world never booted for ${outPath}`);
      return false;
    }
    if (viewport.isMobile) {
      // Headless can't report pointer:coarse; force the gameplay body classes
      // the way mobile_minimap_safe_area.mjs does.
      await page.evaluate(() => document.body.classList.add('mobile-touch', 'game-active'));
      await sleep(300);
    }
    await buildPartyAndOpenMap(page);
    await clipElement(page, '#map-window', outPath);
    console.log(`saved ${outPath}`);
    return true;
  } finally {
    await browser.close();
  }
}

const DESKTOP = { width: 1280, height: 800 };
// The game is landscape-locked on mobile (meta[name=orientation]=landscape; a
// portrait viewport shows only the "Rotate to Landscape" gate, never the map),
// so the mobile capture uses a landscape phone viewport.
const MOBILE_LANDSCAPE = { width: 844, height: 390, isMobile: true, hasTouch: true };

// DESKTOP_ONLY=1 skips the mobile variant; desktop always captures.
const DESKTOP_ONLY = process.env.DESKTOP_ONLY === '1';
const okDesktop = await run(DESKTOP, `${OUT_PREFIX}-desktop.png`);
let okMobile = true;
if (MOBILE && !DESKTOP_ONLY) {
  okMobile = await run(MOBILE_LANDSCAPE, `${OUT_PREFIX}-mobile.png`);
}
process.exit(okDesktop && okMobile ? 0 : 1);
