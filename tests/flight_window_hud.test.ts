// @vitest-environment happy-dom

// The flight window DOM adapter (src/ui/hud/flight/flight_window_controller.ts):
// open/render at a flightmaster, the takeFlight click, the unaffordable and
// empty states, the gossip route, and close() restoring focus through the trap.

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FLIGHT_FARE_COPPER, FLIGHT_NODES } from '../src/sim/content/flight_paths';
import type { FocusTrapHandle } from '../src/ui/focus_manager';
import { FlightWindowController } from '../src/ui/hud/flight/flight_window_controller';
import type { IWorld } from '../src/world_api';

const NPC_ID = 41;
const ORIGIN = FLIGHT_NODES[0]; // eastbrook

function makeHarness(opts: { known?: string[]; copper?: number; npcKind?: string } = {}) {
  document.body.innerHTML = '';
  const opener = document.createElement('button');
  opener.id = 'opener';
  document.body.appendChild(opener);
  const panel = document.createElement('div');
  panel.id = 'flight-window';
  panel.style.display = 'none';
  document.body.appendChild(panel);
  const entities = new Map([
    [NPC_ID, { id: NPC_ID, kind: opts.npcKind ?? 'npc', templateId: ORIGIN.npcId }],
  ]);
  const takeFlight = vi.fn();
  const world = {
    entities,
    copper: opts.copper ?? FLIGHT_FARE_COPPER * 10,
    flightNodesKnown: new Set(opts.known ?? [ORIGIN.id, 'fenbridge', 'highwatch']),
    takeFlight,
  } as unknown as IWorld;
  const focusFirst = vi.fn();
  const release = vi.fn();
  const trap: FocusTrapHandle = { focusFirst, release, opener: vi.fn(() => opener) };
  const openFocusTrap = vi.fn(() => trap);
  const closeOtherWindows = vi.fn();
  const hideTooltip = vi.fn();
  const controller = new FlightWindowController({
    element: panel,
    world: () => world,
    openFocusTrap,
    closeOtherWindows,
    hideTooltip,
    money: (copper) => `<span class="money">${copper}c</span>`,
    npcName: (templateId) => `npc:${templateId}`,
  });
  return {
    controller,
    panel,
    world,
    takeFlight,
    focusFirst,
    release,
    openFocusTrap,
    closeOtherWindows,
    hideTooltip,
  };
}

