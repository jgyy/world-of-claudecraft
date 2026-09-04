// @vitest-environment happy-dom
// The Rift Forge window (src/ui/hud/rift_forge/rift_forge_window.ts), the thin
// painter over rift_forge_view.ts.
//
// Pins: open renders the wallet, one card per band with the three forge lines,
// and the buttons call the IWorld trio with the exact bag slot; a `false`
// outcome (the online mirror's refused / closed ack) renders a visible refusal
// line rather than silence; a riftForgeResult event maps its structured reason
// to the localized status line and re-reads the payload; worn bands render the
// unequip hint; close restores the opener focus.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { RIFT_ESSENCE_ITEM_ID, RIFT_GEM_IDS } from '../src/sim/content/rift/items';
import { createRiftGearInstance } from '../src/sim/rift/progression';
import type { InvSlot, SimEvent } from '../src/sim/types';
import { RiftForgeWindow, type RiftForgeWindowDeps } from '../src/ui/hud/rift_forge';
import type { IWorld } from '../src/world_api';

type Call = { cmd: string; itemId: string; arg?: string; slotIndex?: number };

describe('RiftForgeWindow', () => {
  let root: HTMLElement;
  let win: RiftForgeWindow;
  let calls: Call[];
  let inventory: InvSlot[];
  let outcome: boolean | { ok: boolean };
  let restored: (HTMLElement | null)[];
  let gear: ReturnType<typeof createRiftGearInstance>;

  function world(): IWorld {
    return {
      inventory,
      equipment: {},
      equipmentInstances: {},
      upgradeRiftItem: (itemId: string, target?: { slotIndex: number }) => {
        calls.push({ cmd: 'upgrade', itemId, slotIndex: target?.slotIndex });
        return outcome;
      },
      enchantRiftItem: (itemId: string, stat: string, target?: { slotIndex: number }) => {
        calls.push({ cmd: 'enchant', itemId, arg: stat, slotIndex: target?.slotIndex });
        return outcome;
      },
      socketRiftGem: (itemId: string, gemId: string, target?: { slotIndex: number }) => {
        calls.push({ cmd: 'socket', itemId, arg: gemId, slotIndex: target?.slotIndex });
        return outcome;
      },
    } as unknown as IWorld;
  }

  function deps(overrides: Partial<RiftForgeWindowDeps> = {}): RiftForgeWindowDeps {
    return {
      root: () => root,
      world,
      closeOthers: () => {},
      captureFocus: () => document.getElementById('opener'),
      restoreFocus: (target) => void restored.push(target),
      itemTooltip: () => '<div>tip</div>',
      attachTooltip: () => {},
      ...overrides,
    };
  }

  beforeEach(() => {
    document.body.innerHTML =
      '<button id="opener"></button><div id="rift-forge-window" class="window panel"></div>';
    root = document.getElementById('rift-forge-window') as HTMLElement;
    calls = [];
    restored = [];
    outcome = { ok: true };
    gear = createRiftGearInstance('window-test', 'S', 'warrior', 1);
    inventory = [
      { itemId: 'linen_cloth', count: 2 },
      { itemId: gear.itemId, count: 1, instance: gear.instance },
      { itemId: RIFT_ESSENCE_ITEM_ID, count: 9 },
      { itemId: RIFT_GEM_IDS[2], count: 1 },
    ];
    win = new RiftForgeWindow(deps());
  });

  afterEach(() => {
    win.close();
    document.body.innerHTML = '';
  });

  const text = () => root.textContent ?? '';

  it('opens with the wallet, one band card, and the three forge controls', () => {
    win.open();
    expect(win.isOpen).toBe(true);
    expect(root.getAttribute('role')).toBe('dialog');
    expect(text()).toContain('Rift Forge');
    expect(text()).toContain('Rift Essence: 9');
    expect(root.querySelectorAll('.rf-ring')).toHaveLength(1);
    expect(text()).toContain('Rift upgrade 0/5');
    expect(text()).toContain('Rift gems 0/2');
    expect(root.querySelector<HTMLButtonElement>('[data-upgrade]')?.disabled).toBe(false);
    expect(root.querySelector<HTMLButtonElement>('[data-enchant]')?.disabled).toBe(false);
    // Only the owned gem is offered.
    const gemPick = root.querySelector<HTMLSelectElement>('[data-gem]');
    expect([...(gemPick?.options ?? [])].map((o) => o.value)).toEqual([RIFT_GEM_IDS[2]]);
    expect(document.activeElement).toBe(root.querySelector('[data-close]'));
  });

  it('routes the buttons to the IWorld trio with the exact bag slot and the picked option', async () => {
    win.open();
    root.querySelector<HTMLButtonElement>('[data-upgrade]')?.click();
    await Promise.resolve();
    const statPick = root.querySelector<HTMLSelectElement>('[data-stat]');
    if (statPick) statPick.value = 'hasteRating';
    root.querySelector<HTMLButtonElement>('[data-enchant]')?.click();
    await Promise.resolve();
    root.querySelector<HTMLButtonElement>('[data-socket]')?.click();
    await Promise.resolve();
    expect(calls).toEqual([
      { cmd: 'upgrade', itemId: gear.itemId, slotIndex: 1 },
      { cmd: 'enchant', itemId: gear.itemId, arg: 'hasteRating', slotIndex: 1 },
      { cmd: 'socket', itemId: gear.itemId, arg: RIFT_GEM_IDS[2], slotIndex: 1 },
    ]);
  });

  it('turns a false outcome (closed or refused wire) into a visible refusal line', async () => {
    outcome = false;
    win.open();
    root.querySelector<HTMLButtonElement>('[data-upgrade]')?.click();
    await Promise.resolve();
    await Promise.resolve();
    const status = root.querySelector('.rf-status');
    expect(status?.classList.contains('rf-status-error')).toBe(true);
    expect(status?.getAttribute('role')).toBe('alert');
    expect(status?.textContent).toContain('The forge refused');
  });

  it('maps a riftForgeResult reason to the status line and re-reads the payload', () => {
    win.open();
    if (gear.instance.rift) gear.instance.rift.upgradeLevel = 2;
    const refused: SimEvent = {
      type: 'riftForgeResult',
      pid: 1,
      ok: false,
      action: 'upgrade',
      itemId: gear.itemId,
      reason: 'insufficient_essence',
    };
    win.onResult(refused as Extract<SimEvent, { type: 'riftForgeResult' }>);
    expect(root.querySelector('.rf-status')?.textContent).toContain('Not enough Rift Essence');
    expect(text()).toContain('Rift upgrade 2/5');
    const done: SimEvent = {
      type: 'riftForgeResult',
      pid: 1,
      ok: true,
      action: 'socket',
      itemId: gear.itemId,
    };
    win.onResult(done as Extract<SimEvent, { type: 'riftForgeResult' }>);
    const status = root.querySelector('.rf-status');
    expect(status?.classList.contains('rf-status-error')).toBe(false);
    expect(status?.textContent).toContain('Socketed a gem into');
  });

  it('renders a worn band with the unequip hint and no controls, and the empty state', () => {
    const worn = new RiftForgeWindow(
      deps({
        world: () =>
          ({
            ...world(),
            inventory: [],
            equipment: { ring1: gear.itemId },
            equipmentInstances: { ring1: gear.instance },
          }) as unknown as IWorld,
      }),
    );
    worn.open();
    expect(root.querySelector('.rf-ring-worn')).not.toBeNull();
    expect(text()).toContain('Unequip it to forge');
    expect(root.querySelector('[data-upgrade]')).toBeNull();
    worn.close();
    const empty = new RiftForgeWindow(
      deps({ world: () => ({ ...world(), inventory: [] }) as unknown as IWorld }),
    );
    empty.open();
    expect(root.querySelector('.lb-empty')?.textContent).toContain('No Riftbound band');
    empty.close();
  });

  it('close restores focus to the opener and is idempotent', () => {
    win.open();
    win.close();
    expect(win.isOpen).toBe(false);
    expect(restored).toEqual([document.getElementById('opener')]);
    win.close();
    expect(restored).toHaveLength(1);
  });
});
