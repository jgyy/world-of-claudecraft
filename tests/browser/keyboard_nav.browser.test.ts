// P15b keyboard-navigation E2E over the REAL P15a focus manager (src/ui/focus_manager.ts),
// run in a real browser so synthetic Tab keydowns drive the actual document-level trap. It
// proves the three properties the phase requires of an open window:
//   - focus-first on open lands on the first interactive, SKIPPING the close (X) button;
//   - Tab / Shift+Tab cycle WITHIN the window (including the close button) and never escape;
//   - the close path (release(true), which the Esc -> closeAll -> windowFocus.restoreFocus
//     route ends in) returns focus to the opener;
//   - and the gameplay guard: Tab is NOT trapped while focus is OUTSIDE the window, so the
//     game's Tab-target-nearest-enemy key still works when no modal owns focus.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { FocusManager } from '../../src/ui/focus_manager';
import { cleanup, host } from './_harness';

afterEach(cleanup);

function buildWindow(): {
  root: HTMLElement;
  opener: HTMLElement;
  close: HTMLElement;
  btns: HTMLElement[];
} {
  const opener = document.createElement('button');
  opener.id = 'kbd-opener';
  opener.textContent = 'open';
  document.body.appendChild(opener);
  const root = host('kbd-window');
  root.style.display = 'block';
  // DOM order: the close (X) button first, then two ordinary controls. The full Tab cycle
  // INCLUDES [data-close]; focus-first SKIPS it (the P15a re-audit fix).
  const close = document.createElement('button');
  close.setAttribute('data-close', '');
  close.setAttribute('aria-label', 'Close');
  close.textContent = 'X';
  const a = document.createElement('button');
  a.textContent = 'A';
  const b = document.createElement('button');
  b.textContent = 'B';
  root.append(close, a, b);
  return { root, opener, close, btns: [a, b] };
}

function pressTab(shift = false): KeyboardEvent {
  const ev = new KeyboardEvent('keydown', {
    key: 'Tab',
    shiftKey: shift,
    bubbles: true,
    cancelable: true,
  });
  document.dispatchEvent(ev);
  return ev;
}

describe('keyboard-nav: the P15a focus trap (trap + focus-first + return)', () => {
  it('focusFirst lands on the first interactive, skipping the close (X) button', async () => {
    const { root, opener, btns } = buildWindow();
    opener.focus();
    const fm = new FocusManager();
    const handle = fm.open({ root: () => root, returnFocusTo: opener });
    handle.focusFirst(); // the manager defers the focus a tick (setTimeout 0)
    await vi.waitFor(() => expect(document.activeElement).toBe(btns[0]));
    handle.release(false);
  });

  it('Tab / Shift+Tab cycle within the window and never escape', () => {
    const { root, close, btns } = buildWindow();
    const fm = new FocusManager();
    const handle = fm.open({ root: () => root, returnFocusTo: null });
    // From the LAST focusable, Tab wraps to the FIRST in the cycle (the close button).
    btns[1].focus();
    const fwd = pressTab();
    expect(fwd.defaultPrevented).toBe(true);
    expect(root.contains(document.activeElement)).toBe(true);
    expect(document.activeElement).toBe(close);
    // From the FIRST, Shift+Tab wraps to the LAST.
    close.focus();
    const back = pressTab(true);
    expect(back.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(btns[1]);
    handle.release(false);
  });

  it('the close path (release with returnFocus) restores focus to the opener', async () => {
    const { root, opener, btns } = buildWindow();
    opener.focus();
    const fm = new FocusManager();
    const handle = fm.open({ root: () => root, returnFocusTo: opener });
    handle.focusFirst(); // deferred a tick
    await vi.waitFor(() => expect(document.activeElement).toBe(btns[0]));
    handle.release(true);
    // The manager defers the restore a tick (setTimeout 0) as well.
    await vi.waitFor(() => expect(document.activeElement).toBe(opener));
  });

  it('does NOT trap Tab while focus is outside the window (world Tab-target preserved)', () => {
    const { root, opener } = buildWindow();
    const fm = new FocusManager();
    const handle = fm.open({ root: () => root, returnFocusTo: opener });
    opener.focus(); // outside the trapped root
    const ev = pressTab();
    // The trap intercepts Tab ONLY when the root contains the active element, so here it must
    // pass the key through (defaultPrevented stays false) and the game keeps Tab-targeting.
    expect(ev.defaultPrevented).toBe(false);
    handle.release(false);
  });
});
