// P15b mobile target-size pass: under a real landscape phone viewport (decision 16a: the
// in-game view is landscape-only on web mobile), every TOUCH control must render >=40x40px,
// the PREFERRED mobile floor (decision 10), not merely the >=24px absolute desktop floor.
// This measures REAL rendered geometry (getBoundingClientRect under the real style barrel +
// the body.mobile-touch.game-active state), never a CSS-text assertion, mirroring the V16
// mobile_button_size / mobile_joystick_size harnesses but with an actual numeric floor the
// older screenshot harnesses never asserted.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { page } from 'vitest/browser';
import { cleanup } from './_harness';

const TOUCH_FLOOR = 40;
// getBoundingClientRect can land a hair under an exact 40px declaration on sub-pixel
// rounding; allow half a pixel so the gate tests the real floor, not rounding noise.
const EPSILON = 0.5;

beforeEach(async () => {
  // A landscape phone (the in-game web-mobile profile, decision 16a). The orientation:
  // landscape media query drives the in-game landscape rules in hud.mobile.css.
  await page.viewport(844, 390);
  document.body.className = 'mobile-touch game-active';
});

afterEach(() => {
  cleanup();
  document.body.className = '';
});

function measure(el: HTMLElement): { w: number; h: number } {
  const r = el.getBoundingClientRect();
  return { w: r.width, h: r.height };
}

function expectAtLeastFloor(el: HTMLElement, label: string): void {
  const { w, h } = measure(el);
  expect(w, `${label} width ${w} < ${TOUCH_FLOOR}`).toBeGreaterThanOrEqual(TOUCH_FLOOR - EPSILON);
  expect(h, `${label} height ${h} < ${TOUCH_FLOOR}`).toBeGreaterThanOrEqual(TOUCH_FLOOR - EPSILON);
}

function el(tag: string, attrs: Record<string, string> = {}): HTMLElement {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') node.className = v;
    else if (k === 'id') node.id = v;
    else node.setAttribute(k, v);
  }
  return node;
}

describe('mobile target-size: in-game touch controls are >=40x40 in landscape', () => {
  it('action-bar buttons (a non-first, non-empty slot)', () => {
    const bar = el('div', { id: 'actionbar' });
    // The first slot is display:none on mobile; measure a subsequent real slot.
    bar.append(el('button', { class: 'action-btn' }), el('button', { class: 'action-btn' }));
    document.body.appendChild(bar);
    expectAtLeastFloor(bar.children[1] as HTMLElement, 'action-btn');
  });

  it('party-member rows (role=button tap targets)', () => {
    const frames = el('div', { id: 'party-frames' });
    const row = el('div', { class: 'party-frame', role: 'button', tabindex: '0' });
    frames.appendChild(row);
    document.body.appendChild(frames);
    expectAtLeastFloor(row, 'party-frame');
  });

  it('the party leave button', () => {
    const frames = el('div', { id: 'party-frames' });
    const leave = el('button', { id: 'party-leave' });
    frames.appendChild(leave);
    document.body.appendChild(frames);
    expectAtLeastFloor(leave, '#party-leave');
  });

  it('the mobile More-tray close button', () => {
    document.body.className = 'mobile-touch game-active mobile-more-open';
    const tray = el('div', { id: 'mobile-extra-controls', class: 'window panel' });
    const title = el('div', { class: 'panel-title' });
    const close = el('button', { class: 'x-btn', 'data-close': '', 'aria-label': 'Close' });
    title.appendChild(close);
    tray.appendChild(title);
    document.body.appendChild(tray);
    expectAtLeastFloor(close, '#mobile-more-close');
  });

  it('the community HUD toggle', () => {
    const menu = el('details', { id: 'community-menu' });
    const toggle = el('summary', { class: 'community-toggle' });
    menu.appendChild(toggle);
    document.body.appendChild(menu);
    expectAtLeastFloor(toggle, '.community-toggle');
  });

  it('the movement / camera joystick', () => {
    const controls = el('div', { id: 'mobile-controls' });
    const joystick = el('div', { id: 'mobile-move-joystick', class: 'mobile-joystick' });
    controls.appendChild(joystick);
    document.body.appendChild(controls);
    expectAtLeastFloor(joystick, '.mobile-joystick');
  });
});
