import { describe, expect, it } from 'vitest';
import { charselectPrimaryAction } from '../src/net/charselect_action';
import {
  buildWelcomeRoster,
  showWelcomeRoster,
  type WelcomeRosterCandidate,
} from '../src/ui/welcome_roster_view';

function char(overrides: Partial<WelcomeRosterCandidate> & { id: number }): WelcomeRosterCandidate {
  return {
    name: `Char${overrides.id}`,
    class: 'warrior',
    level: 1,
    online: false,
    forceRename: false,
    ...overrides,
  };
}

describe('showWelcomeRoster', () => {
  it('hides the rail for a single-character account', () => {
    expect(showWelcomeRoster([char({ id: 1 })])).toBe(false);
    expect(showWelcomeRoster([])).toBe(false);
  });

  it('shows the rail once there is a real choice', () => {
    expect(showWelcomeRoster([char({ id: 1 }), char({ id: 2 })])).toBe(true);
  });
});

describe('buildWelcomeRoster', () => {
  it('preserves the caller-supplied order (the caller sorts, this module only maps)', () => {
    const rows = buildWelcomeRoster(
      [char({ id: 2, level: 40 }), char({ id: 3, level: 20 }), char({ id: 1, level: 5 })],
      2,
    );
    expect(rows.map((r) => r.id)).toEqual([2, 3, 1]);
  });

  it('flags exactly the selected row', () => {
    const rows = buildWelcomeRoster([char({ id: 1 }), char({ id: 2 })], 2);
    expect(rows.find((r) => r.id === 1)?.selected).toBe(false);
    expect(rows.find((r) => r.id === 2)?.selected).toBe(true);
  });

  it('the enter/takeover/disabled decision matches every case', () => {
    const rows = buildWelcomeRoster(
      [
        char({ id: 1, online: false, forceRename: false }),
        char({ id: 2, online: true, forceRename: false }),
        char({ id: 3, online: false, forceRename: true }),
      ],
      1,
    );
    const byId = (id: number) => rows.find((r) => r.id === id);
    expect(byId(1)).toMatchObject({ disabled: false, labelKey: 'auth.enterWorld', titleKey: null });
    expect(byId(2)).toMatchObject({
      disabled: false,
      labelKey: 'character.takeOver',
      titleKey: null,
    });
    expect(byId(3)).toMatchObject({
      disabled: true,
      labelKey: 'auth.enterWorld',
      titleKey: 'character.renameRequired',
    });
  });

  it('the roster rail decision stays in lockstep with net/charselect_action.ts across the full matrix', () => {
    for (const online of [false, true]) {
      for (const forceRename of [false, true]) {
        const rows = buildWelcomeRoster([char({ id: 1, online, forceRename })], 1);
        const netAction = charselectPrimaryAction({ online, forceRename });
        expect(rows[0]).toMatchObject({
          disabled: netAction.kind === 'disabled',
          labelKey: netAction.labelKey,
          titleKey: netAction.titleKey,
        });
      }
    }
  });
});
