// Hand-gilded filigree ornament for the Performance Overlay window
// (#options-menu.perf-wide only; see components.css). A narrow, deliberately
// scoped pilot: it does not touch the shared .panel/.window primitive or any
// other window, and reads its own --perf-ornament-* / --color-gold-* tokens
// (tokens.css) rather than retuning --gold/--border. See PR body for the scope
// rationale; a repo-wide DESIGN.md rollout is tracked separately.
//
// Adapts the proven techniques from the (unmerged, closed) PR #2152 fantasy-HUD
// ornament redesign: shapes are COLORLESS SVG, consumed only as CSS
// `mask-image` data-URIs (never inserted into the DOM), so the element's own
// `background` supplies the visible color and the ornament repaints for free on
// a token change. Noise is a small seeded PRNG picking amplitude/phase for a
// few INTEGER-frequency sine harmonics: because sin(k*0*2*pi+phase) ==
// sin(k*1*2*pi+phase) for integer k, the resulting wave is exactly periodic
// over its sample domain, so a tiled edge ribbon has no visible seam.
//
// The corner motif went through a full redesign against a second reference
// image (a small in-game window with a rounded-rectangle gilded frame): one
// compact, thick, ROUNDED curl per corner (round stroke caps/joins, never a
// sharp point), not the earlier round's vine-plus-leaf composition, which
// read as "leaves pointing inward" rather than a hand-carved scroll bracket.
// Geometry noise and color noise are still two SEPARATE knobs: the curl's
// own shape carries only a small radius wobble, while the gilt gradient
// below supplies the "hand-applied, unevenly toned" color read.

function polarX(cx: number, r: number, deg: number): number {
  return cx + r * Math.cos((deg * Math.PI) / 180);
}

function polarY(cy: number, r: number, deg: number): number {
  return cy + r * Math.sin((deg * Math.PI) / 180);
}

function n(v: number): string {
  return Number(v.toFixed(2)).toString();
}

