// Before/after diagram for "fleeing mobs no longer socially aggro". Boots the
// offline game, stages a low-HP cowardly mob surrounded by a ring of idle
// same-family allies (all within the old 8yd flee call-for-help radius), then runs
// the REAL sim until the mob panics into the flee state. It samples the live AI
// state of every ally after the flee. Post-change, none are pulled. The "before"
// panel reconstructs the documented old call-for-help rule (idle same-family allies
// within 8yd get yanked into the fight) over the exact same layout, so the two
// panels are an honest side-by-side of the same camp. Needs `npm run dev` (:5173).
// Writes the PNG to tmp/.
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';

import { BROWSER_PATH as EDGE } from './browser_path.mjs';
const URL = process.env.GAME_URL ?? 'http://localhost:5173';
const W = 1600, H = 860;
fs.mkdirSync('tmp', { recursive: true });

const browser = await puppeteer.launch({
  executablePath: EDGE,
  headless: 'new',
  args: [`--window-size=${W},${H}`, '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  defaultViewport: { width: W, height: H },
});
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));
page.on('console', (msg) => { if (msg.type() === 'error') errors.push('CONSOLE: ' + msg.text()); });

await page.goto(URL, { waitUntil: 'networkidle0', timeout: 30000 });
await page.evaluate(() => document.querySelector('#btn-offline').click());
await new Promise((r) => setTimeout(r, 200));
await page.type('#char-name', 'Skittish');
await page.evaluate(() => {
  document.querySelector('#offline-select .mini-class[data-class="warrior"]').click();
  document.querySelector('#btn-start-offline').click();
});
await page.waitForFunction(() => window.__game?.sim?.player, { timeout: 90000 });
await new Promise((r) => setTimeout(r, 800));

// Stage a fleer + a ring of idle same-family allies, run the real flee, and read
// back each ally's actual AI state. FLEE_HELP_RADIUS in the old code was 8yd.
const data = await page.evaluate(async () => {
  const FLEE_HELP_RADIUS = 8;
  const g = window.__game;
  const sim = g.sim;
  const p = sim.player;
  const wild = [...sim.entities.values()].filter((e) => e.kind === 'mob' && !e.dead && e.ownerId === null);
  const fleer = wild[0];
  const allies = wild.slice(1, 7);

  // Put the player far away so idle allies cannot detect it on their own (idle
  // proximity aggro reaches at most ~20yd) — this isolates the flee path.
  const base = { x: fleer.pos.x, z: fleer.pos.z };
  p.pos.x = base.x + 200; p.pos.z = base.z; p.prevPos = { ...p.pos };
  p.hp = p.maxHp = 999999;

  // The fleer: a low-HP cowardly humanoid still locked onto the (now distant) player.
  fleer.templateId = 'gravecaller_cultist';
  fleer.hostile = true; fleer.dead = false;
  fleer.maxHp = 1000; fleer.hp = 120; // 12% -> under the 20% flee threshold
  fleer.auras = []; fleer.enraged = false; fleer.hasFled = false;
  fleer.fleeTimer = 0; fleer.fleeReturnTimer = 0;
  fleer.spawnPos = { ...fleer.pos }; fleer.leashAnchor = { ...fleer.pos };
  fleer.aiState = 'attack'; fleer.aggroTargetId = sim.playerId; fleer.inCombat = true;

  // A ring of idle same-family allies, all within the old 8yd call-for-help radius.
  const ring = [];
  allies.forEach((a, i) => {
    const ang = (i / allies.length) * Math.PI * 2;
    a.templateId = 'gravecaller_cultist';
    a.hostile = true; a.dead = false;
    a.aiState = 'idle'; a.aggroTargetId = null; a.inCombat = false;
    a.pos = { x: base.x + Math.cos(ang) * 4.5, z: base.z + Math.sin(ang) * 4.5, y: fleer.pos.y };
    a.prevPos = { ...a.pos };
    ring.push(a);
  });

  // Run the real sim until the fleer panics (a couple of ticks is plenty).
  for (let i = 0; i < 5 && fleer.aiState !== 'flee'; i++) sim.tick();

  const dist = (a) => Math.hypot(a.pos.x - base.x, a.pos.z - base.z);
  const after = ring.map((a) => ({
    x: a.pos.x - base.x, z: a.pos.z - base.z,
    pulled: a.aiState === 'chase' || a.aiState === 'attack',
    inRange: dist(a) <= FLEE_HELP_RADIUS,
  }));
  return {
    fleerState: fleer.aiState,
    radius: FLEE_HELP_RADIUS,
    allies: after,
  };
});
console.log('fleer state after panic:', data.fleerState);
console.table(data.allies);

