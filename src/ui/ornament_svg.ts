// Structural ornament shapes for HUD chrome: hand-authored / procedurally
// generated SVG masks for the "carved fantasy artifact" finish (window
// corners and tapered tops, a noisy hand-gilded edge texture, unit-frame
// and minimap rings).
//
// These are never inserted into the DOM (contrast with the `svgIcon` glyphs
// in ui_icons.ts, which ARE inline <svg> elements). An ornament shape is pure
// SHAPE data with no fill/color baked in: it is consumed exclusively as a CSS
// `mask-image`, so the element's own `background` (almost always `var(--border)`
// or `var(--gold)`) supplies the visible color and the ornament repaints for
// free on every theme preset, exactly like the existing `.tf-move-btn::before`
// mask icon in hud.css. One shape -> one role, reused everywhere it applies
// (the corner motif is the same primitive on `.panel` and `.action-btn`, just
// mask-sized smaller; the ring is the same primitive on the portrait disc and
// the minimap disc, just radius-parameterized).
//
// Wired once at boot via `applyOrnamentVars` (main.ts, alongside the existing
// one-time `hydrateIcons()` call): sets `--ornament-*` custom properties that
// hud.css / base.css / components.css reference with `mask-image: var(--ornament-*)`.
// Shapes are static (never theme-dependent), so this never needs to re-run on
// a theme switch; only the `background` color driving the mask changes, and
// that already flows live through `--border`/`--gold`.

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
 * falls off with 1/k (classic organic-noise weighting: low frequencies read as
 * gentle waver, high frequencies add fine texture without dominating). */
function seededHarmonics(seed: number, count: number, maxAmp: number): Harmonic[] {
  const rand = mulberry32(seed);
  const harmonics: Harmonic[] = [];
  for (let i = 0; i < count; i++) {
    const k = i + 1;
    const amp = (maxAmp * (0.4 + 0.6 * rand())) / k;
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

// base.css's .panel::after mask-size (48px 8px / transposed) must equal
// these; a per-component override (e.g. .party-frame::after) may render the
// SAME tile smaller via mask-size as long as it keeps this 48:8 aspect
// ratio, or the wobble distorts instead of just rescaling.
const EDGE_TILE_LENGTH = 48;
const EDGE_TILE_THICKNESS = 8;
const EDGE_BASE_WIDTH = 2.6;

/** `vertical` swaps the sampled axis so the SAME noise profile tiles along a
 * vertical (left/right) edge instead of a horizontal (top/bottom) one,
 * without needing a second, independently-seeded generator. */
function noisyEdgeInner(seed: number, vertical: boolean): string {
  const samples = 28;
  const centerHarmonics = seededHarmonics(seed, 3, 1.3);
  const widthHarmonics = seededHarmonics(seed + 1000, 3, 1.6);
  const cross = EDGE_TILE_THICKNESS / 2;
  const topPts: string[] = [];
  const botPts: string[] = [];
  for (let i = 0; i <= samples; i++) {
    const t = i / samples;
    const along = t * EDGE_TILE_LENGTH;
    const center = cross + periodicNoise(centerHarmonics, t);
    const halfW = Math.max(0.5, (EDGE_BASE_WIDTH + periodicNoise(widthHarmonics, t)) / 2);
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

const RING_STROKE = 1.6;
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

  const radiusHarmonics = seededHarmonics(RING_WOBBLE_SEED, 4, outerR * 0.02);
  const widthHarmonics = seededHarmonics(RING_WOBBLE_SEED + 1000, 3, RING_STROKE * 0.7);
  const samples = 96;
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

// ---------- boot wiring ----------

/** Reference sizes for the ring ornament at its two call sites (unit-frame portrait, minimap disc). */
export const PORTRAIT_RING_OUTER_R = 34;
export const MINIMAP_RING_OUTER_R = 90;

/**
 * Sets the `--ornament-*` custom properties every ornamented chrome rule
 * consumes. Called once at game boot (main.ts, next to `hydrateIcons()`);
 * shapes are static, so this never needs to re-run on a theme switch.
 */
export function applyOrnamentVars(root: HTMLElement = document.documentElement): void {
  root.style.setProperty('--ornament-corner', cornerOrnamentMaskImage());
  root.style.setProperty('--ornament-ring-portrait', ringOrnamentMaskImage(PORTRAIT_RING_OUTER_R));
  root.style.setProperty('--ornament-ring-minimap', ringOrnamentMaskImage(MINIMAP_RING_OUTER_R));
  root.style.setProperty('--ornament-window-top', windowTopOrnamentMaskImage());
  root.style.setProperty('--ornament-edge-h', noisyEdgeMaskImage(1, false));
  root.style.setProperty('--ornament-edge-v', noisyEdgeMaskImage(2, true));
}
