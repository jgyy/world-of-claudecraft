import { describe, expect, it } from 'vitest';
import { isMobileFullscreenWindowOpen } from '../src/ui/mobile_fullscreen_window_core';

describe('isMobileFullscreenWindowOpen', () => {
  it('is false when neither bags nor the character sheet is open', () => {
    expect(isMobileFullscreenWindowOpen(false, false)).toBe(false);
  });

  it('is true while bags alone is open', () => {
    expect(isMobileFullscreenWindowOpen(true, false)).toBe(true);
  });

  it('is true while the character sheet alone is open', () => {
    expect(isMobileFullscreenWindowOpen(false, true)).toBe(true);
  });

  it('is true while both are open (char-bags-paired)', () => {
    expect(isMobileFullscreenWindowOpen(true, true)).toBe(true);
  });
});
