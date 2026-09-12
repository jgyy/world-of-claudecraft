// The Hide Interface toggle core (src/ui/interface_visibility_core.ts) and its
// body-class painter (interface_visibility_painter.ts).
import { describe, expect, it, vi } from 'vitest';
import {
  dispatchInterfaceVisibilityAction,
  HIDE_INTERFACE_ACTION,
  INTERFACE_HIDDEN_CLASS,
  InterfaceVisibility,
} from '../src/ui/interface_visibility_core';
import { createInterfaceVisibility } from '../src/ui/interface_visibility_painter';

describe('InterfaceVisibility', () => {
  it('starts shown, toggles, and reports only real changes', () => {
    const changes: boolean[] = [];
    const v = new InterfaceVisibility((h) => changes.push(h));
    expect(v.hidden).toBe(false);
    expect(v.toggle()).toBe(true);
    expect(v.hidden).toBe(true);
    expect(v.toggle()).toBe(false);
    expect(changes).toEqual([true, false]);
  });

  it('show() consumes the press only when something was hidden', () => {
    const changes: boolean[] = [];
    const v = new InterfaceVisibility((h) => changes.push(h));
    // Nothing hidden: Escape must fall through to the panels / game menu.
    expect(v.show()).toBe(false);
    expect(changes).toEqual([]);
    v.toggle();
    expect(v.show()).toBe(true);
    expect(v.hidden).toBe(false);
    // Idempotent: a second show writes nothing.
    expect(v.show()).toBe(false);
    expect(changes).toEqual([true, false]);
  });
});

describe('dispatchInterfaceVisibilityAction', () => {
  it('routes exactly the hideInterface bind and leaves every other action alone', () => {
    const v = new InterfaceVisibility(() => {});
    expect(HIDE_INTERFACE_ACTION).toBe('hideInterface');
    expect(dispatchInterfaceVisibilityAction('sheathe', v)).toBe(false);
    expect(dispatchInterfaceVisibilityAction('escape', v)).toBe(false);
    expect(v.hidden).toBe(false);
    expect(dispatchInterfaceVisibilityAction('hideInterface', v)).toBe(true);
    expect(v.hidden).toBe(true);
    expect(dispatchInterfaceVisibilityAction('hideInterface', v)).toBe(true);
    expect(v.hidden).toBe(false);
  });
});

describe('createInterfaceVisibility', () => {
  it('mirrors the hidden flag onto body.interface-hidden', () => {
    const toggle = vi.fn<(token: string, force?: boolean) => boolean>(() => true);
    const v = createInterfaceVisibility({ classList: { toggle } });
    expect(INTERFACE_HIDDEN_CLASS).toBe('interface-hidden');
    v.toggle();
    expect(toggle).toHaveBeenLastCalledWith('interface-hidden', true);
    v.show();
    expect(toggle).toHaveBeenLastCalledWith('interface-hidden', false);
    expect(toggle).toHaveBeenCalledTimes(2);
  });
});
