// Pure view model for the Welcome Screen's character roster rail: lets a
// returning player switch to a different character without leaving the
// Welcome Screen for the pre-login character-select flow. DOM/i18n/net-free
// (src/CLAUDE.md forbids a src/ui import of src/net/): the caller (main.ts,
// which does hold net/ access) fetches and sorts the account's characters and
// hands this module the already-ordered, UI-local candidate shape. The thin
// consumer (welcome_screen_window.ts) maps stable keys to t() and paints.
import type { PlayerClass } from '../sim/types';

export interface WelcomeRosterCandidate {
  id: number;
  name: string;
  level: number;
  class: PlayerClass;
  online: boolean;
  forceRename: boolean;
}

export interface WelcomeRosterRow {
  id: number;
  name: string;
  level: number;
  class: PlayerClass;
  online: boolean;
  selected: boolean;
  disabled: boolean;
  labelKey: 'auth.enterWorld' | 'character.takeOver';
  titleKey: 'character.renameRequired' | null;
}

interface RosterAction {
  kind: 'enter' | 'takeover' | 'disabled';
  labelKey: 'auth.enterWorld' | 'character.takeOver';
  titleKey: 'character.renameRequired' | null;
}

// Mirrors src/net/charselect_action.ts's charselectPrimaryAction exactly
// (same three-branch decision on the same online/forceRename shape); it is
// duplicated here rather than imported because src/ui/ may not import
// src/net/ (see src/CLAUDE.md, "Dependency direction"). Kept in lockstep by
// the drift check in tests/welcome_roster_view.test.ts, which asserts both
// functions agree across the full input matrix.
function rosterPrimaryAction(
  c: Pick<WelcomeRosterCandidate, 'online' | 'forceRename'>,
): RosterAction {
  if (c.forceRename)
    return { kind: 'disabled', labelKey: 'auth.enterWorld', titleKey: 'character.renameRequired' };
  if (c.online) return { kind: 'takeover', labelKey: 'character.takeOver', titleKey: null };
  return { kind: 'enter', labelKey: 'auth.enterWorld', titleKey: null };
}

/** The roster rail only earns its place once there is a real choice to make. */
export function showWelcomeRoster(candidates: readonly WelcomeRosterCandidate[]): boolean {
  return candidates.length > 1;
}

/** Maps an already-ordered roster (caller sorts, e.g. via net/char_sort.ts) into rail rows. */
export function buildWelcomeRoster(
  candidates: readonly WelcomeRosterCandidate[],
  selectedCharacterId: number,
): WelcomeRosterRow[] {
  return candidates.map((c) => {
    const action = rosterPrimaryAction(c);
    return {
      id: c.id,
      name: c.name,
      level: c.level,
      class: c.class,
      online: c.online,
      selected: c.id === selectedCharacterId,
      disabled: action.kind === 'disabled',
      labelKey: action.labelKey,
      titleKey: action.titleKey,
    };
  });
}
