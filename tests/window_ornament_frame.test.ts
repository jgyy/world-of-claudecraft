// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { syncWindowOrnamentFrame } from '../src/ui/window_ornament_frame';

// jsdom never lays out real geometry (getBoundingClientRect is always
// 0-sized), so this pins the CONTRACT syncWindowOrnamentFrame promises:
// pin the window first (so `position: fixed` resolves against the real
// viewport instead of a still-transformed .window, see the module's own
// header comment), then write the four frame custom properties in
// AUTHOR space (divided by the live UI zoom), never raw visual-space
// pixels, matching how .window's own style.left/top already work.
describe('syncWindowOrnamentFrame', () => {
  it('pins the window (converting its centering transform to explicit left/top) exactly once', () => {
    const el = document.createElement('div');
    const pinWindow = vi.fn();
    Object.defineProperty(el, 'getBoundingClientRect', {
      value: () => ({ left: 200, top: 100, width: 300, height: 150 }) as DOMRect,
    });
    syncWindowOrnamentFrame(el, { pinWindow, getScale: () => 1 });
    expect(pinWindow).toHaveBeenCalledTimes(1);
    expect(pinWindow).toHaveBeenCalledWith(el, expect.objectContaining({ left: 200, top: 100 }));
  });

  it('writes the frame custom properties from the post-pin rect', () => {
    const el = document.createElement('div');
    Object.defineProperty(el, 'getBoundingClientRect', {
      value: () => ({ left: 40, top: 20, width: 500, height: 260 }) as DOMRect,
    });
    syncWindowOrnamentFrame(el, { pinWindow: () => {}, getScale: () => 1 });
    expect(el.style.getPropertyValue('--win-frame-l')).toBe('40px');
    expect(el.style.getPropertyValue('--win-frame-t')).toBe('20px');
    expect(el.style.getPropertyValue('--win-frame-w')).toBe('500px');
    expect(el.style.getPropertyValue('--win-frame-h')).toBe('260px');
  });

  it('divides by the live UI zoom (author space, matching style.left/top)', () => {
    const el = document.createElement('div');
    Object.defineProperty(el, 'getBoundingClientRect', {
      value: () => ({ left: 100, top: 100, width: 200, height: 200 }) as DOMRect,
    });
    syncWindowOrnamentFrame(el, { pinWindow: () => {}, getScale: () => 2 });
    expect(el.style.getPropertyValue('--win-frame-l')).toBe('50px');
    expect(el.style.getPropertyValue('--win-frame-t')).toBe('50px');
    expect(el.style.getPropertyValue('--win-frame-w')).toBe('100px');
    expect(el.style.getPropertyValue('--win-frame-h')).toBe('100px');
  });

  it('falls back to a scale of 1 for a zero/undefined getScale (never divides by zero)', () => {
    const el = document.createElement('div');
    Object.defineProperty(el, 'getBoundingClientRect', {
      value: () => ({ left: 10, top: 10, width: 10, height: 10 }) as DOMRect,
    });
    syncWindowOrnamentFrame(el, { pinWindow: () => {}, getScale: () => 0 });
    expect(el.style.getPropertyValue('--win-frame-l')).toBe('10px');
  });
});
