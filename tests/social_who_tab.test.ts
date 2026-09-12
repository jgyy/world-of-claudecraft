// @vitest-environment happy-dom

// The Social window's Who tab, driven through the real SocialWindow painter over
// happy-dom: the tab asks the server on select (and on a /who chat command),
// paints the delivered roster sorted by the pure core, re-sorts locally on a
// column click, narrows on the class chip, submits the footer search as a new
// request, and whispers from a row. Offline the tab shows the shared "online
// play" empty state and /who falls through to the world.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WHO_FILTER_MAX } from '../server/who_roster';
import { SocialWindow, type SocialWindowDeps } from '../src/ui/social_window';
import type { IWorld, WhoRosterInfo } from '../src/world_api';

interface TestWorld {
  socialInfo: { friends: []; ignores: []; blocks: []; guild: null; myPledge: null } | null;
  whoInfo: WhoRosterInfo | null;
  whoRequest: ReturnType<typeof vi.fn>;
  spectating: string | null;
}

const ROSTER: WhoRosterInfo = {
  filter: '',
  limit: 200,
  total: 3,
  rows: [
    { name: 'Mira', cls: 'priest', level: 30, zone: 'Ashwood', status: 'online', guild: '' },
    { name: 'Aleron', cls: 'warrior', level: 12, zone: 'Ashwood', status: 'combat', guild: 'Moon' },
    { name: 'Bryn', cls: 'mage', level: 41, zone: 'Ashwood', status: 'afk', guild: 'Pact' },
  ],
};

let world: TestWorld;
let root: HTMLElement;
let whispers: string[];

beforeEach(() => {
  document.body.innerHTML = '';
  whispers = [];
  world = {
    socialInfo: { friends: [], ignores: [], blocks: [], guild: null, myPledge: null },
    whoInfo: null,
    whoRequest: vi.fn(),
    spectating: null,
  };
});

afterEach(() => {
  document.body.innerHTML = '';
});

function makeWindow(): SocialWindow {
  root = document.createElement('div');
  root.id = 'social-window';
  document.body.appendChild(root);
  const noop = (): void => {};
  const deps: SocialWindowDeps = {
    root: () => root,
    world: () =>
      ({
        playerId: 7,
        player: { id: 7, name: 'Aleron' },
        realm: 'Ashenvale',
        socialInfo: world.socialInfo,
        partyInfo: null,
        whoInfo: world.whoInfo,
        whoRequest: world.whoRequest,
        spectating: world.spectating,
        searchCharacters: async () => [],
      }) as unknown as IWorld,
    closeOthers: noop,
    hideTooltip: noop,
    captureFocus: () => null,
    restoreFocus: noop,
    showPrompt: noop,
    startWhisper: (name) => whispers.push(name),
  };
  return new SocialWindow(deps);
}

function rowNames(): string[] {
  return Array.from(root.querySelectorAll('.soc-who-row:not(.soc-who-header) .who-name')).map(
    (el) => el.textContent?.trim() ?? '',
  );
}

function clickTab(id: string): void {
  (root.querySelector(`[data-tab="${id}"]`) as HTMLElement | null)?.click();
}

