// P15b WCAG 2.2 AA gate: axe-core over every built window, in a seeded/populated state, under
// BOTH a Sim-shaped and a ClientWorld-mirror-shaped fixture (decision 15). Each window's real
// painter renders into a host element with the real style barrel loaded, then axe asserts zero
// SERIOUS or CRITICAL violations. This is the OPT-IN browser suite (npm run test:browser); a
// bare `vitest run` never launches a browser.
//
// Canvas/3D surfaces stay OUT of scope (decision 10): the map/arena hosts carry a label + an
// honest text summary and are axed as host windows; their pixels get no faked per-marker aria.

import { afterEach, describe, expect, it, vi } from 'vitest';
import type { TalentAllocation } from '../../src/sim/content/talents';
import { QUESTS } from '../../src/sim/data';
import { ArenaWindow } from '../../src/ui/arena_window';
import { LeaderboardWindow } from '../../src/ui/leaderboard_window';
import { OptionsWindow } from '../../src/ui/options_window';
import { QuestLogWindow } from '../../src/ui/questlog_window';
import { SocialWindow } from '../../src/ui/social_window';
import { SpellbookWindow } from '../../src/ui/spellbook_window';
import { TalentsWindow } from '../../src/ui/talents_window';
import type { LeaderboardEntry, LeaderboardPage } from '../../src/world_api';
import {
  axeSeriousViolations,
  cleanup,
  formatViolations,
  host,
  stubDeps,
  type WorldShape,
} from './_harness';

afterEach(cleanup);

async function expectClean(el: HTMLElement): Promise<void> {
  const violations = await axeSeriousViolations(el);
  expect(violations, formatViolations(violations)).toEqual([]);
}

// ---------------------------------------------------------------------------
// Leaderboard (#leaderboard-window) - the async/paged decision-15 centerpiece.
// ---------------------------------------------------------------------------

function entry(over: Partial<LeaderboardEntry> = {}): LeaderboardEntry {
  return {
    rank: 1,
    name: 'Aurelia',
    cls: 'warrior',
    level: 60,
    virtualLevel: 12,
    lifetimeXp: 5_000_000,
    prestigeRank: 0,
    ...over,
  };
}

// A resolved page. The sim shape carries extra fields the core must ignore (the online-only
// -shape trap decision 15 exists to catch); the client mirror carries only the decoded fields.
function page(shape: WorldShape, leaders: LeaderboardEntry[]): LeaderboardPage {
  const junk = shape === 'sim' ? { _serverSeq: 7, _dirty: true } : {};
  return {
    leaders,
    page: 0,
    pageCount: 1,
    total: leaders.length,
    pageSize: 50,
    ...junk,
  } as unknown as LeaderboardPage;
}

function leaderboardWindow(leaderboard: () => Promise<LeaderboardPage>): {
  root: HTMLElement;
  win: LeaderboardWindow;
} {
  const root = host('leaderboard-window');
  root.style.display = 'none'; // toggle() opens it
  const win = new LeaderboardWindow(
    stubDeps({
      root: () => root,
      world: () =>
        ({
          realm: 'Claudemoon',
          player: { name: 'Aurelia', level: 60 },
          lifetimeXp: 5_000_000,
          leaderboard,
        }) as never,
      captureFocus: () => null,
    }),
  );
  return { root, win };
}

describe('axe: leaderboard window (decision 15: Sim + ClientWorld shapes)', () => {
  for (const shape of ['sim', 'client'] as const) {
    it(`ranked page is clean under the ${shape} shape`, async () => {
      const leaders = [
        entry({ rank: 1, name: 'Aurelia', me: true } as Partial<LeaderboardEntry>),
        entry({ rank: 2, name: 'Bramblefoot', cls: 'druid', prestigeRank: 2 }),
        entry({ rank: 3, name: 'Cinderhowl', cls: 'mage' }),
      ];
      const { root, win } = leaderboardWindow(async () => page(shape, leaders));
      win.toggle();
      await vi.waitFor(() => expect(root.querySelector('.lb-row')).toBeTruthy());
      await expectClean(root);
    });
  }

  it('error state (rejecting leaderboard) is clean and announced', async () => {
    const { root, win } = leaderboardWindow(async () => {
      throw new Error('offline');
    });
    win.toggle();
    await vi.waitFor(() => expect(root.querySelector('.lb-error')).toBeTruthy());
    expect(root.querySelector('.lb-error')?.getAttribute('role')).toBe('alert');
    await expectClean(root);
  });
});

// ---------------------------------------------------------------------------
// Talents (#talents-window) - dialog role, the close button, the tablist + radiogroup.
// ---------------------------------------------------------------------------

