import { describe, expect, it } from 'vitest';
import {
  shouldEngagePointerLock,
  shouldReleasePointerLock,
  shouldRequestDragLock,
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

  it('does not engage in fullscreen (Chrome shows its own unavoidable prompt)', () => {
    expect(
      shouldEngagePointerLock({ lockOnRotate: true, isFullscreen: true, alreadyLocked: false }),
    ).toBe(false);
  });

  it('does not re-engage when already locked (avoids re-showing the browser banner mid-drag)', () => {
    expect(
      shouldEngagePointerLock({ lockOnRotate: true, isFullscreen: false, alreadyLocked: true }),
    ).toBe(false);
  });
});

describe('shouldRequestDragLock', () => {
  const base = {
    dragActive: true,
    lockOnRotate: true,
    isFullscreen: false,
    alreadyLocked: false,
    requestPending: false,
  };

  it('requests when a drag is active, the setting is on, not locked, nothing pending', () => {
    expect(shouldRequestDragLock(base)).toBe(true);
  });

  it('retries on a later move after a prior request FAILED (this is the dual-monitor fix)', () => {
    // First request rejected (e.g. Chrome post-exit cooldown): pending cleared,
    // still not locked, drag continuing. The next move must re-request rather
    // than leaving the cursor free to slip onto a second monitor.
    expect(shouldRequestDragLock({ ...base, requestPending: false, alreadyLocked: false })).toBe(
      true,
    );
  });

  it('does not request while a request is still in flight (no spamming)', () => {
    expect(shouldRequestDragLock({ ...base, requestPending: true })).toBe(false);
  });

  it('does not request once the lock is held', () => {
    expect(shouldRequestDragLock({ ...base, alreadyLocked: true })).toBe(false);
  });

  it('does not request when no drag is active', () => {
    expect(shouldRequestDragLock({ ...base, dragActive: false })).toBe(false);
  });

  it('respects the setting being off and fullscreen', () => {
    expect(shouldRequestDragLock({ ...base, lockOnRotate: false })).toBe(false);
    expect(shouldRequestDragLock({ ...base, isFullscreen: true })).toBe(false);
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