function svgDataUri(inner: string, viewBoxSize: number): string {
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 ${viewBoxSize} ${viewBoxSize}'>${inner}</svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}

// ---------- deterministic noise: seeded, periodic (so a tiled edge never
// shows a seam where the pattern repeats) ----------

/** mulberry32: a small, fast, deterministic PRNG. Presentation-only (this file
 * never runs in src/sim/, so the sim's Math.random ban does not apply); used
 * to pick noise-harmonic parameters once at generation time, not per-frame. */
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
 * periodic over t in [0, 1): a tile built from it wraps seamlessly. */
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

// ---------- gilt color: a repeating-conic-gradient over the gold ramp tokens,
// so the "gold" of the frame visibly shifts tone as you trace around the
// window's perimeter, the way hand-applied gold leaf catches light unevenly,
// instead of reading as one flat color ----------

// An integer divisor of 360 (9 repeats) so the gradient closes with no seam.
// Deliberately NOT a divisor of 90: each of the window's 4 corners then lands
// on a different point in the color cycle, rather than all 4 matching.
const GILT_PERIOD_DEG = 20;
const GILT_STOP_COUNT = 6;
const GILT_SEED = 2152;

/** Every candidate color is a --color-gold-* token or a color-mix() of them
 * (never a literal hex), so the gradient repaints on a future token retune.
 * Weighted toward the REALISTIC-gold mid-tones (500/400/600, repeated) with
 * the near-black and near-white extremes kept as rare accents rather than
 * equally-likely picks: an earlier, uniformly-weighted version swung too far
 * toward those extremes and read as muddy/harsh rather than "gold". */
function giltColorPalette(): string[] {
  return [
    'var(--color-gold-600)',
    'var(--color-gold-500)',
    'var(--color-gold-400)',
    'var(--color-gold-500)',
    'var(--color-gold-600)',
    'var(--color-gold-400)',
    'var(--color-gold-700)',
    'color-mix(in srgb, var(--color-gold-500) 60%, var(--color-gold-300) 40%)',
    'color-mix(in srgb, var(--color-gold-600) 65%, var(--color-gold-800) 35%)',
    'var(--color-gold-300)',
  ];
}

function giltGradientStops(): string {
  const p = GILT_PERIOD_DEG;
  const rand = mulberry32(GILT_SEED);
  const palette = giltColorPalette();
  // Both period boundaries share the SAME color so the repeat closes with no
  // visible seam, exactly like the noise harmonics' seamlessness contract.
  const anchor = palette[0];
  const positions = Array.from({ length: GILT_STOP_COUNT }, () => rand() * p).sort((a, b) => a - b);
  const stops = [`${anchor} 0deg`];
  for (const pos of positions) {
    const color = palette[1 + Math.floor(rand() * (palette.length - 1))];
    stops.push(`${color} ${n(pos)}deg`);
  }
  stops.push(`${anchor} ${n(p)}deg`);
  return stops.join(', ');
}

/**
 * `repeating-conic-gradient` centered on the element, so the same value
 * naturally colors a rectangle's perimeter (the angle from center sweeps
 * smoothly corner to corner) with no separate variant needed. Consumed as
 * `background` wherever the ornament previously used a flat token color.
 */
export function perfGiltGradientBackground(): string {
  return `repeating-conic-gradient(from 0deg, ${giltGradientStops()})`;
}

// ---------- corner motif: ONE compact, thick, rounded gilded curl per
// corner, matching a reference image of small hand-carved scroll flourishes
// (never a leaf/vine/gem composition, and never a sharp point anywhere):
// round stroke caps/joins do the "rounded" work, and 3 overlapping strokes
// of decreasing length and width along the SAME curve fake a tapered,
// hand-painted brush stroke without manual variable-width polygon math ----

const CORNER_SIZE = 30;
const CORNER_CX = 10;
const CORNER_CY = 10;
const CORNER_START_DEG = 8;
const CORNER_END_DEG = 100;

/**
 * The 4 corner variants are mirrored by baking the flip into every emitted
 * COORDINATE (`n2` below), never via an SVG `<g transform="... scale(-1 ...)">`
 * wrapper. An earlier version used that wrapper and hit a real Chromium mask
 * rendering bug: combining SEVERAL DIFFERING large inline-SVG `mask-image`
 * data URIs in one multi-layer `mask-image` list, where the differing layers
 * relied on a negative-scale `<g transform>`, made every layer render as the
 * FIRST (unmirrored) layer's shape (confirmed by isolating the variable in a
 * minimal repro: identical-content layers combined correctly regardless of
 * transform presence; genuinely differing negative-scale-transformed layers
 * did not, even for a two-line bracket with no other complexity). Baking the
 * mirror into plain coordinate math sidesteps the whole mechanism.
 */
interface Mirror {
  x: boolean;
  y: boolean;
  size: number;
}

function n2(x: number, y: number, m: Mirror): string {
  const mx = m.x ? m.size - x : x;
  const my = m.y ? m.size - y : y;
  return `${n(mx)} ${n(my)}`;
}

// The radius PEAKS partway through the sweep, then pulls back in toward the
// tip (t=1): a plain monotonic arc read as a bare swoosh, not a scroll. This
// small bulge-then-tuck is what gives the tip its "curling inward" hook
// character, matching the reference's small spiral rather than one bare arc.
const CORNER_PEAK_T = 0.55;
const CORNER_R_START = 6.5;
const CORNER_R_PEAK = 12.5;
const CORNER_R_END = 7;

/**
 * One point along the curl's centerline: a smooth arc around `(CORNER_CX,
 * CORNER_CY)` with a small hand-drawn wobble on the RADIUS only (never the
 * angle, which would read as a jerky/uneven sweep rather than a smooth
 * carved curl). `t` in [0, 1] runs base-to-tip.
 */
function curlPoint(t: number, wobble: Harmonic[]): { x: number; y: number } {
  const deg = CORNER_START_DEG + (CORNER_END_DEG - CORNER_START_DEG) * t;
  const rBase =
    t <= CORNER_PEAK_T
      ? CORNER_R_START + (CORNER_R_PEAK - CORNER_R_START) * (t / CORNER_PEAK_T)
      : CORNER_R_PEAK +
        (CORNER_R_END - CORNER_R_PEAK) * ((t - CORNER_PEAK_T) / (1 - CORNER_PEAK_T));
  const r = rBase + periodicNoise(wobble, t) * 0.5;
  return { x: polarX(CORNER_CX, r, deg), y: polarY(CORNER_CY, r, deg) };
}

/** The curl's centerline from its base (t=0) out to `tMax` (<=1), sampled
 * densely enough to read as a smooth arc once stroked with round joins. */
function curlCenterlinePath(tMax: number, wobble: Harmonic[], m: Mirror): string {
  const samples = 22;
  const pts: string[] = [];
  for (let i = 0; i <= samples; i++) {
    const t = (i / samples) * tMax;
    const { x, y } = curlPoint(t, wobble);
    pts.push(n2(x, y, m));
  }
  return `M ${pts.join(' L ')}`;
}

/**
 * ONE compact, thick, rounded gilded curl: a single stroked arc, not a
 * filled ribbon/vine/leaf composition. `stroke-linecap="round"` and
 * `stroke-linejoin="round"` do all the "rounded, hand-gilded, never a sharp
 * point" work; 3 overlapping strokes of decreasing length AND width along
 * the exact same centerline fake a tapered brush stroke (thick at the base,
 * finer toward the tip) without hand-building a variable-width polygon.
 */
function cornerMotifPath(m: Mirror): string {
  const wobble = seededHarmonics(303, 3, 0.4);
  const base = curlCenterlinePath(1, wobble, m);
  const mid = curlCenterlinePath(0.66, wobble, m);
  const tip = curlCenterlinePath(0.34, wobble, m);
  const stroke = (d: string, width: number): string =>
    `<path d="${d}" fill="none" stroke="#000" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round"/>`;
  return stroke(base, 3.6) + stroke(mid, 2.6) + stroke(tip, 1.6);
}

/** One `mask-image` layer per corner (top-left orientation, then the same
 * geometry mirrored in coordinate space for the other three; see the
 * `Mirror` doc comment above for why this avoids an SVG `<g transform>`). */
function cornerMotifDataUri(mirrorX: boolean, mirrorY: boolean): string {
  const inner = cornerMotifPath({ x: mirrorX, y: mirrorY, size: CORNER_SIZE });
  return svgDataUri(inner, CORNER_SIZE);
}

/** All four corners as one comma-separated `mask-image` value (top-left,
 * top-right, bottom-left, bottom-right, in that order). */
export function perfCornerOrnamentMaskImage(): string {
  return [
    cornerMotifDataUri(false, false),
    cornerMotifDataUri(true, false),
    cornerMotifDataUri(false, true),
    cornerMotifDataUri(true, true),
  ].join(', ');
}

export const PERF_CORNER_SIZE = CORNER_SIZE;

// ---------- noisy gilt edge: a seamlessly tileable ribbon. The centerline
// stays essentially straight (a hand-gilded line follows the edge, it does
// not wander off it) and only the stroke width wavers, ever so slightly; the
// "hand-applied, not machine-drawn" read comes mainly from the gilt
// gradient's color noise above, not from geometric waviness ----------

const EDGE_TILE_LENGTH = 96;
const EDGE_TILE_THICKNESS = 12;
const EDGE_BASE_WIDTH = 2.6;
const EDGE_MIN_HALF_WIDTH = 0.6;

/** `vertical` swaps the sampled axis so the SAME noise profile tiles along a
 * vertical (left/right) edge instead of a horizontal (top/bottom) one. */
function noisyEdgeInner(seed: number, vertical: boolean): string {
  const samples = 56;
  const centerHarmonics = seededHarmonics(seed, 6, 0.3);
  const widthHarmonics = seededHarmonics(seed + 1000, 5, 1.1);
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
 * A horizontal (or, transposed, vertical) tile of the noisy gilt edge.
 * `seed` varies per axis so the horizontal and vertical edges don't wobble in
 * lockstep.
 */
export function perfNoisyEdgeMaskImage(seed: number, vertical: boolean): string {
  const viewBox = vertical
    ? `0 0 ${EDGE_TILE_THICKNESS} ${EDGE_TILE_LENGTH}`
    : `0 0 ${EDGE_TILE_LENGTH} ${EDGE_TILE_THICKNESS}`;
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='${viewBox}'>${noisyEdgeInner(seed, vertical)}</svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}

export const PERF_EDGE_TILE_LENGTH = EDGE_TILE_LENGTH;
export const PERF_EDGE_TILE_THICKNESS = EDGE_TILE_THICKNESS;

// ---------- boot wiring ----------

/**
 * Sets the `--perf-ornament-*` custom properties the #options-menu.perf-wide
 * CSS consumes. Called once at game boot (main.ts, next to `hydrateIcons()`);
 * shapes are static, so this never needs to re-run on a theme switch.
 *
 * Each of the 4 edge tiles gets its OWN seed (never the top tile's value
 * reused for the bottom, or the left tile's for the right): the combined
 * `#options-menu.perf-wide::before` mask-image list (components.css)
 * references all 4 individually. This isn't just "so opposite edges don't
 * wobble in lockstep" (the reason every OTHER seed in this file is distinct)
 * -- it also works around a real Chromium multi-layer-mask rendering bug,
 * confirmed by isolating the variable in a minimal repro: a `mask-image`
 * list that repeats the literal SAME `url(...)` value at two different
 * `mask-position` slots only renders the FIRST occurrence; every later
 * occurrence of that identical value silently fails to paint. Distinct
 * seeds make every layer's data URI byte-different, sidestepping it.
 */
export function applyPerfOrnamentVars(root: HTMLElement = document.documentElement): void {
  root.style.setProperty('--perf-ornament-corner', perfCornerOrnamentMaskImage());
  root.style.setProperty('--perf-ornament-edge-top', perfNoisyEdgeMaskImage(1, false));
  root.style.setProperty('--perf-ornament-edge-bottom', perfNoisyEdgeMaskImage(3, false));
  root.style.setProperty('--perf-ornament-edge-left', perfNoisyEdgeMaskImage(2, true));
  root.style.setProperty('--perf-ornament-edge-right', perfNoisyEdgeMaskImage(4, true));
  root.style.setProperty('--perf-ornament-gilt', perfGiltGradientBackground());
}
