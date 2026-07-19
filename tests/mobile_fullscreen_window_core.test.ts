import { describe, expect, it } from 'vitest';
import { isMobileFullscreenWindowOpen } from '../src/ui/mobile_fullscreen_window_core';

describe('isMobileFullscreenWindowOpen', () => {
  it('is false when neither bags nor the character sheet is open', () => {
    expect(isMobileFullscreenWindowOpen(false, false, false)).toBe(false);
  });

  it('is true while bags alone is open, standalone', () => {
    expect(isMobileFullscreenWindowOpen(true, false, false)).toBe(true);
  });

  it('is true while the character sheet alone is open, standalone', () => {
    expect(isMobileFullscreenWindowOpen(false, true, false)).toBe(true);
  });

  it('is true while both are open outside a paired cluster', () => {
    expect(isMobileFullscreenWindowOpen(true, true, false)).toBe(true);
  });

  it('is false while bags is docked in the char-bags-paired cluster', () => {
    expect(isMobileFullscreenWindowOpen(true, true, true)).toBe(false);
  });

  it('is false while bags is docked alongside an open vendor', () => {
    expect(isMobileFullscreenWindowOpen(true, false, true)).toBe(false);
  });

  it('is false while bags is docked alongside an open bank', () => {
    expect(isMobileFullscreenWindowOpen(true, false, true)).toBe(false);
  });
});
