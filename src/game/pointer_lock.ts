// Pure decision logic for engaging/releasing the pointer lock used by mouse
// camera rotation. Kept DOM-free so it unit-tests in isolation (the same
// pattern as click_move.ts / pointer_pick.ts).
//
// Why this exists: camera rotation integrates relative mouse deltas
// (movementX/movementY). Without pointer lock the OS cursor is free to leave
// the window, so it hits the monitor edge (movementX clamps to 0, the camera
// freezes) or slips onto a second display. Locking the pointer while a drag is
// active keeps every delta flowing and the cursor pinned to the canvas.

export interface PointerLockEngageInput {
  /** The "Lock cursor while rotating" setting (default on). */
  lockOnRotate: boolean;
  /**
   * Browser fullscreen. Kept in the input shape so callers/tests can assert
   * that fullscreen follows the same lock path as windowed play.
   */
  isFullscreen: boolean;
  /** Whether the canvas already holds the pointer lock. */
  alreadyLocked: boolean;
}

/**
 * True when a newly-active camera drag should request pointer lock. Applies to
 * both camera modes (classic right-drag and OSRS-style Mouse Camera): the only
 * reasons to skip are the setting being off or the canvas already holding lock.
 */
export function shouldEngagePointerLock(input: PointerLockEngageInput): boolean {
  return input.lockOnRotate && !input.alreadyLocked;
}

/**
 * Firefox denies `Element.requestPointerLock()` unless the call happens
 * synchronously inside the handler for the genuine user gesture itself
 * (mousedown), not a later `mousemove` once a drag threshold is crossed, even
 * though that `mousemove` still fires within the lingering "transient
 * activation" window a mousedown grants. Its own error message says so
 * verbatim: "was not called from inside a short running user-generated event
 * handler, and the document is not in full screen." Chromium is lenient here
 * (it happily consumes the lingering activation from the deferred call), so
 * only Firefox needs the synchronous-on-mousedown path.
 */
export function pointerLockNeedsSyncGesture(userAgent: string): boolean {
  return /firefox/i.test(userAgent);
}

export interface PointerLockMouseDownInput {
  /** The button that was just pressed. */
  button: number;
  /** The button that starts a camera drag in the active camera mode. */
  cameraLookButton: number;
  /** From {@link pointerLockNeedsSyncGesture}. */
  needsSyncGesture: boolean;
  /** The "Lock cursor while rotating" setting (default on). */
  lockOnRotate: boolean;
  /** Whether the canvas already holds the pointer lock. */
  alreadyLocked: boolean;
}

/**
 * True when pointer lock should be requested synchronously from the mousedown
 * handler itself, ahead of any drag-threshold check. Only applies on browsers
 * that require the call to happen inside the original gesture handler
 * ({@link pointerLockNeedsSyncGesture}), and only for the button that can
 * start a camera drag in the current camera mode: requesting it for the
 * click-to-move button too would fire the lock on every ordinary click.
 * A press that turns out to be a plain click still releases the lock on
 * mouseup via {@link shouldReleasePointerLock}.
 */
export function shouldEngagePointerLockOnMouseDown(input: PointerLockMouseDownInput): boolean {
  return (
    input.needsSyncGesture &&
    input.button === input.cameraLookButton &&
    input.lockOnRotate &&
    !input.alreadyLocked
  );
}

export interface PointerLockReleaseInput {
  /** Any camera-rotation mouse button still held. */
  anyButtonDown: boolean;
  /** Whether the canvas currently holds the pointer lock. */
  hasLock: boolean;
}

/**
 * True when the pointer lock should be released: the drag has ended (no button
 * held) and we still hold the lock. Releasing here returns the OS cursor
 * between drags so target/loot/UI clicking is unaffected.
 */
export function shouldReleasePointerLock(input: PointerLockReleaseInput): boolean {
  return !input.anyButtonDown && input.hasLock;
}