await page.evaluate((data) => {
  const cv = document.createElement('canvas');
  cv.id = 'flee-chart-overlay';
  cv.width = 1600; cv.height = 860;
  cv.style.cssText = 'position:fixed;inset:0;z-index:99999;background:#11151c';
  document.body.appendChild(cv);
  const c = cv.getContext('2d');

  c.fillStyle = '#e8eef5';
  c.font = 'bold 36px sans-serif';
  c.fillText('Fleeing mobs no longer socially aggro', 60, 64);
  c.font = '20px sans-serif';
  c.fillStyle = '#9fb0c3';
  c.fillText('A low-HP cowardly mob panics inside a camp of idle same-family allies (all within the old 8yd call-for-help radius).', 60, 100);

  const panel = (ox, title, pulledFn, sub, subColor) => {
    const cx = ox + 360, cy = 480, scale = 26;
    c.font = 'bold 24px sans-serif';
    c.fillStyle = '#e8eef5'; c.fillText(title, ox + 40, 170);
    c.font = '18px sans-serif';
    c.fillStyle = subColor; c.fillText(sub, ox + 40, 200);

    // call-for-help radius ring
    c.strokeStyle = '#2c3642'; c.setLineDash([6, 6]); c.lineWidth = 2;
    c.beginPath(); c.arc(cx, cy, data.radius * scale, 0, 7); c.stroke();
    c.setLineDash([]);
    c.fillStyle = '#5a6572'; c.font = '14px sans-serif';
    c.fillText('8yd call-for-help radius', cx - 70, cy - data.radius * scale - 10);

    // the fleer at center (running away, off toward the distant player ->)
    c.fillStyle = '#ffd966';
    c.beginPath(); c.arc(cx, cy, 13, 0, 7); c.fill();
    c.fillStyle = '#11151c'; c.font = 'bold 13px sans-serif';
    c.fillText('flee', cx - 14, cy + 4);
    // flee direction arrow
    c.strokeStyle = '#ffd966'; c.lineWidth = 3;
    c.beginPath(); c.moveTo(cx + 16, cy); c.lineTo(cx + 70, cy); c.stroke();
    c.beginPath(); c.moveTo(cx + 70, cy); c.lineTo(cx + 60, cy - 7); c.lineTo(cx + 60, cy + 7); c.closePath(); c.fillStyle = '#ffd966'; c.fill();

    // allies
    for (const a of data.allies) {
      const x = cx + a.x * scale, y = cy + a.z * scale;
      const pulled = pulledFn(a);
      c.beginPath(); c.arc(x, y, 11, 0, 7);
      c.fillStyle = pulled ? '#d64550' : '#6b7682'; c.fill();
    }
  };

  // BEFORE: documented old rule — idle same-family allies in range get pulled (red).
  const beforePulled = data.allies.filter((a) => a.inRange).length;
  panel(60, 'Before (call for help)',
    (a) => a.inRange,
    `${beforePulled} allies yanked into the fight (cascading pull)`, '#d64550');

  // AFTER: measured live — none are pulled (grey), they stay idle.
  const afterPulled = data.allies.filter((a) => a.pulled).length;
  panel(840, 'After (this PR)',
    (a) => a.pulled,
    `${afterPulled} allies pulled — they stay idle as the mob runs past`, '#4ea36b');

  // legend
  c.font = '16px sans-serif';
  c.fillStyle = '#d64550'; c.beginPath(); c.arc(80, 800, 9, 0, 7); c.fill();
  c.fillStyle = '#cdd7e2'; c.fillText('pulled into combat', 100, 806);
  c.fillStyle = '#6b7682'; c.beginPath(); c.arc(320, 800, 9, 0, 7); c.fill();
  c.fillStyle = '#cdd7e2'; c.fillText('stays idle', 340, 806);
  c.fillStyle = '#ffd966'; c.beginPath(); c.arc(500, 800, 9, 0, 7); c.fill();
  c.fillStyle = '#cdd7e2'; c.fillText('fleeing mob', 520, 806);
}, data);

await new Promise((r) => setTimeout(r, 200));
await page.screenshot({ path: 'tmp/flee_social_aggro_chart.png' });
console.log('wrote tmp/flee_social_aggro_chart.png');

if (errors.length) {
  console.log('=== PAGE ERRORS ==='); for (const e of errors.slice(0, 20)) console.log(e);
} else console.log('no page errors');
await browser.close();
