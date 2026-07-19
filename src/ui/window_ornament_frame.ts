// Keeps the gilded corner/edge ornament (`.window.panel::before` / `::after`
// in src/styles/layout.css, shapes from ornament_svg.ts) pinned to a window's
// VISIBLE rect instead of scrolling away with the window's own
// `overflow-y: auto` content.
//
// Root cause: those pseudo-elements are descendants whose containing block is
// `.window`'s own padding box. An absolutely (or fixed, under a transformed
// ancestor -- see below) positioned descendant of a scroll container is part
// of that container's scrollable region, so its `inset: 0` position is
// anchored to the UNSCROLLED origin and it slides out of view exactly like a
// normal in-flow child would (the same class of bug the
// `.window.window-resizable` grip comment in layout.css already documents,
// which is why that grip is a background layer on `.window` itself instead
// of a pseudo-element).
//
// The corner/edge ornament can't use that background-layer trick directly
// (it needs an independent `mask-image` shape over the shared `.panel`
// background, and CSS masks apply to an element's ENTIRE paint, so masking
// `.window` itself would clip its real content to the ornament's shape).
// Instead this module switches those pseudo-elements to `position: fixed`
// and keeps them sized/positioned via CSS custom properties this module
// writes, refreshed only on open/move/resize (never per scroll or per
// frame, so it stays outside the per-frame perf budget).
//
// `position: fixed` only escapes an ancestor's scroll region if that
// ancestor is NOT itself a containing block for fixed descendants --
// `transform` (and `will-change: transform`, `filter`, etc.) creates one,
// and `.window` centers itself via `transform: translateX(-50%)` until
// moved. So `syncWindowOrnamentFrame` also pins the window to explicit
// left/top (transform: none) on every sync, exactly like
// window_resize.ts / window_drag.ts already do on the first drag or
// resize, and marks it as moved so the existing viewport-resize re-clamp
// (Hud's `resize` listener) keeps it on-screen afterward.

export interface WindowOrnamentFrameDeps {
  /** Same contract as WindowResizeDeps.pinWindow: converts the window's
   *  centering transform into pixel left/top so `position: fixed`
   *  descendants resolve against the real viewport, not `.window` itself. */
  pinWindow(el: HTMLElement, rect: DOMRect): void;
  /** Live UI zoom factor (`--ui-scale`, applied as `zoom` on `#ui`): the
   *  frame custom properties are authored in the SAME pre-zoom space as
   *  `.window`'s own `style.left/top`, so the browser's zoom re-multiplies
   *  them back to the correct on-screen size instead of double-scaling. */
  getScale(): number;
}

const FRAME_LEFT = '--win-frame-l';
const FRAME_TOP = '--win-frame-t';
const FRAME_WIDTH = '--win-frame-w';
const FRAME_HEIGHT = '--win-frame-h';

/**
 * Re-measures one window and writes its viewport rect into the frame custom
 * properties `.window.panel::before` / `::after` (layout.css) read. Call on
 * open, on drag/resize commit, and on viewport resize -- anywhere the
 * window's on-screen rect can change; never on internal scroll (the whole
 * point is that scroll no longer needs to touch this).
 */
export function syncWindowOrnamentFrame(el: HTMLElement, deps: WindowOrnamentFrameDeps): void {
  deps.pinWindow(el, el.getBoundingClientRect());
  const rect = el.getBoundingClientRect();
  const z = deps.getScale() || 1;
  el.style.setProperty(FRAME_LEFT, `${rect.left / z}px`);
  el.style.setProperty(FRAME_TOP, `${rect.top / z}px`);
  el.style.setProperty(FRAME_WIDTH, `${rect.width / z}px`);
  el.style.setProperty(FRAME_HEIGHT, `${rect.height / z}px`);
}
