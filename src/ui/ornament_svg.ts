// Structural ornament shapes for HUD chrome: hand-authored / procedurally
// generated SVG masks for the "carved fantasy artifact" finish (panel
// corners, unit-frame and minimap rings, panel/window title banners).
//
// These are never inserted into the DOM (contrast with the `svgIcon` glyphs
// in ui_icons.ts, which ARE inline <svg> elements). An ornament shape is pure
// SHAPE data with no fill/color baked in: it is consumed exclusively as a CSS
// `mask-image`, so the element's own `background` (almost always `var(--border)`
// or `var(--gold)`) supplies the visible color and the ornament repaints for
// free on every theme preset, exactly like the existing `.tf-move-btn::before`
// mask icon in hud.css. One shape -> one role, reused everywhere it applies
// (the corner motif is the same primitive on `.panel` and `.action-btn`, just
// mask-sized smaller).
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

function svgDataUri(inner: string, viewBoxSize: number): string {
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 ${viewBoxSize} ${viewBoxSize}'>${inner}</svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}

// ---------- corner motif: bracket + gem + two flaring ticks, anchored top-left ----------

const CORNER_SIZE = 32;

function cornerMotifPath(): string {
  const inset = 3;
  const armLen = 12;
  const bracket = `M ${n(inset)} ${n(inset + armLen)} L ${n(inset)} ${n(inset)} L ${n(inset + armLen)} ${n(inset)}`;

  const gemCx = inset + 5.5;
  const gemCy = inset + 5.5;
  const gemR = 3.2;
  const gem = `M ${n(gemCx)} ${n(gemCy - gemR)} L ${n(gemCx + gemR)} ${n(gemCy)} L ${n(gemCx)} ${n(gemCy + gemR)} L ${n(gemCx - gemR)} ${n(gemCy)} Z`;

  const tickLen = 5;
  const ticks = [24, 66].map((deg) => {
    const x1 = polarX(gemCx, gemR + 0.6, deg);
    const y1 = polarY(gemCy, gemR + 0.6, deg);
    const x2 = polarX(gemCx, gemR + 0.6 + tickLen, deg);
    const y2 = polarY(gemCy, gemR + 0.6 + tickLen, deg);
    return `M ${n(x1)} ${n(y1)} L ${n(x2)} ${n(y2)}`;
  });

  const strokes = `<path d="${bracket} ${ticks.join(' ')}" fill="none" stroke="#000" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"/>`;
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

// ---------- rope-twist ring: a braided annulus for portrait/minimap rings ----------

const RING_SAMPLES = 96;

/**
 * A closed annulus whose outer and inner edges wobble in a sinusoid (opposite
 * phase), reading as a twisted-rope band at HUD sizes. `outerR` is also used
 * as the SVG's center, so the shape is self-contained in a `2*outerR` square
 * viewBox regardless of where it is later mask-positioned.
 */
export function ropeRingPath(outerR: number, bandWidth: number, twists = 14, amp = 1.4): string {
  const cx = outerR;
  const cy = outerR;
  const innerR = outerR - bandWidth;
  const outerPts: string[] = [];
  const innerPts: string[] = [];
  for (let i = 0; i < RING_SAMPLES; i++) {
    const deg = (360 * i) / RING_SAMPLES;
    const rad = (deg * Math.PI) / 180;
    const wobble = amp * Math.sin(twists * rad);
    const or = outerR + wobble;
    const ir = innerR - wobble;
    outerPts.push(`${n(polarX(cx, or, deg))} ${n(polarY(cy, or, deg))}`);
    innerPts.push(`${n(polarX(cx, ir, deg))} ${n(polarY(cy, ir, deg))}`);
  }
  const outerPath = `M ${outerPts.join(' L ')} Z`;
  const innerPath = `M ${innerPts.reverse().join(' L ')} Z`;
  return `${outerPath} ${innerPath}`;
}

export function ringOrnamentMaskImage(outerR: number, bandWidth: number): string {
  const d = ropeRingPath(outerR, bandWidth);
  const inner = `<path d="${d}" fill-rule="evenodd"/>`;
  return svgDataUri(inner, outerR * 2);
}

// ---------- title banner: a pointed-end ribbon scroll for panel/window titles ----------

export function bannerScrollPath(width: number, height: number): string {
  const tailW = height * 0.55;
  const furlR = height * 0.14;
  const body = `M 0 ${n(height / 2)} L ${n(tailW)} 0 L ${n(width - tailW)} 0 L ${n(width)} ${n(height / 2)} L ${n(width - tailW)} ${n(height)} L ${n(tailW)} ${n(height)} Z`;
  const leftFurl = `M ${n(furlR)} ${n(height / 2 - furlR)} A ${n(furlR)} ${n(furlR)} 0 1 0 ${n(furlR)} ${n(height / 2 + furlR)} A ${n(furlR)} ${n(furlR)} 0 1 0 ${n(furlR)} ${n(height / 2 - furlR)} Z`;
  const rightFurl = `M ${n(width - furlR)} ${n(height / 2 - furlR)} A ${n(furlR)} ${n(furlR)} 0 1 0 ${n(width - furlR)} ${n(height / 2 + furlR)} A ${n(furlR)} ${n(furlR)} 0 1 0 ${n(width - furlR)} ${n(height / 2 - furlR)} Z`;
  return `${body} ${leftFurl} ${rightFurl}`;
}

export function bannerOrnamentMaskImage(width: number, height: number): string {
  const d = bannerScrollPath(width, height);
  const inner = `<path d="${d}"/>`;
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 ${width} ${height}'>${inner}</svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}

// ---------- boot wiring ----------

/** Reference sizes for the ring ornament at its two call sites (unit-frame portrait, minimap disc). */
export const PORTRAIT_RING_OUTER_R = 36;
export const PORTRAIT_RING_BAND = 4.5;
export const MINIMAP_RING_OUTER_R = 92;
export const MINIMAP_RING_BAND = 7;
export const TITLE_BANNER_WIDTH = 220;
export const TITLE_BANNER_HEIGHT = 22;

/**
 * Sets the `--ornament-*` custom properties every ornamented chrome rule
 * consumes. Called once at game boot (main.ts, next to `hydrateIcons()`);
 * shapes are static, so this never needs to re-run on a theme switch.
 */
export function applyOrnamentVars(root: HTMLElement = document.documentElement): void {
  root.style.setProperty('--ornament-corner', cornerOrnamentMaskImage());
  root.style.setProperty(
    '--ornament-ring-portrait',
    ringOrnamentMaskImage(PORTRAIT_RING_OUTER_R, PORTRAIT_RING_BAND),
  );
  root.style.setProperty(
    '--ornament-ring-minimap',
    ringOrnamentMaskImage(MINIMAP_RING_OUTER_R, MINIMAP_RING_BAND),
  );
  root.style.setProperty(
    '--ornament-banner',
    bannerOrnamentMaskImage(TITLE_BANNER_WIDTH, TITLE_BANNER_HEIGHT),
  );
}
