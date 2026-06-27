// Touch long-press gesture for opening the player context menu on devices that
// have no right-click.
//
// On desktop every player-interaction menu (party-invite, add-friend, whisper,
// trade, duel, report) opens from a `contextmenu` (right-click) event. Touch
// devices never fire that, so phone players had no way to reach those actions
// from the target frame or party frames. This module mirrors the long-press
// pattern the HUD already uses for tooltips (see `touch_peek.ts`): a press held
// past `LONG_PRESS_MS` without dragging beyond a slop radius opens the menu.
//
// The pure pieces (`movedBeyondSlop`, `LongPressClickGuard`) are unit-tested;
// `attachLongPress` is the thin DOM consumer the HUD wires onto a frame.

/** Hold (ms) before a touch press is treated as a context-menu long-press. */
export const LONG_PRESS_MS = 500;

/** Finger travel (px) that cancels a pending long-press as a drag, not a hold. */
export const LONG_PRESS_SLOP_PX = 10;

export interface PressPoint {
  x: number;
  y: number;
}

/**
 * True when the finger has moved far enough from where it pressed that the
 * gesture is a drag (scroll/pan), not a stationary hold, and any pending
 * long-press should be cancelled. Uses squared distance to avoid a sqrt.
 */
export function movedBeyondSlop(
  start: PressPoint,
  current: PressPoint,
  slop: number = LONG_PRESS_SLOP_PX,
): boolean {
  const dx = current.x - start.x;
  const dy = current.y - start.y;
  return dx * dx + dy * dy > slop * slop;
}

/**
 * Suppresses the synthetic `click` that a browser fires when a finger lifts off
 * a long-press, so the hold opens the menu instead of also triggering the
 * element's tap action (e.g. retargeting a party member). Parallel in spirit to
 * `TouchPeekGuard` but for menu-opening rather than tooltip-peeking.
 */
export class LongPressClickGuard {
  private armed = false;

  /** A long-press just fired; the next click is its release and must be eaten. */
  arm(): void {
    this.armed = true;
  }

  /** A fresh press began; clear any stale arm so a real quick tap activates. */
  reset(): void {
    this.armed = false;
  }

  /**
   * Called from the `click` that follows a release. Returns true when that click
   * is the tail of a long-press and the element's tap action should be
   * SUPPRESSED. Consuming clears the guard so the next quick tap activates.
   */
  consume(): boolean {
    const wasArmed = this.armed;
    this.armed = false;
    return wasArmed;
  }
}

/**
 * Wire a touch long-press on `el` to `onLongPress(x, y)`. No-op for mouse/pen
 * input (desktop keeps its `contextmenu` handler) and when `isTouch()` is false,
 * so the same call site stays correct on every host. The follow-up click is
 * swallowed in the capture phase so a frame's own tap handler (targeting) does
 * not also fire after the menu opens.
 */
export function attachLongPress(
  el: HTMLElement,
  onLongPress: (x: number, y: number) => void,
  isTouch: () => boolean,
): void {
  let timer: number | undefined;
  let start: PressPoint | null = null;
  const guard = new LongPressClickGuard();

  const clear = (): void => {
    if (timer !== undefined) window.clearTimeout(timer);
    timer = undefined;
    start = null;
  };

  el.addEventListener('pointerdown', (e) => {
    if (!isTouch() || e.pointerType === 'mouse') return;
    clear();
    guard.reset();
    start = { x: e.clientX, y: e.clientY };
    const x = e.clientX;
    const y = e.clientY;
    timer = window.setTimeout(() => {
      timer = undefined;
      guard.arm();
      onLongPress(x, y);
    }, LONG_PRESS_MS);
  });
  el.addEventListener('pointermove', (e) => {
    if (start && movedBeyondSlop(start, { x: e.clientX, y: e.clientY })) clear();
  });
  el.addEventListener('pointerup', clear);
  el.addEventListener('pointercancel', clear);
  // Capture phase: decide before the element's own bubble-phase click runs.
  el.addEventListener(
    'click',
    (e) => {
      if (guard.consume()) {
        e.preventDefault();
        // stopImmediatePropagation (not just stopPropagation) so a tap action
        // registered on the SAME element (e.g. a party frame's click-to-target)
        // is suppressed too; capture/bubble order does not separate same-element
        // listeners, so this guard must be attached before that handler.
        e.stopImmediatePropagation();
      }
    },
    true,
  );
}