describe('Who tab: request on select, paint on answer', () => {
  it('asks the server for the unfiltered roster when the tab is selected', () => {
    const win = makeWindow();
    win.toggle();
    expect(world.whoRequest).not.toHaveBeenCalled();
    clickTab('who');
    expect(world.whoRequest).toHaveBeenCalledWith('');
    expect(root.querySelector('.soc-empty')?.textContent).toContain('Asking the realm');
  });

  it('paints the delivered rows in name order once the answer lands', () => {
    const win = makeWindow();
    win.toggle();
    clickTab('who');
    world.whoInfo = ROSTER;
    win.refreshIfChanged();
    expect(rowNames()).toEqual(['Aleron', 'Bryn', 'Mira']);
    expect(root.querySelector('.soc-who-count')?.textContent).toContain('3 online');
    // the viewer's own row is plain text; everyone else is a whisper button
    expect(root.querySelector('.who-name .soc-link[data-whisper="Aleron"]')).toBeNull();
    expect(root.querySelector('.who-name .soc-link[data-whisper="Bryn"]')).not.toBeNull();
    expect(
      Array.from(root.querySelectorAll('.soc-who-row:not(.soc-who-header) .who-guild')).map(
        (el) => el.textContent,
      ),
    ).toEqual(['Moon', 'Pact', '']);
  });

  it('re-sorts locally on a column header click (no new request)', () => {
    const win = makeWindow();
    win.toggle();
    clickTab('who');
    world.whoInfo = ROSTER;
    win.refreshIfChanged();
    world.whoRequest.mockClear();
    (root.querySelector('[data-act="who-sort"][data-key="level"]') as HTMLElement).click();
    expect(rowNames()).toEqual(['Bryn', 'Mira', 'Aleron']);
    expect(root.querySelector('.who-level[role="columnheader"]')?.getAttribute('aria-sort')).toBe(
      'descending',
    );
    (root.querySelector('[data-act="who-sort"][data-key="level"]') as HTMLElement).click();
    expect(rowNames()).toEqual(['Aleron', 'Mira', 'Bryn']);
    expect(world.whoRequest).not.toHaveBeenCalled();
  });

  it('narrows on the class chip locally', () => {
    const win = makeWindow();
    win.toggle();
    clickTab('who');
    world.whoInfo = ROSTER;
    win.refreshIfChanged();
    const select = root.querySelector('select[data-field="who-cls"]') as HTMLSelectElement;
    expect(Array.from(select.options).map((o) => o.value)).toEqual([
      '',
      'mage',
      'priest',
      'warrior',
    ]);
    select.value = 'mage';
    select.dispatchEvent(new Event('change', { bubbles: true }));
    expect(rowNames()).toEqual(['Bryn']);
    expect(root.querySelector('.soc-who-count')?.textContent).toContain('1 of 3 online');
  });

  it('keeps focus on the re-rendered sort header across the next slow ticks', () => {
    const win = makeWindow();
    win.toggle();
    clickTab('who');
    world.whoInfo = ROSTER;
    win.refreshIfChanged();
    (root.querySelector('[data-act="who-sort"][data-key="level"]') as HTMLElement).click();
    const focused = () => (document.activeElement as HTMLElement | null)?.dataset.key;
    expect(focused()).toBe('level');
    // the handler re-latched the content signature, so these ticks rebuild nothing
    win.refreshIfChanged();
    win.refreshIfChanged();
    expect(focused()).toBe('level');
    expect(rowNames()).toEqual(['Bryn', 'Mira', 'Aleron']);
  });

  it('re-asks every few slow ticks while the roster is still pending', () => {
    const win = makeWindow();
    win.toggle();
    clickTab('who');
    expect(world.whoRequest).toHaveBeenCalledTimes(1);
    for (let i = 0; i < 3; i++) win.refreshIfChanged();
    expect(world.whoRequest).toHaveBeenCalledTimes(1);
    win.refreshIfChanged();
    expect(world.whoRequest).toHaveBeenCalledTimes(2);
    // an answer stops the retries
    world.whoInfo = ROSTER;
    for (let i = 0; i < 8; i++) win.refreshIfChanged();
    expect(world.whoRequest).toHaveBeenCalledTimes(2);
  });

  it('caps the footer search at the server filter length', () => {
    const win = makeWindow();
    win.toggle();
    clickTab('who');
    const input = root.querySelector('input[data-field="who"]') as HTMLInputElement;
    expect(Number(input.getAttribute('maxlength'))).toBe(WHO_FILTER_MAX);
  });

  it('submits the footer search as a new server request', () => {
    const win = makeWindow();
    win.toggle();
    clickTab('who');
    world.whoRequest.mockClear();
    const input = root.querySelector('input[data-field="who"]') as HTMLInputElement;
    input.value = 'Moon';
    (root.querySelector('[data-act="who-search"]') as HTMLElement).click();
    expect(world.whoRequest).toHaveBeenCalledWith('Moon');
  });

  it('whispers from a row', () => {
    const win = makeWindow();
    win.toggle();
    clickTab('who');
    world.whoInfo = ROSTER;
    win.refreshIfChanged();
    (root.querySelector('.who-name .soc-link[data-whisper="Bryn"]') as HTMLElement).click();
    expect(whispers).toEqual(['Bryn']);
  });

  it('says when the server capped the answer', () => {
    const win = makeWindow();
    win.toggle();
    clickTab('who');
    world.whoInfo = { ...ROSTER, total: 500 };
    win.refreshIfChanged();
    expect(root.querySelector('.soc-who-capped')?.textContent).toContain('first 3');
  });
});

describe('Who tab: the /who chat command', () => {
  it('opens the window on the Who tab with the filter applied and requests it', () => {
    const win = makeWindow();
    expect(win.isOpen).toBe(false);
    expect(win.openWhoTab('Thornpeak')).toBe(true);
    expect(win.isOpen).toBe(true);
    expect(root.querySelector('.soc-tab.on')?.getAttribute('data-tab')).toBe('who');
    expect(world.whoRequest).toHaveBeenCalledWith('Thornpeak');
    expect((root.querySelector('input[data-field="who"]') as HTMLInputElement).value).toBe(
      'Thornpeak',
    );
  });

  it('switches an open window to the Who tab', () => {
    const win = makeWindow();
    win.toggle();
    clickTab('guild');
    expect(win.openWhoTab('')).toBe(true);
    expect(root.querySelector('.soc-tab.on')?.getAttribute('data-tab')).toBe('who');
  });

  it('declines while spectating (every command but chat is dropped there)', () => {
    world.spectating = 'Bryn';
    const win = makeWindow();
    expect(win.openWhoTab('')).toBe(false);
    expect(world.whoRequest).not.toHaveBeenCalled();
  });

  it('declines offline so the line falls through to the world', () => {
    world.socialInfo = null;
    const win = makeWindow();
    expect(win.openWhoTab('')).toBe(false);
    expect(win.isOpen).toBe(false);
    expect(world.whoRequest).not.toHaveBeenCalled();
  });

  it('shows the shared online-only empty state on the tab offline', () => {
    world.socialInfo = null;
    const win = makeWindow();
    win.toggle();
    clickTab('who');
    expect(world.whoRequest).not.toHaveBeenCalled();
    expect(root.querySelector('.soc-empty')).not.toBeNull();
    expect(root.querySelector('.soc-who-list')).toBeNull();
  });
});
