// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CharacterSummary } from '../src/net/online';
import { mountWelcomeScreen, type WelcomeScreenDeps } from '../src/ui/welcome_screen_window';

function makeRoot(): HTMLElement {
  const root = document.createElement('div');
  root.id = 'welcome-screen';
  root.hidden = true;
  root.innerHTML = `
    <div id="ws-header"></div>
    <div id="ws-news"></div>
    <div id="ws-discord"><button id="ws-discord-join" type="button"></button></div>
    <div id="ws-armory-card" hidden></div>
    <div id="ws-chest-tile" hidden></div>
    <div id="ws-status"></div>
    <button id="ws-continue" type="button"></button>
    <div id="ws-continue-hint"></div>
    <div id="ws-version"></div>
    <div id="ws-stage"></div>
    <div id="ws-roster"></div>
  `;
  document.body.appendChild(root);
  return root;
}

function char(overrides: Partial<CharacterSummary> & { id: number }): CharacterSummary {
  return {
    name: `Char${overrides.id}`,
    class: 'warrior',
    level: 5,
    online: false,
    forceRename: false,
    ...overrides,
  } as CharacterSummary;
}

function baseDeps(roster: CharacterSummary[], currentCharacterId: number): WelcomeScreenDeps {
  return {
    platform: { nativeApp: false, desktopApp: false, mobileTouch: false, offline: true },
    fetchReleases: () => Promise.resolve([]),
    fetchArmoryPromoEnabled: () => Promise.resolve(false),
    fetchDiscord: () =>
      Promise.resolve({ enabled: null, linked: null, guildMember: null, fetchFailed: false }),
    fetchChest: () => Promise.resolve({ ready: false, unknown: true }),
    header: () => null,
    onContinue: () => {},
    fetchRoster: () => Promise.resolve(roster),
    currentCharacterId,
  };
}

describe('mountWelcomeScreen', () => {
  let root: HTMLElement;
  let openSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    document.body.innerHTML = '';
    root = makeRoot();
    openSpy = vi.fn();
    (window as unknown as { open: typeof window.open }).open =
      openSpy as unknown as typeof window.open;
    const store = new Map<string, string>();
    const fakeStorage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
      clear: () => store.clear(),
    } as unknown as Storage;
    Object.defineProperty(window, 'localStorage', { value: fakeStorage, configurable: true });
    Object.defineProperty(window, 'sessionStorage', { value: fakeStorage, configurable: true });
  });

  it('does not stack a duplicate Discord-join handler across a switch remount', async () => {
    // The character-switch flow tears down the current controller (destroy())
    // and mounts a fresh one on the SAME static root, exactly like
    // switchWelcomeCharacter in main.ts does. Before the AbortController fix,
    // each mount added its own click listener to the static #ws-discord-join
    // button and destroy() never removed it, so after N mounts a single click
    // fired window.open N times.
    const first = mountWelcomeScreen(root, baseDeps([], 1));
    await first.show();
    first.destroy();

    const second = mountWelcomeScreen(root, baseDeps([], 1));
    await second.show();

    root.querySelector<HTMLButtonElement>('#ws-discord-join')?.click();
    expect(openSpy).toHaveBeenCalledTimes(1);
  });

  it('marks roster rows with role=option and aria-selected for the current character', async () => {
    const roster = [char({ id: 1, name: 'Alice' }), char({ id: 2, name: 'Bob' })];
    const controller = mountWelcomeScreen(root, {
      ...baseDeps(roster, 1),
      onSelectCharacter: () => {},
    });
    await controller.show();

    const rows = Array.from(root.querySelectorAll<HTMLButtonElement>('.ws-roster-row'));
    expect(rows).toHaveLength(2);
    const selected = rows.find((r) => r.classList.contains('sel'));
    const other = rows.find((r) => !r.classList.contains('sel'));
    expect(selected?.getAttribute('role')).toBe('option');
    expect(selected?.getAttribute('aria-selected')).toBe('true');
    expect(other?.getAttribute('role')).toBe('option');
    expect(other?.getAttribute('aria-selected')).toBe('false');
    expect(root.querySelector('#ws-roster')?.getAttribute('role')).toBe('listbox');
  });
});
