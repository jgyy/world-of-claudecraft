// CSP shell smoke: drive real offline world entry, AND a live graphics-settings-apply
// cycle, under the desktop shell's Content-Security-Policy in a real browser, without
// packaging an app.
//
// Why this exists: the desktop (Electron) shell is the only host that serves a CSP
// (server/http/middleware/security_headers.ts deliberately defers it), and only
// PACKAGED builds apply it: electron:dev loads the Vite server and never hits the
// app:// handler that attaches the header (electron/main.cjs registerAppProtocol).
// So a CSP that refuses a resource the game needs stays invisible to every dev
// loop and every CI suite, and only surfaces in a packed build: that is how the
// desktop build hung both at world entry AND when applying a graphics setting
// (three's ZSTDDecoder boots its WASM via a fetch of a data:application/wasm URI
// that connect-src did not allow, and BOTH world entry and the live graphics
// rebuild's asset-prep stage can need a Zstandard-supercompressed KTX2 texture).
//
// How: intercept the dev server's DOCUMENT response and attach the real
// buildContentSecurityPolicy() output (inline-script hashes recomputed for the
// dev HTML, exactly what the packaged shell does for dist/index.html), then run
// enterOfflineGame and fail on any first-party CSP violation. Violations are
// collected two ways: the page's securitypolicyviolation ledger, and console
// "Refused ..." texts, which also surface violations raised inside workers
// (worker scopes never fire the page-level event). Third-party origins the CSP
// blocks by design (analytics beacon hosts) are warnings only. Known limits:
// the CSP is built against the dev origin, so the https/wss production arm of
// the connect-src is exercised by tests/electron_shell_guards.test.ts instead,
// and the unit-level source contract lives in tests/gltf_decoder_csp.test.ts.
//
// Needs: npm run dev (:5173). Usage: node scripts/csp_shell_smoke.mjs
// (GAME_URL= overrides the dev server URL).
import fs from 'node:fs';
import { createRequire } from 'node:module';
import puppeteer from 'puppeteer-core';
import { BROWSER_PATH } from './browser_path.mjs';
import { enterOfflineGame } from './enter_offline_game.mjs';

const require = createRequire(import.meta.url);
const {
  buildContentSecurityPolicy,
  extractInlineScriptHashes,
} = require('../electron/shell_guards.cjs');

const GAME_URL = process.env.GAME_URL ?? 'http://127.0.0.1:5173';
const gameUrl = new URL(GAME_URL);
const origin = gameUrl.origin;
const NEGATIVE_PROBE_HOST = 'csp-smoke-negative-probe.invalid';
const WORLD_SETTLE_MS = 4000;
const WORLD_BOOT_TIMEOUT_MS = 90000;
const LATE_LOAD_DRAIN_MS = 2500;
const PROBE_TIMEOUT_MS = 4000;
const GRAPHICS_APPLY_TIMEOUT_MS = 60000;

// Every field the live graphics rebuild coordinator reads/writes (src/game/
// graphics_rebuild_core.ts GRAPHICS_REBUILD_KEYS); kept as a literal list so a key
// rename or addition there fails this script loudly instead of silently reading
// undefined settings.
const GRAPHICS_REBUILD_KEYS = [
  'graphicsPreset',
  'terrainDetail',
  'foliageDensity',
  'surfaceDetail',
  'effectsQuality',
  'shadowQuality',
  'antiAliasing',
  'bloomQuality',
  'ambientOcclusion',
  'viewDistance',
  'waterQuality',
  'characterDetail',
  'dynamicLights',
  'particleEffects',
];

let fail = 0;
function check(name, cond, extra = '') {
  if (!cond) fail += 1;
  console.log(`${cond ? 'PASS' : 'FAIL'} ${name}${extra ? ` :: ${extra}` : ''}`);
}

try {
  await fetch(GAME_URL, { signal: AbortSignal.timeout(3000) });
} catch {
  console.error(`dev server not reachable at ${GAME_URL}; start it with: npm run dev`);
  process.exit(1);
}

fs.mkdirSync('tmp', { recursive: true });
const browser = await puppeteer.launch({
  executablePath: BROWSER_PATH,
  headless: 'new',
  args: ['--window-size=1600,900', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  defaultViewport: { width: 1600, height: 900 },
});
const page = await browser.newPage();

const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message));