describe('FlightWindowController', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('opens at the flightmaster with one row per known destination', () => {
    const h = makeHarness();
    h.controller.open(NPC_ID, ORIGIN.id);
    expect(h.controller.isOpen).toBe(true);
    expect(h.controller.openNpcId).toBe(NPC_ID);
    expect(h.panel.style.display).toBe('block');
    expect(h.closeOtherWindows).toHaveBeenCalledWith('#flight-window');
    expect(h.openFocusTrap).toHaveBeenCalledTimes(1);
    expect(h.focusFirst).toHaveBeenCalledWith('.flight-row:not([disabled])');
    expect(h.panel.getAttribute('role')).toBe('dialog');
    expect(h.panel.querySelector('.panel-title span')?.textContent).toBe(`npc:${ORIGIN.npcId}`);
    expect(h.panel.querySelector('.flight-subtitle')?.textContent).toBe('Flight Paths');
    const rows = [...h.panel.querySelectorAll<HTMLButtonElement>('[data-flight-node]')];
    expect(rows.map((r) => r.dataset.flightNode)).toEqual(['fenbridge', 'highwatch']);
    expect(rows[0].querySelector('.vi-name')?.textContent).toBe('Fenbridge');
    expect(rows[0].querySelector('.flight-hops')?.textContent).toBe('1 hops');
    expect(rows[0].querySelector('.vi-price .money')?.textContent).toBe(`${FLIGHT_FARE_COPPER}c`);
    expect(rows[1].querySelector('.vi-price .money')?.textContent).toBe(
      `${2 * FLIGHT_FARE_COPPER}c`,
    );
    expect(rows[0].getAttribute('aria-label')).toContain('Fly to Fenbridge, 1 hops');
    expect(rows[0].dataset.focusKey).toBe('node:fenbridge');
    expect(rows.every((r) => !r.disabled)).toBe(true);
  });

  it('a row click sends takeFlight with that node id and closes the window', () => {
    const h = makeHarness();
    h.controller.open(NPC_ID, ORIGIN.id);
    h.panel.querySelector<HTMLButtonElement>('[data-flight-node="highwatch"]')?.click();
    expect(h.takeFlight).toHaveBeenCalledTimes(1);
    expect(h.takeFlight).toHaveBeenCalledWith('highwatch');
    expect(h.controller.isOpen).toBe(false);
    expect(h.panel.style.display).toBe('none');
    expect(h.release).toHaveBeenCalledWith(true);
  });

  it('disables unaffordable rows and never sends takeFlight for them', () => {
    const h = makeHarness({ copper: FLIGHT_FARE_COPPER });
    h.controller.open(NPC_ID, ORIGIN.id);
    const near = h.panel.querySelector<HTMLButtonElement>('[data-flight-node="fenbridge"]');
    const far = h.panel.querySelector<HTMLButtonElement>('[data-flight-node="highwatch"]');
    expect(near?.disabled).toBe(false);
    expect(far?.disabled).toBe(true);
    expect(far?.classList.contains('unaffordable')).toBe(true);
    far?.click();
    expect(h.takeFlight).not.toHaveBeenCalled();
    expect(h.controller.isOpen).toBe(true);
  });

  it('re-prices on render when the purse changes (the purse repaint hook)', () => {
    const h = makeHarness({ copper: 0 });
    h.controller.open(NPC_ID, ORIGIN.id);
    expect(
      h.panel.querySelector<HTMLButtonElement>('[data-flight-node="fenbridge"]')?.disabled,
    ).toBe(true);
    (h.world as unknown as { copper: number }).copper = FLIGHT_FARE_COPPER;
    h.controller.render();
    expect(
      h.panel.querySelector<HTMLButtonElement>('[data-flight-node="fenbridge"]')?.disabled,
    ).toBe(false);
    // A repaint never re-arms the trap.
    expect(h.openFocusTrap).toHaveBeenCalledTimes(1);
  });

  it('shows the empty state when only the origin is known', () => {
    const h = makeHarness({ known: [ORIGIN.id] });
    h.controller.open(NPC_ID, ORIGIN.id);
    expect(h.panel.querySelectorAll('[data-flight-node]')).toHaveLength(0);
    expect(h.panel.querySelector('.flight-empty')?.textContent).toContain(
      'You know no other flight paths yet',
    );
    expect(h.panel.querySelector('[data-close]')?.getAttribute('aria-label')).toBe(
      'Close flight paths',
    );
  });

  it('the close button hides the window, hides the tooltip and restores focus', () => {
    const h = makeHarness();
    h.controller.open(NPC_ID, ORIGIN.id);
    h.panel.querySelector<HTMLButtonElement>('[data-close]')?.click();
    expect(h.panel.style.display).toBe('none');
    expect(h.controller.isOpen).toBe(false);
    expect(h.controller.openNpcId).toBeNull();
    expect(h.hideTooltip).toHaveBeenCalled();
    expect(h.release).toHaveBeenCalledWith(true);
  });

  it('close(false) releases the trap without returning focus', () => {
    const h = makeHarness();
    h.controller.open(NPC_ID, ORIGIN.id);
    h.controller.close(false);
    expect(h.release).toHaveBeenCalledWith(false);
  });

  it('openAtNpc resolves the node from the NPC content key (the gossip route)', () => {
    const h = makeHarness();
    h.controller.openAtNpc(NPC_ID);
    expect(h.controller.isOpen).toBe(true);
    expect(h.panel.querySelectorAll('[data-flight-node]')).toHaveLength(2);
  });

  it('openAtNpc ignores an entity that is not a flightmaster NPC', () => {
    const h = makeHarness({ npcKind: 'mob' });
    h.controller.openAtNpc(NPC_ID);
    expect(h.controller.isOpen).toBe(false);
    expect(h.panel.style.display).toBe('none');
  });

  it('closes itself on render when the flightmaster entity is gone', () => {
    const h = makeHarness();
    h.controller.open(NPC_ID, ORIGIN.id);
    (h.world.entities as Map<number, unknown>).delete(NPC_ID);
    h.controller.render();
    expect(h.controller.isOpen).toBe(false);
    expect(h.panel.style.display).toBe('none');
  });
});
