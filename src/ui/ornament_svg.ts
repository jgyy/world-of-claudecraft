// Structural ornament shapes for HUD chrome: hand-authored / procedurally
// generated SVG masks for the "carved fantasy artifact" finish (window
// corners and tapered tops, a noisy hand-gilded edge texture with a
// wavering multi-tone gradient, unit-frame and minimap rings, a background
// grain texture).
//
// These are never inserted into the DOM (contrast with the `svgIcon` glyphs
// in ui_icons.ts, which ARE inline <svg> elements). A SHAPE mask carries no
// fill/color of its own: it is consumed exclusively as a CSS `mask-image`,
// so the element's own `background` supplies the visible color and the
// ornament repaints for free on every theme preset, exactly like the
// existing `.tf-move-btn::before` mask icon in hud.css. The COLOR half
// (`giltGradientBackground`, below) is the one deliberate exception: it
// bakes `var(--border)` / `var(--gold)` / `color-mix()` references (never a
// literal hex) into a `repeating-conic-gradient`, so the gilded finish reads
// as unevenly toned gold leaf, not one flat color, while staying just as
// theme-reactive as a plain `var()` (a CSS custom property holding
// `var(--border)` still re-resolves live on a theme switch).
//
// Wired once at boot via `applyOrnamentVars` (main.ts, alongside the existing
// one-time `hydrateIcons()` call): sets `--ornament-*` custom properties that
// hud.css / base.css / components.css reference. Shapes and the gradient are
// static (never theme-dependent), so this never needs to re-run on a theme
// switch; only the token VALUES the gradient's `var()`/`color-mix()` terms
// resolve against change, live, through the normal cascade.

function polarX(cx: number, r: number, deg: number): number {
  return cx + r * Math.cos((deg * Math.PI) / 180);
}

function polarY(cy: number, r: number, deg: number): number {
  return cy + r * Math.sin((deg * Math.PI) / 180);
}

function n(v: number): string {
  return Number(v.toFixed(2)).toString();
}

function diamondPath(cx: number, cy: number, r: number): string {
  return `M ${n(cx)} ${n(cy - r)} L ${n(cx + r)} ${n(cy)} L ${n(cx)} ${n(cy + r)} L ${n(cx - r)} ${n(cy)} Z`;
}

