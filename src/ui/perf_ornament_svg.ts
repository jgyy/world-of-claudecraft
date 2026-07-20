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
// Unlike PR #2152's later (round 6-7) minimal corner motif, this pilot's corner
// is deliberately RICHER: a curling acanthus-vine ribbon plus leaf accents, to
// match the ornate reference image the pilot was scoped against, not the
// restrained "thin near-straight line" direction that PR reached for an
// all-HUD rollout. Geometry noise and color noise are still two SEPARATE
// knobs: the vine/leaf shapes are fixed (not per-frame random), while the gilt
// gradient below supplies the "hand-applied, unevenly toned" read.

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
 * (never a literal hex), so the gradient repaints on a future token retune. */
function giltColorPalette(): string[] {
  return [
    'var(--color-gold-700)',
    'var(--color-gold-900)',
    'var(--color-gold-500)',
    'var(--color-gold-300)',
    'var(--color-gold-400)',
    'var(--color-gold-800)',
    'color-mix(in srgb, var(--color-gold-300) 70%, white 30%)',
    'color-mix(in srgb, var(--color-gold-900) 70%, black 30%)',
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

// ---------- corner motif: a nested bracket, a curling acanthus vine with leaf
// accents, and a center gem. Larger and more ornate than a restrained
// hairline corner: this pilot is scoped against a reference image with a
// visibly hand-carved, rococo-style corner flourish ----------

const CORNER_SIZE = 72;
const CORNER_STROKE = 1.8;

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

/**
 * A tapered ribbon that curls like a carved acanthus scroll: it swings out
 * from the pivot to a peak radius (`rPeak` at `peakT`), then curls back in
 * toward `rEnd` while STILL rotating in the same direction, the way a
 * fiddlehead/volute coils at its tip. `startDeg`/`endDeg` are chosen by the
 * caller to stay within a single quadrant relative to `cx,cy` (0 to 90deg
 * for a top-left corner, so every sample keeps x >= cx and y >= cy: safely
 * on-canvas for any r up to the panel edge, never wrapping into a negative
 * coordinate off the mask's viewBox). Built with the same sampled-polyline-
 * offset technique as the edge ribbon / ring below (never a plain constant-
 * width `stroke-width` line, which would read as a wire, not a carved vine).
 */
function vineRibbonPath(
  cx: number,
  cy: number,
  startDeg: number,
  endDeg: number,
  rStart: number,
  rPeak: number,
  rEnd: number,
  peakT: number,
  startHalfW: number,
  endHalfW: number,
  seed: number,
  m: Mirror,
): string {
  const samples = 36;
  const wobble = seededHarmonics(seed, 4, 0.3);
  const innerPts: string[] = [];
  const outerPts: string[] = [];
  for (let i = 0; i <= samples; i++) {
    const t = i / samples;
    const deg = startDeg + (endDeg - startDeg) * t;
    const r =
      (t <= peakT
        ? rStart + (rPeak - rStart) * (t / peakT)
        : rPeak + (rEnd - rPeak) * ((t - peakT) / (1 - peakT))) +
      periodicNoise(wobble, t) * (1 - 0.6 * t);
    const halfW = Math.max(0.3, startHalfW + (endHalfW - startHalfW) * t);
    // perpendicular offset (radial direction IS the local normal for a curve
    // parameterized by angle around a fixed pivot, so no extra tangent math
    // is needed: offsetting r by +-halfW is already perpendicular to travel).
    innerPts.push(n2(polarX(cx, r - halfW, deg), polarY(cy, r - halfW, deg), m));
    outerPts.push(n2(polarX(cx, r + halfW, deg), polarY(cy, r + halfW, deg), m));
  }
  return `M ${innerPts.join(' L ')} L ${outerPts.reverse().join(' L ')} Z`;
}

/** A small almond-shaped leaf, its long axis tangent to the vine at `atDeg`
 * (the spiral's local direction of travel), so it reads as sprouting FROM the
 * curl rather than pasted at a random angle. */
function leafPath(
  cx: number,
  cy: number,
  len: number,
  width: number,
  rotateDeg: number,
  m: Mirror,
): string {
  const rad = (rotateDeg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const rot = (x: number, y: number): string => {
    const rx = x * cos - y * sin;
    const ry = x * sin + y * cos;
    return n2(cx + rx, cy + ry, m);
  };
  // Two quadratic curves from base to tip and back, bulging on each side:
  // a classic pointed-leaf/almond silhouette.
  return (
    `M ${rot(0, 0)} ` +
    `Q ${rot(len * 0.35, -width)} ${rot(len, 0)} ` +
    `Q ${rot(len * 0.35, width)} ${rot(0, 0)} Z`
  );
}

function diamondPathMirrored(
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  rotateDeg: number,
  m: Mirror,
): string {
  const rad = (rotateDeg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const pts = [
    [0, -ry],
    [rx, 0],
    [0, ry],
    [-rx, 0],
  ].map(([x, y]) => {
    const rx2 = x * cos - y * sin;
    const ry2 = x * sin + y * cos;
    return n2(cx + rx2, cy + ry2, m);
  });
  return `M ${pts[0]} L ${pts[1]} L ${pts[2]} L ${pts[3]} Z`;
}

function cornerMotifPath(m: Mirror): string {
  const inset = 5;
  const armLen = 30;
  const bracket = `M ${n2(inset, inset + armLen, m)} L ${n2(inset, inset, m)} L ${n2(inset + armLen, inset, m)}`;
  // A short second, inset arm: the layered-bracket look a carved corner frame
  // uses (two nested strokes), not a single line.
  const innerArmLen = 17;
  const innerInset = inset + 5.5;
  const innerBracket = `M ${n2(innerInset, innerInset + innerArmLen, m)} L ${n2(innerInset, innerInset, m)} L ${n2(innerInset + innerArmLen, innerInset, m)}`;

  const gemCx = inset + 9;
  const gemCy = inset + 9;
  const gem = diamondPathMirrored(gemCx, gemCy, 3.4, 3.4, 0, m);

  const tickLen = 8;
  const ticks = [24, 66].map((deg) => {
    const x1 = polarX(gemCx, 4.6, deg);
    const y1 = polarY(gemCy, 4.6, deg);
    const x2 = polarX(gemCx, 4.6 + tickLen, deg);
    const y2 = polarY(gemCy, 4.6 + tickLen, deg);
    return `M ${n2(x1, y1, m)} L ${n2(x2, y2, m)}`;
  });

  // The curling vines: pivoted at the gem, sweeping from near the top edge
  // (5deg) around past the diagonal bisector toward the left edge (85deg) --
  // strictly within [0, 90] so every sample keeps x >= gemCx and y >= gemCy,
  // safely on-canvas no matter how far the radius reaches (see
  // vineRibbonPath's contract). Each curls out to a peak radius then coils
  // back toward the pivot, the volute/fiddlehead read; a shorter second vine
  // nested just past the first gives a fuller layered-scrollwork look,
  // matching the reference's double curl rather than one bare comma.
  const vineA = vineRibbonPath(gemCx, gemCy, 5, 100, 6, 40, 22, 0.62, 4.8, 0.9, 301, m);
  const vineB = vineRibbonPath(gemCx, gemCy, 20, 95, 5, 26, 15, 0.68, 3.6, 0.7, 302, m);

  // Leaves sprout from points along vine A's outward (pre-peak) run, tangent
  // to its local travel direction (deg + 90 so the leaf's long axis points
  // outward from the curl, not along the ribbon itself).
  const leafSpecs = [
    { t: 0.3, len: 15, width: 6 },
    { t: 0.55, len: 11, width: 4.6 },
  ];
  const leaves = leafSpecs
    .map(({ t, len, width }) => {
      const deg = 5 + 95 * t;
      const r = 5 + (40 - 5) * (t / 0.62);
      const x = polarX(gemCx, r, deg);
      const y = polarY(gemCy, r, deg);
      return leafPath(x, y, len, width, deg - 90, m);
    })
    .join(' ');

  const strokes = `<path d="${bracket} ${innerBracket} ${ticks.join(' ')}" fill="none" stroke="#000" stroke-width="${CORNER_STROKE}" stroke-linecap="round" stroke-linejoin="round"/>`;
  const vines = `<path d="${vineA} ${vineB}"/>`;
  const leafFill = `<path d="${leaves}"/>`;
  const gemFill = `<path d="${gem}"/>`;
  return strokes + vines + leafFill + gemFill;
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
const EDGE_BASE_WIDTH = 4;
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