describe('axe: talents window', () => {
  it('warrior talent tree is clean (dialog role + close button + tablist)', async () => {
    const root = host('talents-window');
    root.style.display = 'none';
    let stage: TalentAllocation | null = null;
    const win = new TalentsWindow(
      stubDeps({
        root: () => root,
        getStage: () => stage,
        setStage: (s: TalentAllocation | null) => {
          stage = s;
        },
        playerClass: () => 'warrior',
        totalPoints: () => 31,
        currentAllocation: () => ({ ranks: {}, choices: {} }) as TalentAllocation,
        activeLoadout: () => -1,
        loadouts: () => [],
        currentBar: () => [],
        buildDropdown: () => document.createElement('div'),
        captureFocus: () => null,
      }),
    );
    win.open();
    expect(root.getAttribute('role')).toBe('dialog');
    expect(root.querySelector('button[data-close]')).toBeTruthy();
    await expectClean(root);
  });
});

// ---------------------------------------------------------------------------
// Arena (#arena-window) - the offline host (dialog role + named title + close).
// ---------------------------------------------------------------------------

describe('axe: arena window', () => {
  it('offline host is clean (dialog role, labelled title)', async () => {
    const root = host('arena-window');
    root.style.display = 'none';
    const win = new ArenaWindow(
      stubDeps({
        root: () => root,
        world: () =>
          ({
            arenaInfo: null,
            playerId: 1,
            player: { name: 'Aurelia' },
            partyInfo: null,
          }) as never,
        captureFocus: () => null,
      }),
    );
    win.toggle();
    expect(root.getAttribute('aria-labelledby')).toBe('arena-title');
    expect(root.querySelector('#arena-title')).toBeTruthy();
    await expectClean(root);
  });
});

// ---------------------------------------------------------------------------
// Quest log (#quest-log-window) - a populated list with selectable rows.
// ---------------------------------------------------------------------------

describe('axe: quest log window', () => {
  it('active quest list is clean', async () => {
    const root = host('quest-log-window');
    root.style.display = 'none';
    const found = Object.entries(QUESTS).find(([, q]) => q.objectives.length >= 1);
    if (!found) throw new Error('fixture: no quest with objectives');
    const [questId, quest] = found;
    const progress = { questId, counts: quest.objectives.map(() => 0), state: 'active' };
    const win = new QuestLogWindow(
      stubDeps({
        root: () => root,
        world: () =>
          ({
            cfg: { playerClass: 'warrior' },
            player: { name: 'Aurelia' },
            questLog: new Map([[questId, progress]]),
            questsDone: new Set<string>(),
          }) as never,
        captureFocus: () => null,
      }),
    );
    win.toggle();
    expect(root.getAttribute('role')).toBe('dialog');
    await expectClean(root);
  });
});

// ---------------------------------------------------------------------------
// Spellbook (#spellbook) - the class kit rows (locked, so no resolved-ability deps).
// ---------------------------------------------------------------------------

describe('axe: spellbook window', () => {
  it('class kit rows are clean', async () => {
    const root = host('spellbook');
    root.style.display = 'none';
    const win = new SpellbookWindow(
      stubDeps({
        root: () => root,
        world: () => ({ cfg: { playerClass: 'warrior' }, known: [] }) as never,
        barAbilityIds: () => [],
        hasFreeSlot: () => true,
        hasFormBars: () => false,
        captureFocus: () => null,
      }),
    );
    win.toggle();
    expect(root.getAttribute('role')).toBe('dialog');
    await expectClean(root);
  });
});

// ---------------------------------------------------------------------------
// Options / Esc menu (#options-menu) - the main drill-down menu.
// ---------------------------------------------------------------------------

describe('axe: options menu', () => {
  it('main menu is clean (dialog role, labelled title)', async () => {
    const root = host('options-menu');
    root.style.display = 'none';
    const win = new OptionsWindow(
      stubDeps({
        root: () => root,
        world: () =>
          ({
            realm: 'Claudemoon',
            player: { name: 'Aurelia', pos: { x: 0, y: 0, z: 0 } },
          }) as never,
        options: () => null,
        bugReport: () => null,
        captureFocus: () => null,
      }),
    );
    win.toggle();
    expect(root.getAttribute('aria-labelledby')).toBe('options-title');
    await expectClean(root);
  });
});

// ---------------------------------------------------------------------------
// Social (#social-window) - the offline state (dialog role + the tab buttons). The online
// typeahead combobox shape is covered by the Node social_view tests + the source guards.
// ---------------------------------------------------------------------------

describe('axe: social window', () => {
  it('offline state is clean (dialog role, tabs)', async () => {
    const root = host('social-window');
    const win = new SocialWindow(
      stubDeps({
        root: () => root,
        world: () =>
          ({
            socialInfo: null,
            partyInfo: null,
            realm: 'Claudemoon',
            player: { name: 'Aurelia' },
          }) as never,
        captureFocus: () => null,
      }),
    );
    win.toggle();
    expect(root.getAttribute('role')).toBe('dialog');
    await expectClean(root);
  });
});