function svgDataUri(inner: string, viewBoxSize: number): string {
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 ${viewBoxSize} ${viewBoxSize}'>${inner}</svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}

// ---------- deterministic noise: seeded, periodic (so a tiled/wrapped edge or
// ring never shows a seam where the pattern repeats) ----------

/** mulberry32: a small, fast, deterministic PRNG. Presentation-only (this file
 * never runs in src/sim/, so the sim's Math.random ban does not apply); used
 * to PICK noise-harmonic parameters once at generation time, not per-frame. */
function mulberry32(seed: number): () => number {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Harmonic {
  k: number;
  amp: number;
  phase: number;
}

/** Integer harmonics (k = 1, 2, 3, ...) so the resulting wave is exactly
 * periodic over t in [0, 1): a tile built from it wraps seamlessly. Amplitude
 * falls off with 1/k (classic organic-noise weighting: low frequencies read
 * as broad waver, high frequencies add fine irregular texture on top without
 * dominating). A generous harmonic COUNT is what keeps the result reading as
 * genuinely uneven rather than one smooth, obviously-repeating sine wave. */
function seededHarmonics(seed: number, count: number, maxAmp: number): Harmonic[] {
  const rand = mulberry32(seed);
  const harmonics: Harmonic[] = [];
  for (let i = 0; i < count; i++) {
    const k = i + 1;
    const amp = (maxAmp * (0.35 + 0.65 * rand())) / k ** 0.85;
    const phase = rand() * Math.PI * 2;
    harmonics.push({ k, amp, phase });
  }
  return harmonics;
}

function periodicNoise(harmonics: Harmonic[], t: number): number {
  let v = 0;
  for (const h of harmonics) v += h.amp * Math.sin(h.k * t * Math.PI * 2 + h.phase);
  return v;
}

// ---------- gilt color: a repeating-conic-gradient over theme tokens, so the
// "gold" of every gilded shape visibly shifts tone as you trace around a
// ring or along a panel's perimeter, the way hand-applied gold leaf catches
// light unevenly, instead of reading as one flat color ----------

// An integer divisor of 360 (9 repeats) so the gradient closes with no seam,
// the same seamlessness contract the noise harmonics use, just angular
// instead of periodic-in-t. Deliberately NOT a divisor of 90: each of a
// panel's 4 corners then lands on a different point in the color cycle,
// rather than all 4 corners always showing the identical tone.
const GILT_PERIOD_DEG = 40;

function giltGradientStops(): string {
  const p = GILT_PERIOD_DEG;
  return [
    `var(--border) 0deg`,
    `color-mix(in srgb, var(--gold) 60%, var(--border) 40%) ${n(p * 0.18)}deg`,
    `var(--gold-dim) ${n(p * 0.34)}deg`,
    `color-mix(in srgb, var(--border) 55%, black 45%) ${n(p * 0.52)}deg`,
    `var(--border) ${n(p * 0.68)}deg`,
    `color-mix(in srgb, var(--gold) 40%, var(--border) 60%) ${n(p * 0.86)}deg`,
    `var(--border) ${n(p)}deg`,
  ].join(', ');
}

/**
 * `repeating-conic-gradient` centered on the element, so the SAME value
 * naturally colors both a rectangle's perimeter (as you trace corner to
 * corner, the angle from center sweeps smoothly) and a ring (angle IS the
 * ring's own parameterization already), with no separate rectangle/circle
 * variant needed. Used as `background` wherever ornament previously used a
 * flat `var(--border)`.
 */
export function giltGradientBackground(): string {
  return `repeating-conic-gradient(from 0deg, ${giltGradientStops()})`;
}

// ---------- corner motif: a thin bracket + diamond, anchored top-left ----------

const CORNER_SIZE = 32;
const CORNER_STROKE = 1.3;

function cornerMotifPath(): string {
  const inset = 3;
  const armLen = 13;
  const bracket = `M ${n(inset)} ${n(inset + armLen)} L ${n(inset)} ${n(inset)} L ${n(inset + armLen)} ${n(inset)}`;
  // a short second, inset arm: the layered-bracket look the reference sheet's
  // corner frames use (two nested strokes), not a single fat line
  const innerArmLen = 7;
  const innerInset = inset + 3.2;
  const innerBracket = `M ${n(innerInset)} ${n(innerInset + innerArmLen)} L ${n(innerInset)} ${n(innerInset)} L ${n(innerInset + innerArmLen)} ${n(innerInset)}`;

  const gemCx = inset + 5.5;
  const gemCy = inset + 5.5;
  const gemR = 2.4;
  const gem = diamondPath(gemCx, gemCy, gemR);

  const tickLen = 4.5;
  const ticks = [24, 66].map((deg) => {
    const x1 = polarX(gemCx, gemR + 0.8, deg);
    const y1 = polarY(gemCy, gemR + 0.8, deg);
    const x2 = polarX(gemCx, gemR + 0.8 + tickLen, deg);
    const y2 = polarY(gemCy, gemR + 0.8 + tickLen, deg);
    return `M ${n(x1)} ${n(y1)} L ${n(x2)} ${n(y2)}`;
  });

  const strokes = `<path d="${bracket} ${innerBracket} ${ticks.join(' ')}" fill="none" stroke="#000" stroke-width="${CORNER_STROKE}" stroke-linecap="round" stroke-linejoin="round"/>`;
  const fill = `<path d="${gem}"/>`;
  return strokes + fill;
}

/** One `mask-image` layer per corner (top-left orientation, then the same path mirrored). */
function cornerMotifDataUri(mirrorX: boolean, mirrorY: boolean): string {
  const sx = mirrorX ? -1 : 1;
  const sy = mirrorY ? -1 : 1;
  const tx = mirrorX ? CORNER_SIZE : 0;
  const ty = mirrorY ? CORNER_SIZE : 0;
  const inner = `<g transform="translate(${tx} ${ty}) scale(${sx} ${sy})">${cornerMotifPath()}</g>`;
  return svgDataUri(inner, CORNER_SIZE);
}

/** All four corners as one comma-separated `mask-image` value (top-left, top-right, bottom-left, bottom-right, in that order). */
export function cornerOrnamentMaskImage(): string {
  return [
    cornerMotifDataUri(false, false),
    cornerMotifDataUri(true, false),
    cornerMotifDataUri(false, true),
    cornerMotifDataUri(true, true),
  ].join(', ');
}

/**
 * The `.window` corner treatment: bracket motifs at the two BOTTOM corners
 * (unaffected by the tapered top's clip-path) plus a gem accent twice, for
 * the two chamfer apex points the tapered top's clip-path leaves as the
 * window's new top "corners" (bracket motifs anchored at the literal box
 * corner would sit inside the clipped-away triangle and vanish).
 * Four layers, in order: bottom-left, bottom-right, top-left chamfer,
 * top-right chamfer (the caller positions the last two via `calc()` against
 * the same `--window-taper` the clip-path uses).
 */
export function windowTopOrnamentMaskImage(): string {
  return [
    cornerMotifDataUri(false, true),
    cornerMotifDataUri(true, true),
    taperAccentMaskImage(),
    taperAccentMaskImage(),
  ].join(', ');
}

// ---------- noisy gilt edge: a seamlessly tileable wavy, varying-thickness
// ribbon, the hand-gilded-gold-leaf texture (uneven width and a wavering
// centerline) reused along every straight edge, at any element size, via
// CSS mask-repeat ----------

// base.css's .panel::after mask-size (96px 10px / transposed) must equal
// these; a per-component override (e.g. .party-frame::after) may render the
// SAME tile smaller via mask-size as long as it keeps this 96:10 aspect
// ratio, or the wobble distorts instead of just rescaling.
const EDGE_TILE_LENGTH = 96;
const EDGE_TILE_THICKNESS = 10;
const EDGE_BASE_WIDTH = 3.2;
const EDGE_MIN_HALF_WIDTH = 0.55;

/** `vertical` swaps the sampled axis so the SAME noise profile tiles along a
 * vertical (left/right) edge instead of a horizontal (top/bottom) one,
 * without needing a second, independently-seeded generator. */
function noisyEdgeInner(seed: number, vertical: boolean): string {
  const samples = 56;
  // 6 harmonics (vs. a smaller count) is what keeps consecutive tiles from
  // reading as an obviously-stamped repeat: each cycle has enough independent
  // wave components that the eye does not immediately recognize the period.
  const centerHarmonics = seededHarmonics(seed, 6, 3.2);
  const widthHarmonics = seededHarmonics(seed + 1000, 5, 3.6);
  const cross = EDGE_TILE_THICKNESS / 2;
  const topPts: string[] = [];
  const botPts: string[] = [];
  for (let i = 0; i <= samples; i++) {
    const t = i / samples;
    const along = t * EDGE_TILE_LENGTH;
    const center = cross + periodicNoise(centerHarmonics, t);
    const halfW = Math.max(
      EDGE_MIN_HALF_WIDTH,
      (EDGE_BASE_WIDTH + periodicNoise(widthHarmonics, t)) / 2,
    );
    const a = center - halfW;
    const b = center + halfW;
    if (vertical) {
      topPts.push(`${n(a)} ${n(along)}`);
      botPts.push(`${n(b)} ${n(along)}`);
    } else {
      topPts.push(`${n(along)} ${n(a)}`);
      botPts.push(`${n(along)} ${n(b)}`);
    }
  }
  const d = `M ${topPts.join(' L ')} L ${botPts.reverse().join(' L ')} Z`;
  return `<path d="${d}"/>`;
}

/**
 * A horizontal (or, transposed, vertical) tile of the noisy gilt edge. `seed`
 * varies per consumer so different components don't all wobble in lockstep
 * (their tile lengths differ anyway, so alignment would be coincidental, but
 * a distinct seed also means two ornamented components never look like
 * carbon copies of each other up close).
 */
export function noisyEdgeMaskImage(seed: number, vertical: boolean): string {
  const viewBox = vertical
    ? `0 0 ${EDGE_TILE_THICKNESS} ${EDGE_TILE_LENGTH}`
    : `0 0 ${EDGE_TILE_LENGTH} ${EDGE_TILE_THICKNESS}`;
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='${viewBox}'>${noisyEdgeInner(seed, vertical)}</svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}

// ---------- twin ring: two thin concentric circles (the outer one gilt-noisy)
// + 4 cardinal gems + 4 corner dots ----------

const RING_STROKE = 1.7;
const RING_GAP = 3.4;
/** Integer angular harmonics keep the wobble exactly periodic over 360 degrees,
 * so the ring closes on itself with no seam, the circular analog of the
 * edge tile's seamless horizontal repeat. */
const RING_WOBBLE_SEED = 7;

/**
 * A detailed ring ornament: two thin concentric strokes with a small gap
 * (the outer one gilt-noisy: a wavering radius and stroke width, echoing the
 * same hand-gilded texture the straight edges use), a diamond gem bridging
 * the gap at each of the 4 cardinal points, and a small dot at each of the 4
 * diagonal points. `outerR` is also used as the SVG's center, so the shape
 * is self-contained in a `2*outerR` square viewBox regardless of where it is
 * later mask-positioned.
 */
export function twinRingInner(outerR: number): string {
  const cx = outerR;
  const cy = outerR;
  const outerRingR = outerR - RING_STROKE / 2;
  const innerRingR = outerRingR - RING_STROKE - RING_GAP;
  const gemCenterR = outerRingR - RING_STROKE / 2 - RING_GAP / 2;
  const gemR = RING_STROKE + RING_GAP / 2 + 0.6;
  const dotR = 1.1;

  const radiusHarmonics = seededHarmonics(RING_WOBBLE_SEED, 6, outerR * 0.045);
  const widthHarmonics = seededHarmonics(RING_WOBBLE_SEED + 1000, 5, RING_STROKE * 1.1);
  const samples = 120;
  const outerTopPts: string[] = [];
  const outerBotPts: string[] = [];
  for (let i = 0; i <= samples; i++) {
    const t = i / samples;
    const deg = t * 360;
    const r = outerRingR + periodicNoise(radiusHarmonics, t);
    const halfW = Math.max(0.4, (RING_STROKE + periodicNoise(widthHarmonics, t)) / 2);
    outerTopPts.push(`${n(polarX(cx, r - halfW, deg))} ${n(polarY(cy, r - halfW, deg))}`);
    outerBotPts.push(`${n(polarX(cx, r + halfW, deg))} ${n(polarY(cy, r + halfW, deg))}`);
  }
  const outerRing = `<path d="M ${outerTopPts.join(' L ')} Z M ${outerBotPts.reverse().join(' L ')} Z" fill-rule="evenodd"/>`;
  const innerCircle = `<circle cx="${n(cx)}" cy="${n(cy)}" r="${n(innerRingR)}" fill="none" stroke="#000" stroke-width="${RING_STROKE}"/>`;

  const gems = [0, 90, 180, 270]
    .map((deg) => diamondPath(polarX(cx, gemCenterR, deg), polarY(cy, gemCenterR, deg), gemR))
    .join(' ');
  const gemPath = `<path d="${gems}"/>`;

  const dots = [45, 135, 225, 315]
    .map((deg) => {
      const dx = polarX(cx, gemCenterR, deg);
      const dy = polarY(cy, gemCenterR, deg);
      return `<circle cx="${n(dx)}" cy="${n(dy)}" r="${n(dotR)}"/>`;
    })
    .join('');

  return outerRing + innerCircle + gemPath + dots;
}

export function ringOrnamentMaskImage(outerR: number): string {
  return svgDataUri(twinRingInner(outerR), outerR * 2);
}

// ---------- taper accent: a small gem marking a chamfered window-top corner cut ----------

// `.window::before` (layout.css) mask-positions this at `calc(var(--window-taper) -
// TAPER_ACCENT_SIZE/2) 0` to center it on the taper's chamfer apex; its mask-size
// must equal TAPER_ACCENT_SIZE too. Change this value, change both spots there.
const TAPER_ACCENT_SIZE = 14;

export function taperAccentMaskImage(): string {
  const c = TAPER_ACCENT_SIZE / 2;
  const gem = diamondPath(c, c, c - 1.5);
  const ring = `<circle cx="${n(c)}" cy="${n(c)}" r="${n(c - 0.6)}" fill="none" stroke="#000" stroke-width="1"/>`;
  return svgDataUri(`<path d="${gem}"/>${ring}`, TAPER_ACCENT_SIZE);
}

// ---------- background grain: a small tileable speckle field, blended over
// ANY existing background via mix-blend-mode so a "hand-worked" texture
// shows through regardless of the underlying panel/bar/button color ----------

const GRAIN_TILE_SIZE = 96;
const GRAIN_SEED = 42;
const GRAIN_SPECK_COUNT = 70;

/**
 * A small field of soft, irregular light/dark specks (never a themed color:
 * the specks are plain black/white at partial alpha), meant to be applied as
 * `background-image` with `background-blend-mode: overlay` (or `soft-light`)
 * against WHATEVER background sits under it: overlay lightens/darkens the
 * base color per-speck rather than replacing it, so the same texture reads
 * correctly on a dark window panel, a colored resource bar, or a light
 * preset panel alike, per "regardless what color it is."
 */
export function grainTextureBackgroundImage(): string {
  const rand = mulberry32(GRAIN_SEED);
  const specks: string[] = [];
  for (let i = 0; i < GRAIN_SPECK_COUNT; i++) {
    const x = rand() * GRAIN_TILE_SIZE;
    const y = rand() * GRAIN_TILE_SIZE;
    const r = 0.6 + rand() * 3.2;
    const light = rand() > 0.5;
    const alpha = (0.1 + rand() * 0.24).toFixed(2);
    const fill = light ? `rgba(255,255,255,${alpha})` : `rgba(0,0,0,${alpha})`;
    specks.push(`<circle cx="${n(x)}" cy="${n(y)}" r="${n(r)}" fill="${fill}"/>`);
    // a wrapped copy near each edge so the speck field tiles with no seam,
    // the same edge-wrap trick a seamless texture needs regardless of noise
    // model: specks within `r` of a border are mirrored across it.
    const wrapX = x < GRAIN_TILE_SIZE / 2 ? x + GRAIN_TILE_SIZE : x - GRAIN_TILE_SIZE;
    const wrapY = y < GRAIN_TILE_SIZE / 2 ? y + GRAIN_TILE_SIZE : y - GRAIN_TILE_SIZE;
    if (x < r * 2 || x > GRAIN_TILE_SIZE - r * 2) {
      specks.push(`<circle cx="${n(wrapX)}" cy="${n(y)}" r="${n(r)}" fill="${fill}"/>`);
    }
    if (y < r * 2 || y > GRAIN_TILE_SIZE - r * 2) {
      specks.push(`<circle cx="${n(x)}" cy="${n(wrapY)}" r="${n(r)}" fill="${fill}"/>`);
    }
  }
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 ${GRAIN_TILE_SIZE} ${GRAIN_TILE_SIZE}'>${specks.join('')}</svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}

// ---------- boot wiring ----------

/** Reference sizes for the ring ornament at its call sites (unit-frame portrait,
 * minimap disc, and small circular badges: level chip, frame-lock toggle, etc). */
export const PORTRAIT_RING_OUTER_R = 34;
export const MINIMAP_RING_OUTER_R = 90;
export const MICRO_RING_OUTER_R = 13;

/**
 * Sets the `--ornament-*` custom properties every ornamented chrome rule
 * consumes. Called once at game boot (main.ts, next to `hydrateIcons()`);
 * shapes are static, so this never needs to re-run on a theme switch.
 */
export function applyOrnamentVars(root: HTMLElement = document.documentElement): void {
  root.style.setProperty('--ornament-corner', cornerOrnamentMaskImage());
  root.style.setProperty('--ornament-ring-portrait', ringOrnamentMaskImage(PORTRAIT_RING_OUTER_R));
  root.style.setProperty('--ornament-ring-minimap', ringOrnamentMaskImage(MINIMAP_RING_OUTER_R));
  root.style.setProperty('--ornament-ring-micro', ringOrnamentMaskImage(MICRO_RING_OUTER_R));
  root.style.setProperty('--ornament-window-top', windowTopOrnamentMaskImage());
  root.style.setProperty('--ornament-edge-h', noisyEdgeMaskImage(1, false));
  root.style.setProperty('--ornament-edge-v', noisyEdgeMaskImage(2, true));
  root.style.setProperty('--ornament-gilt', giltGradientBackground());
  root.style.setProperty('--ornament-grain', grainTextureBackgroundImage());
}
