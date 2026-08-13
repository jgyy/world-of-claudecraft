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

const APPEARANCE = {
  gender: 'female',
  hair: 'longwavy',
  beard: 'none',
  brows: 'soft',
  earrings: 'none',
  earringMaterial: 'default',
  skinHue: 24,
  skinSat: 0.42,
  skinLight: 0.64,
  hairHue: 18,
  hairSat: 0.62,
  hairLight: 0.32,
  face: 'neutral',
  body: 'neutral',
  mouth: 'neutral',
  eyeShape: 'almond',
  ears: 'round',
  lashes: true,
  lashHue: 18,
  lashSat: 0.62,
  lashLight: 0.32,
  eyeHue: 195,
  eyeSat: 0.55,
  eyeLight: 0.4,
  lipstick: 'none',
  blush: 'peach',
  eyeshadow: 'teal',
  outfit: 'classic',
};

// Content showcase, not a graphics-tier comparison, so this rig deliberately
// departs from the lowest-preset capture default: seed the Advanced expert
// profile (5) with every sub-dial pinned to its max (src/game/settings.ts
// SETTING_RANGES), which is strictly higher than the canned Insane preset
// (shadowQuality/effectsQuality cap at 1 either way; the ladders here all sit
// at their top rung). graphicsDefaultApplied: true is required alongside the
// preset: main.ts's first-run device probe (src/main.ts, around "First-run
// graphics default") gates ONLY on that flag, not on graphicsPreset itself,
// and it detects swiftshader as a weak/software GPU and force-downgrades to
// Low; without the flag a seeded preset here is silently overwritten right
// after boot, before the renderer ever reads it.
const GFX_SETTINGS = {
  graphicsPreset: 5,
  graphicsDefaultApplied: true,
  terrainDetail: 2,
  foliageDensity: 2,
  effectsQuality: 1,
  shadowQuality: 1,
  surfaceDetail: 2,
  antiAliasing: 1,
  bloomQuality: 1,
  ambientOcclusion: 1,
  viewDistance: 2,
  waterQuality: 2,
  characterDetail: 1,
  dynamicLights: 1,
  particleEffects: 1,
  renderScale: 1,
};

