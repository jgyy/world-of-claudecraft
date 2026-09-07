// @vitest-environment happy-dom

// The waystone window DOM adapter (src/ui/hud/waystone/waystone_window_controller.ts):
// open/render at a keeper, the waystoneTeleport click, the ticket, discount,
// unaffordable and empty states, the gossip route, and close() restoring focus
// through the trap.

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { WAYSTONE_TICKET_ITEM_ID, WAYSTONES, waystoneById } from '../src/sim/content/waystones';
import { waystoneFee } from '../src/sim/waystone_fee';
import type { FocusTrapHandle } from '../src/ui/focus_manager';
import {
  ticketCount,
  WaystoneWindowController,
} from '../src/ui/hud/waystone/waystone_window_controller';
import type { IWorld } from '../src/world_api';

const NPC_ID = 41;
const ORIGIN = WAYSTONES[0]; // eastbrook
const FEE_FENBRIDGE = waystoneFee(ORIGIN, waystoneById('fenbridge')!, 0);
const FEE_HIGHWATCH = waystoneFee(ORIGIN, waystoneById('highwatch')!, 0);

function makeHarness(
  opts: {
    attuned?: string[];
    copper?: number;
    tickets?: number;
    guildTier?: number;
    npcKind?: string;
  } = {},
) {
  document.body.innerHTML = '';
  const opener = document.createElement('button');
  opener.id = 'opener';
  document.body.appendChild(opener);
  const panel = document.createElement('div');
  panel.id = 'waystone-window';
  panel.style.display = 'none';
  document.body.appendChild(panel);
  const entities = new Map([
    [NPC_ID, { id: NPC_ID, kind: opts.npcKind ?? 'npc', templateId: ORIGIN.npcId }],
  ]);
  const waystoneTeleport = vi.fn();
  const world = {
    entities,
    copper: opts.copper ?? FEE_HIGHWATCH * 10,
    inventory: opts.tickets ? [{ itemId: WAYSTONE_TICKET_ITEM_ID, count: opts.tickets }] : [],
    player: { guildTier: opts.guildTier ?? 0 },
    waystonesAttuned: new Set(opts.attuned ?? [ORIGIN.id, 'fenbridge', 'highwatch']),
    waystoneTeleport,
  } as unknown as IWorld;
  const focusFirst = vi.fn();
  const release = vi.fn();
  const trap: FocusTrapHandle = { focusFirst, release, opener: vi.fn(() => opener) };
  const openFocusTrap = vi.fn(() => trap);
  const closeOtherWindows = vi.fn();
  const hideTooltip = vi.fn();
  const controller = new WaystoneWindowController({
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
    waystoneTeleport,
    focusFirst,
    release,
    openFocusTrap,
    closeOtherWindows,
    hideTooltip,
  };
}

describe('ticketCount', () => {
  it('sums every ticket stack in the bags', () => {
    expect(ticketCount({ inventory: [] } as unknown as IWorld)).toBe(0);
    expect(
      ticketCount({
        inventory: [
          { itemId: WAYSTONE_TICKET_ITEM_ID, count: 2 },
          { itemId: 'rune_of_passage', count: 5 },
          { itemId: WAYSTONE_TICKET_ITEM_ID, count: 1 },
        ],
      } as unknown as IWorld),
    ).toBe(3);
  });
});

describe('WaystoneWindowController', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('opens at the keeper with one row per attuned destination', () => {
    const h = makeHarness();
    h.controller.open(NPC_ID, ORIGIN.id);
    expect(h.controller.isOpen).toBe(true);
    expect(h.controller.openNpcId).toBe(NPC_ID);
    expect(h.panel.style.display).toBe('block');
    expect(h.closeOtherWindows).toHaveBeenCalledWith('#waystone-window');
    expect(h.openFocusTrap).toHaveBeenCalledTimes(1);
    expect(h.focusFirst).toHaveBeenCalledWith('.waystone-row:not([disabled])');
    expect(h.panel.getAttribute('role')).toBe('dialog');
    expect(h.panel.querySelector('.panel-title span')?.textContent).toBe(`npc:${ORIGIN.npcId}`);
    expect(h.panel.querySelector('.waystone-subtitle')?.textContent).toBe('Waystones');
    expect(h.panel.querySelector('.waystone-tickets')?.textContent).toBe('Waystone Tickets: 0');
    expect(h.panel.querySelector('.waystone-discount')).toBeNull();
    const rows = [...h.panel.querySelectorAll<HTMLButtonElement>('[data-waystone]')];
    expect(rows.map((r) => r.dataset.waystone)).toEqual(['fenbridge', 'highwatch']);
    expect(rows[0].querySelector('.vi-name')?.textContent).toBe('Fenbridge');
    expect(rows[0].querySelector('.waystone-distance')?.textContent).toMatch(/^\d+ yd$/);
    expect(rows[0].querySelector('.vi-price .money')?.textContent).toBe(`${FEE_FENBRIDGE}c`);
    expect(rows[1].querySelector('.vi-price .money')?.textContent).toBe(`${FEE_HIGHWATCH}c`);
    expect(rows[0].getAttribute('aria-label')).toContain('Teleport to Fenbridge, ');
    expect(rows[0].dataset.focusKey).toBe('stone:fenbridge');
    expect(rows.every((r) => !r.disabled)).toBe(true);
  });

  it('a row click sends waystoneTeleport with that stone id and closes the window', () => {
    const h = makeHarness();
    h.controller.open(NPC_ID, ORIGIN.id);
    h.panel.querySelector<HTMLButtonElement>('[data-waystone="highwatch"]')?.click();
    expect(h.waystoneTeleport).toHaveBeenCalledTimes(1);
    expect(h.waystoneTeleport).toHaveBeenCalledWith('highwatch');
    expect(h.controller.isOpen).toBe(false);
    expect(h.panel.style.display).toBe('none');
    expect(h.release).toHaveBeenCalledWith(true);
  });

  it('disables unaffordable rows and never sends waystoneTeleport for them', () => {
    const h = makeHarness({ copper: FEE_FENBRIDGE });
    h.controller.open(NPC_ID, ORIGIN.id);
    const near = h.panel.querySelector<HTMLButtonElement>('[data-waystone="fenbridge"]');
    const far = h.panel.querySelector<HTMLButtonElement>('[data-waystone="highwatch"]');
    expect(near?.disabled).toBe(false);
    expect(far?.disabled).toBe(true);
    expect(far?.classList.contains('unaffordable')).toBe(true);
    far?.click();
    expect(h.waystoneTeleport).not.toHaveBeenCalled();
    expect(h.controller.isOpen).toBe(true);
  });

  it('a ticket in the bags prices every row as one ticket and enables it', () => {
    const h = makeHarness({ copper: 0, tickets: 2 });
    h.controller.open(NPC_ID, ORIGIN.id);
    expect(h.panel.querySelector('.waystone-tickets')?.textContent).toBe('Waystone Tickets: 2');
    const rows = [...h.panel.querySelectorAll<HTMLButtonElement>('[data-waystone]')];
    expect(rows.every((r) => !r.disabled)).toBe(true);
    expect(rows[0].querySelector('.waystone-ticket-price')?.textContent).toBe('1 ticket');
    expect(rows[0].querySelector('.vi-price .money')).toBeNull();
    expect(rows[0].getAttribute('aria-label')).toContain('1 ticket');
  });

  it('shows the guild discount and the discounted fee', () => {
    const h = makeHarness({ guildTier: 2 });
    h.controller.open(NPC_ID, ORIGIN.id);
    expect(h.panel.querySelector('.waystone-discount')?.textContent).toBe('Guild discount: 20%');
    const discounted = waystoneFee(ORIGIN, waystoneById('fenbridge')!, 2);
    expect(discounted).toBeLessThan(FEE_FENBRIDGE);
    expect(h.panel.querySelector('[data-waystone="fenbridge"] .vi-price .money')?.textContent).toBe(
      `${discounted}c`,
    );
  });

  it('re-prices on render when the purse changes (the purse repaint hook)', () => {
    const h = makeHarness({ copper: 0 });
    h.controller.open(NPC_ID, ORIGIN.id);
    expect(h.panel.querySelector<HTMLButtonElement>('[data-waystone="fenbridge"]')?.disabled).toBe(
      true,
    );
    (h.world as unknown as { copper: number }).copper = FEE_FENBRIDGE;
    h.controller.render();
    expect(h.panel.querySelector<HTMLButtonElement>('[data-waystone="fenbridge"]')?.disabled).toBe(
      false,
    );
    // A repaint never re-arms the trap.
    expect(h.openFocusTrap).toHaveBeenCalledTimes(1);
  });

  it('shows the empty state when only the origin is attuned', () => {
    const h = makeHarness({ attuned: [ORIGIN.id] });
    h.controller.open(NPC_ID, ORIGIN.id);
    expect(h.panel.querySelectorAll('[data-waystone]')).toHaveLength(0);
    expect(h.panel.querySelector('.waystone-empty')?.textContent).toContain(
      'You are attuned to no other waystone yet',
    );
    expect(h.panel.querySelector('[data-close]')?.getAttribute('aria-label')).toBe(
      'Close waystones',
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

  it('openAtNpc resolves the stone from the NPC content key (the gossip route)', () => {
    const h = makeHarness();
    h.controller.openAtNpc(NPC_ID);
    expect(h.controller.isOpen).toBe(true);
    expect(h.panel.querySelectorAll('[data-waystone]')).toHaveLength(2);
  });

  it('openAtNpc ignores an entity that is not a keeper NPC', () => {
    const h = makeHarness({ npcKind: 'mob' });
    h.controller.openAtNpc(NPC_ID);
    expect(h.controller.isOpen).toBe(false);
    expect(h.panel.style.display).toBe('none');
  });

  it('closes itself on render when the keeper entity is gone', () => {
    const h = makeHarness();
    h.controller.open(NPC_ID, ORIGIN.id);
    (h.world.entities as Map<number, unknown>).delete(NPC_ID);
    h.controller.render();
    expect(h.controller.isOpen).toBe(false);
    expect(h.panel.style.display).toBe('none');
  });
});
