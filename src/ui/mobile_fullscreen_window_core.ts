// Pure visibility decision for whether the mobile bottom action bar (the
// player frame / petbar / meters stack docked under #bottom-bar) is safe to
// hide entirely. Only windows that are documented and CSS-verified to cover
// the ENTIRE mobile viewport (src/styles/hud.mobile.css: bags reserves just
// the 10px safe margin on every edge, char-window pins inset 0) qualify:
// hiding the frame there was already an accepted tradeoff before this rule
// existed (see the "Covering the frame is fine here" comments in
// hud.mobile.css) because nothing behind them is reachable or visible anyway.
// Every other game window (loot, lockpick, delve-rite, loot-settings, map,
// quest-log, vendor, ...) only pins its edges/top on touch and leaves real
// screen visible below, so hiding the frame there would hide HP/resource
// while combat continues, which the CLAUDE.md graphics-fairness invariant
// forbids. Hud owns the DOM class toggle; this core keeps the decision
// independently testable.

export function isMobileFullscreenWindowOpen(
  bagsVisible: boolean,
  charWindowVisible: boolean,
): boolean {
  return bagsVisible || charWindowVisible;
}
