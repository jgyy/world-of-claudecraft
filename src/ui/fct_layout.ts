// Floating-combat-text anti-overlap placement.
//
// When several combat events resolve at the same world anchor in a short window
// (a dense elite pack like the Thornpeak Crushers, where a wall of "MISS" can fire
// across one tick), their floating texts all spawn at the same screen point and pile
// into an illegible stack. This pure core decides a vertical row offset that keeps
// recent texts in the same screen column from colliding; the HUD is the thin consumer
// that records each placement and prunes expired ones (see hud.ts `fct`).
//
// Pure and DOM-free so a Vitest can drive it directly (tests/fct_layout.test.ts).

export interface FctEntry {
  /** Screen x (author-space px) of an already-placed, still-live text. */
  x: number;
  /** Screen y (author-space px) it was placed at. */
  y: number;
  /** Clock ms when it was placed. */
  bornMs: number;
}

export interface FctPlaceOptions {
  /** Vertical gap between stacked rows, px. */
  rowHeight?: number;
  /** Two texts share a column when their x differ by less than this, px. */
  columnWidth?: number;
  /** How long a text stays on screen, ms (matches the consumer's removal timeout). */
  lifeMs?: number;
  /** Maximum rows to stack before giving up and reusing the anchor row. */
  maxRows?: number;
}

const DEFAULTS: Required<FctPlaceOptions> = {
  rowHeight: 22,
  columnWidth: 44,
  lifeMs: 1250,
  maxRows: 6,
};

/**
 * Choose a y for a new floating text at (anchorX, anchorY) that does not collide with
 * recent texts in the same column. Texts stack upward (decreasing y), taking the
 * lowest free row. x is unchanged. Returns the chosen y.
 */
export function placeFctY(
  existing: readonly FctEntry[],
  anchorX: number,
  anchorY: number,
  nowMs: number,
  options: FctPlaceOptions = {},
): number {
  const { rowHeight, columnWidth, lifeMs, maxRows } = { ...DEFAULTS, ...options };
  // Only live texts in the same column can collide.
  const column = existing.filter(
    (e) => nowMs - e.bornMs < lifeMs && Math.abs(e.x - anchorX) < columnWidth,
  );
  // Walk rows upward from the anchor; take the first whose row is free.
  for (let row = 0; row < maxRows; row++) {
    const y = anchorY - row * rowHeight;
    const occupied = column.some((e) => Math.abs(e.y - y) < rowHeight);
    if (!occupied) return y;
  }
  // Every row is busy: fall back to the anchor. Rare, and better than scrolling a
  // text off the top of the screen.
  return anchorY;
}
