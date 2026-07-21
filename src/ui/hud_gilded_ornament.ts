// Hand-gilded ornament for the broader HUD (minimap, player portrait, action
// bar, and other frames), reusing the exact techniques and exported shapes
// from perf_ornament_svg.ts (the Performance Overlay's original, narrower
// pilot): the same gilt-gradient color noise and baroque acanthus corner/
// mid-edge motifs. Per DESIGN.md principle 5 ("one system on every screen"),
// every consumer reuses the SAME generated shapes rather than each rolling
// its own; only the CSS mask-size/-position and ring width differ per target.

import {
  perfCornerOrnamentMaskImage,
  perfGiltGradientBackground,
  perfMidEdgeOrnamentMaskImage,
  perfNoisyEdgeMaskImage,
} from './perf_ornament_svg';

/**
 * Sets the shared --hud-gilt-* custom properties every broader-HUD ornament
 * consumer's CSS reads (hud.css: the minimap/portrait/action-bar gilt rings,
 * and the rectangular panel corner/mid-edge treatments). Called once at boot
 * next to applyPerfOrnamentVars(); shapes are static, so this never needs to
 * re-run on a theme switch.
 *
 * Distinct edge seeds (701-704) from the Performance Overlay's own (1-4):
 * continues that file's precedent of a dedicated seed range per consumer,
 * which works around the real Chromium bug documented there (a mask-image
 * list that repeats the identical url() value at two different mask-position
 * slots only paints the first occurrence) if these ever end up combined in
 * one list with the Performance Overlay's own edge tiles.
 */
export function applyHudGildedOrnamentVars(root: HTMLElement = document.documentElement): void {
  root.style.setProperty('--hud-gilt', perfGiltGradientBackground());
  root.style.setProperty('--hud-ornament-corner', perfCornerOrnamentMaskImage());
  root.style.setProperty('--hud-ornament-mid-edge', perfMidEdgeOrnamentMaskImage());
  root.style.setProperty('--hud-ornament-edge-top', perfNoisyEdgeMaskImage(701, false));
  root.style.setProperty('--hud-ornament-edge-bottom', perfNoisyEdgeMaskImage(703, false));
  root.style.setProperty('--hud-ornament-edge-left', perfNoisyEdgeMaskImage(702, true));
  root.style.setProperty('--hud-ornament-edge-right', perfNoisyEdgeMaskImage(704, true));
}
