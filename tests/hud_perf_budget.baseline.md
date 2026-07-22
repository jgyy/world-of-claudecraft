# HUD per-frame performance baseline

The committed performance floor for the HUD per-frame render path. `hud_perf_budget.test.ts`
reads this file and throws if it is missing, so the numbers below are golden values: a
deliberate change to the per-frame budget updates the rows here in the same commit.

## How the three metrics are compared (read first)

The numbers are not interpreted the same way:

- **`hudHotDomWrites` (the elision-bypass count) is the durable, run-length-independent
  anchor.** It counts the hot-DOM writes that bypassed the write-elision cache (boot plus the
  occasional state-change write). A longer run adds only skips, never new bypass writes once the
  world is steady, so within a viewport the count does not move with frame count, CPU or GPU
  speed, or machine load: it is stable across re-runs and hardware. It does differ BY VIEWPORT
  (mobile boots additional hot elements: measured 548 mobile versus 467 desktop), so the baseline
  records one row per viewport. A collapse of write-elision makes it balloon toward the frame
  count, so the standing gate (ARM 3) asserts the count stays at or below the strictest (max)
  committed viewport row on every viewport. This is the number that travels across hardware.
- **`hudHotDomSkipRate` (the skip ratio) is derived and frame-count-dependent.** It is
  `skipped / (skipped + bypassed)`; the denominator is the total frame count, which jitters with
  software-WebGL fps and machine load run to run. It is reported for human context and used as a
  hard floor only by ARM 2's deterministic fake-DOM loop (a fixed denominator), never as a
  cross-run hard gate in a real-browser tour.
- **`frameP95` and `inputIntentToFrameP95` are same-machine-relative only.** They are wall-clock
  milliseconds and do not travel across hardware. They were captured under headless Chrome with
  software WebGL (`--use-angle=swiftshader`), which renders at roughly 1 to 2 fps, so the
  absolute values below are dominated by software rasterization, not by HUD cost. Compare them
  only against a fresh same-machine re-run of this baseline, never against the literal
  milliseconds on different hardware or a different renderer.
  - **The ARM 3 CI `frameP95` arm is a same-machine-manual signal, NOT a portable regression
    gate.** `src/game/perf.ts` clamps every recorded frame sample to a 250 ms ceiling, and the
    committed `frameP95` baseline is exactly that 250 ms, so `frameP95 <= baseline` cannot fail
    on any machine that hits the clamp (which software-WebGL CI always does). The perf-budget
    report job therefore surfaces `frameP95` for human context only; the portable regression
    signal on CI is the `hudHotDomWrites` bypass count. To make the frameP95 arm a real gate,
    run the tour on non-software-WebGL hardware and pin a genuine sub-250 ms value via
    `HUD_PERF_BUDGET_TOUR_FRAME_BASELINE`.

## Regenerating

perf_tour drives a real browser against the offline client only. It needs `npm run dev` (Vite)
listening on http://localhost:5173 and a Chromium-family browser resolved by
`scripts/browser_path.mjs`, launched headless with
`--use-angle=swiftshader --enable-unsafe-swiftshader`. No server or Postgres is required:
perf_tour boots the offline `Sim` directly (clicks `#btn-offline`, names a character, picks
warrior, clicks `#btn-start-offline`).

```sh
# desktop profile (1600x900, deviceScaleFactor 1, non-touch):
PERF_VIEWPORT=desktop node scripts/perf_tour.mjs
# pin the JSON output path:
PERF_OUT=/path/to/perf-tour-desktop.json PERF_VIEWPORT=desktop node scripts/perf_tour.mjs
```

`PERF_VIEWPORT` selects the profile: `desktop`, `mobile`, or `both` (default). Other relevant
defaults: `GAME_URL=http://localhost:5173`, `PERF_SCENARIO=bench_perf_tour`,
`PERF_STEP_MS=2500`, `PERF_SETTLE_MS=600`, `PERF_BOOT_TIMEOUT_MS=120000`. The mobile profile
boots landscape (844x390): the in-game world is landscape-only on web mobile, so a portrait
viewport hits the `#rotate-device` gate and never boots.

## Capture machine (absolute milliseconds are not portable)

| Field | Value |
|---|---|
| CPU | Apple M4 Max |
| Cores | 16 logical / 16 physical |
| RAM | 128 GB |
| OS | macOS 26.5.1 (arm64) |
| Node | v24.15.0 |
| Browser | Google Chrome 149.0.7827.196, headless, ANGLE swiftshader (software WebGL) |
| Captured | 2026-06-24 |

## Recorded floor

### desktop (1600x900)

| Metric | Value | Role |
|---|---|---|
| **hudHotDomSkipRate** | **0.962** (38 hot writes / 950 skipped, 988 total) | ARM 2 deterministic-loop floor |
| hudHotDomWrites | 467 | ARM 3 bypass-count anchor (desktop; gate uses the max viewport row) |
| frameP95 | 250 ms | same-machine-relative only (see the frameP95 note below) |
| inputIntentToFrameP95 | 652.7 ms | same-machine-relative only |
| inputIntentToVisibleP95 | 658.2 ms | same-machine-relative only |
| fps (full / last 10s) | 1.29 / 1.58 | software-WebGL artifact, context only |
| rendererTier | ultra | |
| bootMiB | 68.779 | |
| gltf / textures / views | 150 / 51 / 46 | |
| samples / errors | 6 / 0 | |

### mobile (844x390 landscape)

| Metric | Value | Role |
|---|---|---|
| **hudHotDomSkipRate** | **0.961** | within the boot-write band |
| hudHotDomWrites | 548 | ARM 3 bypass-count anchor (mobile; this is the max viewport row the gate uses) |
| frameP95 | 250 ms | same-machine-relative only (see the frameP95 note below) |
| fct burst | [64, 64, 64] | FCT pool cap-bounded (FCT_POOL_CAP=64) under the 3x400 AoE waves |
| bootMiB | 55.066 | |

The elision-bypass count `hudHotDomWrites` is run-length-independent (a longer run adds only
skips, never new bypass writes once the world is steady), so within a viewport it holds across
re-runs and hardware. It does differ BY VIEWPORT: mobile boots additional hot elements, so the
count is 548 on mobile versus 467 on desktop. ARM 3 gates every viewport against the single
strictest (max) committed `hudHotDomWrites` row (548), the same max-of-rows rule the
`hudHotDomSkipRate` floor uses. An earlier revision of this baseline pinned a single 153 row
captured 2026-06-24 and claimed the count was byte-identical across viewport; a month of HUD
features landed on the release branch since (the attunement tutorial panel, the minimap
ornament, the bags enchant/salvage actions, the professions UI), lifting the steady-state boot
writes, so the count was re-minted per viewport at the PR head.

## How the gate uses this

`hud_perf_budget.test.ts` reads three values and throws if any is absent (a deleted or
unregenerated baseline fails the budget instead of silently defaulting):

- the strictest committed `hudHotDomSkipRate` floor, for ARM 2's deterministic fake-DOM loop;
- the canonical `hudHotDomWrites` anchor row, for ARM 3's bypass-count gate (asserted on every viewport);
- the `frameP95` reference, which an operator on other hardware overrides with a fresh
  same-machine re-run via `HUD_PERF_BUDGET_TOUR_FRAME_BASELINE`.
