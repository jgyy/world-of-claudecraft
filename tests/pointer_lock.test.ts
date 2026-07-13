import { describe, expect, it } from 'vitest';
import {
  pointerLockNeedsSyncGesture,
  shouldEngagePointerLock,
  shouldEngagePointerLockOnMouseDown,
  shouldReleasePointerLock,
} from '../src/game/pointer_lock';

describe('shouldEngagePointerLock', () => {
  it('engages when a drag starts, the setting is on, not fullscreen, not yet locked', () => {
    expect(
      shouldEngagePointerLock({ lockOnRotate: true, isFullscreen: false, alreadyLocked: false }),
    ).toBe(true);
  });

  it('engages regardless of camera mode (the function takes no mode: both classic and Mouse Camera reach here)', () => {
    // Regression for the reported bug: in Mouse Camera mode the lock was never
    // requested, so the cursor escaped to the screen edge / second monitor.
    // The decision must not depend on the mode at all.
    expect(
      shouldEngagePointerLock({ lockOnRotate: true, isFullscreen: false, alreadyLocked: false }),
    ).toBe(true);
  });

  it('does not engage when the setting is off', () => {
    expect(
      shouldEngagePointerLock({ lockOnRotate: false, isFullscreen: false, alreadyLocked: false }),
    ).toBe(false);
  });

  it('engages in fullscreen so mouselook still gets relative mouse deltas', () => {
    expect(
      shouldEngagePointerLock({ lockOnRotate: true, isFullscreen: true, alreadyLocked: false }),
    ).toBe(true);
  });

  it('does not re-engage when already locked (avoids re-showing the browser banner mid-drag)', () => {
    expect(
      shouldEngagePointerLock({ lockOnRotate: true, isFullscreen: false, alreadyLocked: true }),
    ).toBe(false);
  });
});

describe('shouldReleasePointerLock', () => {
  it('releases when no button is held and a lock is active', () => {
    expect(shouldReleasePointerLock({ anyButtonDown: false, hasLock: true })).toBe(true);
  });

  it('keeps the lock while a camera button is still held (so a continuous drag never escapes)', () => {
    expect(shouldReleasePointerLock({ anyButtonDown: true, hasLock: true })).toBe(false);
  });

  it('does nothing when there is no lock to release', () => {
    expect(shouldReleasePointerLock({ anyButtonDown: false, hasLock: false })).toBe(false);
  });
});

describe('pointerLockNeedsSyncGesture', () => {
  it('is true on Firefox user agents', () => {
    expect(
      pointerLockNeedsSyncGesture(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:128.0) Gecko/20100101 Firefox/128.0',
      ),
    ).toBe(true);
  });

  it('is false on Chromium user agents (deferred mousemove request works there)', () => {
    expect(
      pointerLockNeedsSyncGesture(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
      ),
    ).toBe(false);
  });

  it('is false on Safari user agents', () => {
    expect(
      pointerLockNeedsSyncGesture(
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15',
      ),
    ).toBe(false);
  });
});

describe('shouldEngagePointerLockOnMouseDown', () => {
  const base = {
    button: 2,
    cameraLookButton: 2,
    needsSyncGesture: true,
    lockOnRotate: true,
    alreadyLocked: false,
  };

  it('engages synchronously on mousedown for the camera-look button when the browser needs it', () => {
    expect(shouldEngagePointerLockOnMouseDown(base)).toBe(true);
  });

  it('does not engage when the browser does not need a synchronous gesture (Chromium keeps the deferred path)', () => {
    expect(shouldEngagePointerLockOnMouseDown({ ...base, needsSyncGesture: false })).toBe(false);
  });

  it('does not engage for the click-to-move button, only the camera-look button', () => {
    // Regression: syncing on every mousedown would fire the lock on every
    // ordinary click-to-move click, not just camera drags.
    expect(shouldEngagePointerLockOnMouseDown({ ...base, button: 0, cameraLookButton: 2 })).toBe(
      false,
    );
  });

  it('follows the camera-look button in Mouse Camera mode (button 0 there)', () => {
    expect(shouldEngagePointerLockOnMouseDown({ ...base, button: 0, cameraLookButton: 0 })).toBe(
      true,
    );
  });

  it('does not engage when the setting is off', () => {
    expect(shouldEngagePointerLockOnMouseDown({ ...base, lockOnRotate: false })).toBe(false);
  });

  it('does not re-engage when already locked', () => {
    expect(shouldEngagePointerLockOnMouseDown({ ...base, alreadyLocked: true })).toBe(false);
  });
});
