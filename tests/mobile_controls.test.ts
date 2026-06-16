import { afterEach, describe, expect, it } from 'vitest';
import { MobileControls, isPhoneTouchDevice, mapJoystickVector, mapLookVector } from '../src/game/mobile_controls';
import type { Input } from '../src/game/input';
import type { MobileControlCallbacks } from '../src/game/mobile_controls';

class FakeElement {
  classes = new Set<string>();
  attrs = new Map<string, string>();
  listeners = new Map<string, (e: any) => void>();
  constructor(public id: string, public parent: FakeElement | null = null) {}
  classList = {
    add: (c: string) => { this.classes.add(c); },
    remove: (...cs: string[]) => { cs.forEach((c) => this.classes.delete(c)); },
    contains: (c: string) => this.classes.has(c),
    toggle: (c: string, force?: boolean) => {
      const on = force ?? !this.classes.has(c);
      if (on) this.classes.add(c); else this.classes.delete(c);
      return on;
    },
  };
  setAttribute(k: string, v: string) { this.attrs.set(k, v); }
  getAttribute(k: string) { return this.attrs.get(k) ?? null; }
  addEventListener(type: string, cb: (e: any) => void) { this.listeners.set(type, cb); }
  closest(sel: string) {
    let node: FakeElement | null = this;
    while (node) { if (sel === `#${node.id}`) return node; node = node.parent; }
    return null;
  }
  fire(type: string) {
    this.listeners.get(type)?.({ preventDefault() {}, pointerId: 1, clientX: 0, clientY: 0 });
  }
}

const JOYSTICKS = ['mobile-move-joystick', 'mobile-move-stick', 'mobile-camera-joystick', 'mobile-camera-stick'];
const TRAY_BTNS = ['mobile-social', 'mobile-arena', 'mobile-menu', 'mobile-interact', 'mobile-quest', 'mobile-spellbook', 'mobile-talents', 'mobile-meters', 'mobile-map'];
const OTHER_BTNS = ['mobile-attack-nearest', 'mobile-target', 'mobile-chat'];

function installMobileDom() {
  const els = new Map<string, FakeElement>();
  const root = new FakeElement('mobile-controls');
  els.set('mobile-controls', root);
  const tray = new FakeElement('mobile-extra-controls', root);
  els.set('mobile-extra-controls', tray);
  for (const id of [...JOYSTICKS, 'mobile-more-scrim', 'mobile-more', ...OTHER_BTNS]) els.set(id, new FakeElement(id, root));
  for (const id of TRAY_BTNS) els.set(id, new FakeElement(id, tray));
  const body = new FakeElement('body');
  (globalThis as any).document = { getElementById: (id: string) => els.get(id) ?? null, body };
  (globalThis as any).window = { matchMedia: () => ({ matches: true, addEventListener() {} }) };
  return { els, body };
}

const noopInput = new Proxy({}, { get: () => () => {} }) as Input;
const noopCallbacks = new Proxy({}, { get: () => () => {} }) as MobileControlCallbacks;

afterEach(() => {
  delete (globalThis as any).document;
  delete (globalThis as any).window;
});

describe('mapJoystickVector', () => {
  it('returns neutral inside the deadzone', () => {
    expect(mapJoystickVector(0, 0)).toEqual({ forward: false, back: false, strafeLeft: false, strafeRight: false });
    expect(mapJoystickVector(0.05, -0.08)).toEqual({ forward: false, back: false, strafeLeft: false, strafeRight: false });
  });

  it('maps cardinal movement directions', () => {
    expect(mapJoystickVector(0, -1)).toEqual({ forward: true, back: false, strafeLeft: false, strafeRight: false });
    expect(mapJoystickVector(0, 1)).toEqual({ forward: false, back: true, strafeLeft: false, strafeRight: false });
    expect(mapJoystickVector(-1, 0)).toEqual({ forward: false, back: false, strafeLeft: true, strafeRight: false });
    expect(mapJoystickVector(1, 0)).toEqual({ forward: false, back: false, strafeLeft: false, strafeRight: true });
  });

  it('maps diagonal movement directions', () => {
    expect(mapJoystickVector(0.7, -0.7)).toEqual({ forward: true, back: false, strafeLeft: false, strafeRight: true });
    expect(mapJoystickVector(-0.7, 0.7)).toEqual({ forward: false, back: true, strafeLeft: true, strafeRight: false });
  });
});

describe('isPhoneTouchDevice', () => {
  it('uses the phone touch media query', () => {
    const queries: string[] = [];
    const win = {
      matchMedia: (q: string) => {
        queries.push(q);
        return { matches: true };
      },
    } as unknown as Window;
    expect(isPhoneTouchDevice(win)).toBe(true);
    expect(queries[0]).toContain('pointer: coarse');
    expect(queries[0]).toContain('max-width: 940px');
    expect(queries[0]).toContain('max-height: 760px');
  });
});

describe('mapLookVector', () => {
  it('returns a neutral camera vector inside the deadzone', () => {
    expect(mapLookVector(0.02, 0.03)).toEqual({ x: 0, y: 0 });
  });

  it('keeps analog camera vector outside the deadzone', () => {
    const v = mapLookVector(0.45, -0.25);
    expect(v.x).toBeCloseTo(0.36);
    expect(v.y).toBeCloseTo(-0.2);
  });
});

describe('More tray open/close', () => {
  function setup() {
    const { els, body } = installMobileDom();
    const controls = new MobileControls(noopInput, noopCallbacks);
    controls.start();
    return { els, body };
  }

  it('toggles the tray and syncs aria-pressed on the More button', () => {
    const { els, body } = setup();
    const more = els.get('mobile-more')!;
    const root = els.get('mobile-controls')!;
    expect(body.classList.contains('mobile-more-open')).toBe(false);

    more.fire('click');
    expect(root.classList.contains('expanded')).toBe(true);
    expect(body.classList.contains('mobile-more-open')).toBe(true);
    expect(more.getAttribute('aria-pressed')).toBe('true');

    more.fire('click');
    expect(root.classList.contains('expanded')).toBe(false);
    expect(body.classList.contains('mobile-more-open')).toBe(false);
    expect(more.getAttribute('aria-pressed')).toBe('false');
  });

  it('dismisses the tray when the scrim is tapped', () => {
    const { els, body } = setup();
    els.get('mobile-more')!.fire('click');
    expect(body.classList.contains('mobile-more-open')).toBe(true);

    els.get('mobile-more-scrim')!.fire('pointerdown');
    expect(body.classList.contains('mobile-more-open')).toBe(false);
    expect(els.get('mobile-more')!.getAttribute('aria-pressed')).toBe('false');
  });

  it('closes the tray after a tray button is chosen', () => {
    const { els, body } = setup();
    els.get('mobile-more')!.fire('click');
    els.get('mobile-map')!.fire('click');
    expect(body.classList.contains('mobile-more-open')).toBe(false);
  });
});