// Console-text refusal ledger: violations raised inside workers reach the page
// console but never the page's securitypolicyviolation event, and this ledger is
// live for the whole run (no sampling window). The refusal message embeds the full
// policy string, so classification must use the blocked URL it names, never the
// message body.
const consoleRefusals = [];
const REFUSED_URL = /(?:Connecting to|cannot load|Refused to (?:connect|load)[^']*)\s+'?([^'\s]+)/;
page.on('console', (m) => {
  const text = m.text();
  if (!/Refused|violates the following Content Security Policy/i.test(text)) return;
  const url = REFUSED_URL.exec(text)?.[1] ?? '';
  consoleRefusals.push({ directive: 'console', blocked: url.replace(/[.']+$/, '') });
});

// Event ledger, installed before any document script runs.
await page.evaluateOnNewDocument(() => {
  window.__cspViolations = [];
  document.addEventListener('securitypolicyviolation', (e) => {
    window.__cspViolations.push({ directive: e.effectiveDirective, blocked: e.blockedURI });
  });
});

// Boot at the lowest preset (the repo's standing capture rule, e.g. ios_zone_eviction_shot.mjs)
// so world entry itself can succeed even under a broken CSP: the graphics-apply probe below
// then raises the preset to Ultra deliberately, to isolate the live-rebuild's own zstd KTX2
// asset need from whatever the boot profile happens to touch.
await page.evaluateOnNewDocument(() => {
  try {
    localStorage.setItem('woc_settings', JSON.stringify({ graphicsPreset: 1 }));
  } catch {
    /* ignore */
  }
});

// Attach the real desktop CSP to the document response only: a document's CSP header
// governs everything the page loads, so per-asset interception is unnecessary. Scoped
// via a raw CDP Fetch.enable resourceType filter (not Puppeteer's blanket
// setRequestInterception) so the hundreds of sub-resource GLB/texture requests a world
// boot fires never round-trip through this Node process; only the document request does.
// A document we cannot re-fetch is FAILED, never fulfilled headerless: failing open
// would make every later "no violations" verdict vacuous.
const cdp = await page.target().createCDPSession();
await cdp.send('Fetch.enable', {
  patterns: [{ urlPattern: '*', resourceType: 'Document', requestStage: 'Request' }],
});
cdp.on('Fetch.requestPaused', (event) => {
  void (async () => {
    const { requestId, request } = event;
    const isDoc = request.url === origin || request.url.startsWith(`${origin}/`);
    if (!isDoc) {
      await cdp.send('Fetch.continueRequest', { requestId }).catch(() => {});
      return;
    }
    try {
      const upstream = await fetch(request.url);
      const body = Buffer.from(await upstream.arrayBuffer());
      const csp = buildContentSecurityPolicy({
        apiOrigin: origin,
        scriptHashes: extractInlineScriptHashes(body.toString('utf8')),
      });
      await cdp.send('Fetch.fulfillRequest', {
        requestId,
        responseCode: upstream.status,
        responseHeaders: [
          { name: 'content-type', value: upstream.headers.get('content-type') ?? 'text/html' },
          { name: 'content-security-policy', value: csp },
        ],
        body: body.toString('base64'),
      });
    } catch (err) {
      console.error('document interception failed, failing the navigation (fail closed):', err);
      await cdp.send('Fetch.failRequest', { requestId, errorReason: 'Failed' }).catch(() => {});
    }
  })();
});

await page.goto(GAME_URL, { waitUntil: 'networkidle2', timeout: 60000 });

// Sanity: the CSP must actually be attached and enforced, or every later "no
// violations" verdict is vacuous. The listener matches the probe's own host so a
// concurrent unrelated violation cannot satisfy (or spuriously fail) this check.
const enforcement = await page.evaluate(
  (host, timeoutMs) =>
    new Promise((res) => {
      const on = (e) => {
        if (!String(e.blockedURI).includes(host)) return;
        document.removeEventListener('securitypolicyviolation', on);
        res(e.effectiveDirective);
      };
      document.addEventListener('securitypolicyviolation', on);
      fetch(`https://${host}/`).catch(() => {});
      setTimeout(() => res(null), timeoutMs);
    }),
  NEGATIVE_PROBE_HOST,
  PROBE_TIMEOUT_MS,
);
check(
  'CSP attached and enforced (negative probe refused)',
  enforcement === 'connect-src',
  String(enforcement),
);

const booted = await enterOfflineGame(page, {
  settleMs: WORLD_SETTLE_MS,
  gameBootTimeoutMs: WORLD_BOOT_TIMEOUT_MS,
});
check('offline world entry under the desktop CSP', booted);
await page.screenshot({ path: 'tmp/csp_smoke_world.png' });

// Direct probe of the exact ZSTDDecoder.init() bootstrap sequence.
const probe = await page.evaluate(async () => {
  try {
    const buf = await fetch('data:application/wasm;base64,AGFzbQEAAAA=').then((r) =>
      r.arrayBuffer(),
    );
    const mod = await WebAssembly.instantiate(buf, {});
    return { ok: true, bytes: buf.byteLength, instantiated: Boolean(mod.instance) };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
});
check(
  'zstd decoder bootstrap (fetch data: wasm, then instantiate)',
  probe.ok === true && probe.bytes === 8 && probe.instantiated === true,
  JSON.stringify(probe),
);

// The decisive reproduction of the "gets stuck loading N/11 and stalls" report:
// drive an actual graphics-settings change through the SAME live-rebuild flow
// the Options > Graphics > Apply button uses (hud.optionsHooks.applyGraphics),
// racing it against a bounded timeout so a genuine hang cannot wedge this script.
// The mid-flight #ls-status samples capture the literal "Loading world... N/11"
// text (src/ui/i18n.catalog/shell.ts loading.worldProgress) the coordinator's
// 'assets' stage shows while its 11 concurrent asset preparers
// (src/render/assets/graphics_profile.ts PREPARERS) are in flight.
const graphicsApply = await page.evaluate(
  async (keys, timeoutMs) => {
    const hooks = window.__game?.hud?.optionsHooks;
    if (!hooks) return { ok: false, error: 'window.__game.hud.optionsHooks not found' };
    const current = {};
    for (const key of keys) current[key] = hooks.settings.get(key);
    const fromPreset = current.graphicsPreset;
    // Deliberately jump to Ultra (the top preset, gfx.ts PRESET indices): the boot profile
    // above stays at Low precisely so this apply is the FIRST thing to ask for the
    // higher-detail (zstd KTX2 normal/occlusion map) assets, isolating the live-rebuild
    // asset-prep stage's own hang from whatever the boot profile happens to touch.
    const toPreset = fromPreset === 6 ? 3 : 6;
    const draft = { ...current, graphicsPreset: toPreset };

    const statusSamples = [];
    const sampleTimer = setInterval(() => {
      const text = document.querySelector('#ls-status')?.textContent;
      if (text) statusSamples.push(text);
    }, 400);

    const start = performance.now();
    const applied = hooks
      .applyGraphics(draft)
      .then((outcome) => ({ timedOut: false, outcome }))
      .catch((err) => ({ timedOut: false, outcome: null, error: String(err) }));
    const timeout = new Promise((resolve) =>
      setTimeout(() => resolve({ timedOut: true }), timeoutMs),
    );
    const result = await Promise.race([applied, timeout]);
    clearInterval(sampleTimer);

    return {
      // hooks.applyGraphics resolves to the GraphicsApplyOutcome string enum
      // ('applied' | 'fatal' | 'failed'; src/ui/hud.ts, wired in src/main.ts), not the
      // raw coordinator object, so compare the outcome itself, never an outcome.status.
      ok: !result.timedOut && result.outcome === 'applied',
      timedOut: result.timedOut,
      outcome: result.outcome ?? null,
      error: result.error ?? null,
      elapsedMs: Math.round(performance.now() - start),
      fromPreset,
      toPreset,
      lastStatusSamples: statusSamples.slice(-6),
      sampleCount: statusSamples.length,
    };
  },
  GRAPHICS_REBUILD_KEYS,
  GRAPHICS_APPLY_TIMEOUT_MS,
);
console.log('graphics-apply probe detail:', JSON.stringify(graphicsApply));
await page.screenshot({ path: 'tmp/csp_smoke_graphics_apply.png' });
check(
  'live graphics-settings apply resolves (not stuck) under the desktop CSP',
  graphicsApply.ok === true,
  JSON.stringify({
    timedOut: graphicsApply.timedOut,
    outcome: graphicsApply.outcome,
    error: graphicsApply.error,
    elapsedMs: graphicsApply.elapsedMs,
    lastStatusSamples: graphicsApply.lastStatusSamples,
  }),
);

// Drain late async loads (textures still streaming past the settle) before the final
// ledger read, then classify. First-party (failures): app resources on the dev origin,
// data:/blob: URIs, ws targets, and the URI-less script violations ('inline', 'eval',
// 'wasm-eval', empty). Vite's own HMR websocket (ws://<dev host>...?token=...) is
// dev-harness tooling with no packaged-shell counterpart, so a block on it is noise.
await new Promise((r) => setTimeout(r, LATE_LOAD_DRAIN_MS));
const eventViolations = await page.evaluate(() => window.__cspViolations ?? []);
const violations = [...eventViolations, ...consoleRefusals].filter(
  (v) => !v.blocked.includes(NEGATIVE_PROBE_HOST),
);
const isViteHmrSocket = (v) => {
  if (!v.blocked.startsWith('ws') || !v.blocked.includes('?token=')) return false;
  try {
    return new URL(v.blocked).hostname === gameUrl.hostname;
  } catch {
    return false;
  }
};
const isFirstParty = (v) =>
  !isViteHmrSocket(v) &&
  (v.blocked === '' ||
    v.blocked === 'inline' ||
    v.blocked === 'eval' ||
    v.blocked === 'wasm-eval' ||
    v.blocked.startsWith('data') ||
    v.blocked.startsWith('blob') ||
    v.blocked.startsWith('ws') ||
    v.blocked === origin ||
    v.blocked.startsWith(`${origin}/`));
const fatal = violations.filter(isFirstParty);
for (const w of violations.filter((v) => !isFirstParty(v))) {
  console.log(`WARN third-party blocked by CSP (by design): ${w.directive} ${w.blocked}`);
}
check(
  'no first-party CSP violations through world entry and the graphics apply',
  fatal.length === 0,
  JSON.stringify(fatal.slice(0, 3)),
);
check('no page errors', pageErrors.length === 0, pageErrors.slice(0, 2).join(' | '));

await browser.close();
console.log(fail > 0 ? 'RESULT: FAIL' : 'RESULT: PASS');
process.exit(fail > 0 ? 1 : 0);