// Dismiss the boot-time software-rendering notice (src/ui/gpu_notice_toast.ts,
// .gpu-notice-dismiss): expected under swiftshader and not part of the
// capture's content. NOT the same toast as perf_nudge_toast.ts (that one
// only checks every 30s, src/game/perf_nudge.ts, so it never fires in this
// script's runtime); poll briefly since it mounts a beat after boot.
async function dismissPerfNudgeIfShown(page) {
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

// A fresh browser per shot: the Advanced-max profile under swiftshader
// software rendering is heavy enough (deep shadow maps, SSAO, bloom, full
// view distance, all at 2x device-scale-factor supersampling) that it
// crashed the tab ("Target closed") partway through a multi-shot session in
// one long-lived page. One render per process avoids the accumulated
// GPU/texture memory pressure that caused it.
async function withGame(fn) {
  const browser = await puppeteer.launch({
    executablePath: EDGE,
    headless: 'new',
    args: ['--window-size=1600,900', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
    defaultViewport: { width: 1600, height: 900, deviceScaleFactor: 2 },
  });
  try {
    const page = await browser.newPage();
    page.on('pageerror', (e) => console.log('PAGEERROR:', e.message));
    await page.evaluateOnNewDocument((settings) => {
      try {
        localStorage.setItem('woc_settings', JSON.stringify(settings));
      } catch {
        /* ignore */
      }
    }, GFX_SETTINGS);

    await page.goto(URL, { waitUntil: 'load', timeout: 90000 });
    // The Advanced-max profile is genuinely heavier to boot under swiftshader
    // software rendering than enterOfflineGame's 30s default budget.
    const booted = await enterOfflineGame(page, {
      charClass: 'priest',
      charName: 'Vesper',
      gameBootTimeoutMs: 120000,
    });
    if (!booted) throw new Error('world did not boot');
    await dismissPerfNudgeIfShown(page);
    // enterOfflineGame's intro-cinematic skip presses Escape; under the
    // heavier Advanced-max boot that press can land AFTER the intro has
    // already cleared and open the Game Menu instead, blocking every later
    // screenshot. hud.closeAll() is the one shared dismissal dispatcher
    // (src/ui/hud.ts) every Escape-closeable window answers to, so drive it
    // directly rather than guessing at a specific window's DOM.
    await page.evaluate(() => window.__game.hud.closeAll());

    // A nicer-looking authored appearance than the default bald/neutral
    // quick-start look: the renderer diffs e.modularAppearance against the
    // view's cached copy every sync (src/render/renderer.ts) and rebuilds
    // the composed body on a change, so setting this after boot recomposes
    // the already-created player visual live.
    await page.evaluate((appearance) => {
      window.__game.sim.player.modularAppearance = appearance;
    }, APPEARANCE);
    await sleep(500);

    await page.evaluate(() => {
      const sim = window.__game.sim;
      sim.setPlayerLevel(20, sim.playerId);
      sim.addItem('reins_veil_wraith_courser', 1);
      // Skip the riding-lesson quest for this capture: grant the skill
      // directly (normally Marla's 80g purchase after q_riding_lessons).
      sim.players.get(sim.playerId).ridingTrained = true;
    });
    await sleep(300);

    // There is deliberately no "selected mount" picker
    // (src/world_api/mounts.ts): riding is USING the reins item, which
    // routes through useItem -> summonMountItem and channels for
    // MOUNT_SUMMON_SECONDS (1.5 sim-seconds). That channel normally
    // completes across real animation frames, but each frame at the
    // Advanced-max profile under swiftshader is expensive enough to
    // stretch a 1.5s channel into a real-time wait of a minute or more;
    // drive it straight to completion the way tests/mounts.test.ts's
    // finishTransition helper does (direct updateMountTransition calls, no
    // per-frame rendering cost) instead of waiting on it in real time.
    await page.evaluate(async (itemId) => {
      const { summonMountItem, updateMountTransition, MOUNT_SUMMON_SECONDS } = await import(
        '/src/sim/mounts.ts'
      );
      const { DT } = await import('/src/sim/types.ts');
      const sim = window.__game.sim;
      const pid = sim.playerId;
      summonMountItem(sim.ctx, pid, itemId.replace(/^reins_/, ''));
      const e = sim.entities.get(pid);
      const steps = Math.ceil(MOUNT_SUMMON_SECONDS / DT) + 2;
      for (let i = 0; i < steps && (e.mountCastRemaining ?? 0) > 0; i++) {
        updateMountTransition(sim.ctx, e, false);
      }
    }, 'reins_veil_wraith_courser');
    await page.waitForFunction(
      () => !!window.__game.renderer?.views?.get(window.__game.sim.playerId)?.mountVisual,
      { timeout: 60000, polling: 300 },
    );
    await sleep(1000);

    await fn(page);
  } finally {
    await browser.close();
  }
}

// Camera framing: set the orbit yaw/pitch/distance directly on the live
// Input instance (src/game/input.ts, plain public fields the free-orbit drag
// also writes) rather than simulating an imprecise mouse drag. camYaw is
// measured the same way facing is, and camYaw === facing is BEHIND the
// character (src/game/input.ts recenterCamera(): "snap the orbit camera back
// BEHIND the character" sets camYaw = facing), so facing + PI is the front.
async function setCamera(page, yaw, { pitch = 0.5, dist = 7.5 } = {}) {
  await page.evaluate(
    (y, p, d) => {
      const input = window.__game.input;
      input.camYaw = y;
      input.camPitch = p;
      input.camDist = d;
    },
    yaw,
    pitch,
    dist,
  );
  await sleep(200);
}

// Four diagonal isometric corners, 90 degrees apart and offset 45 degrees
// from straight front/back/side so every shot is a 3/4 view (never a flat
// silhouette), full coverage of the model across the set.
const ISO_SHOTS = [
  { name: 'front-right', offset: -Math.PI / 4 },
  { name: 'back-right', offset: -(3 * Math.PI) / 4 },
  { name: 'back-left', offset: (3 * Math.PI) / 4 },
  { name: 'front-left', offset: Math.PI / 4 },
];

for (const shot of ISO_SHOTS) {
  await withGame(async (page) => {
    const facing = await page.evaluate(() => window.__game.sim.player.facing);
    await setCamera(page, facing + Math.PI + shot.offset);
    await dismissPerfNudgeIfShown(page);
    const path = `${OUT_DIR}/veil-wraith-courser-iso-${shot.name}.png`;
    await page.screenshot({ path });
    console.log(`iso ${shot.name}:`, path);
  });
}

// Side profile, mid-gallop: the best angle to read the real per-leg gait
// (all four limb chains carry per-frame rotation, unlike a frozen-leg
// fallback), which a straight-behind shot cannot show at all.
await withGame(async (page) => {
  const facing = await page.evaluate(() => window.__game.sim.player.facing);
  await setCamera(page, facing + Math.PI / 2, { pitch: 0.22, dist: 7 });
  await page.keyboard.down('w');
  await sleep(1200);
  await dismissPerfNudgeIfShown(page);
  await page.screenshot({ path: `${OUT_DIR}/veil-wraith-courser-run.png` });
  await page.keyboard.up('w');
  console.log('side (running):', `${OUT_DIR}/veil-wraith-courser-run.png`);
});
