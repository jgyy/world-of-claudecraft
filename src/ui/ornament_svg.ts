// Structural ornament shapes for HUD chrome: hand-authored / procedurally
// generated SVG masks for the "carved fantasy artifact" finish (window
// corners and tapered tops, unit-frame and minimap rings, panel/window
// title banners).
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

// ---------- twin ring: two thin concentric circles + 4 cardinal gems + 4 corner dots ----------

const RING_STROKE = 1.6;
const RING_GAP = 3.4;

/**
 * A detailed ring ornament: two thin concentric strokes with a small gap, a
 * diamond gem bridging the gap at each of the 4 cardinal points, and a small
 * dot at each of the 4 diagonal points, reading as a "detailed" jeweled ring
 * rather than a thick solid or wavy band. `outerR` is also used as the SVG's
 * center, so the shape is self-contained in a `2*outerR` square viewBox
 * regardless of where it is later mask-positioned.
 */
export function twinRingInner(outerR: number): string {
  const cx = outerR;
  const cy = outerR;
  const outerRingR = outerR - RING_STROKE / 2;
  const innerRingR = outerRingR - RING_STROKE - RING_GAP;
  const gemCenterR = outerRingR - RING_STROKE / 2 - RING_GAP / 2;
  const gemR = RING_STROKE + RING_GAP / 2 + 0.6;
  const dotR = 1.1;

  const outerCircle = `<circle cx="${n(cx)}" cy="${n(cy)}" r="${n(outerRingR)}" fill="none" stroke="#000" stroke-width="${RING_STROKE}"/>`;
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

  return outerCircle + innerCircle + gemPath + dots;
}

export function ringOrnamentMaskImage(outerR: number): string {
  return svgDataUri(twinRingInner(outerR), outerR * 2);
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
export const TITLE_BANNER_WIDTH = 220;
export const TITLE_BANNER_HEIGHT = 22;

/**
 * Sets the `--ornament-*` custom properties every ornamented chrome rule
 * consumes. Called once at game boot (main.ts, next to `hydrateIcons()`);
 * shapes are static, so this never needs to re-run on a theme switch.
 */
export function applyOrnamentVars(root: HTMLElement = document.documentElement): void {
  root.style.setProperty('--ornament-corner', cornerOrnamentMaskImage());
  root.style.setProperty('--ornament-ring-portrait', ringOrnamentMaskImage(PORTRAIT_RING_OUTER_R));
  root.style.setProperty('--ornament-ring-minimap', ringOrnamentMaskImage(MINIMAP_RING_OUTER_R));
  root.style.setProperty(
    '--ornament-banner',
    bannerOrnamentMaskImage(TITLE_BANNER_WIDTH, TITLE_BANNER_HEIGHT),
  );
  root.style.setProperty('--ornament-window-top', windowTopOrnamentMaskImage());
}
