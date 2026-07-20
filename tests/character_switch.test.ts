import { describe, expect, it } from 'vitest';
import { switchCharacter } from '../src/net/character_switch';
import type { CharacterSummary } from '../src/net/online';

function char(overrides: Partial<CharacterSummary> & { id: number }): CharacterSummary {
  return {
    name: `Char${overrides.id}`,
    class: 'warrior',
    level: 1,
    online: false,
    forceRename: false,
    ...overrides,
  } as CharacterSummary;
}

function collabHarness() {
  const calls: string[] = [];
  const entered: CharacterSummary[] = [];
  const collaborators = {
    confirmTakeOver: () => true,
    isSwitchable: () => true,
    teardown: () => calls.push('teardown'),
    takeover: async (id: number) => {
      calls.push(`takeover:${id}`);
    },
    enter: async (character: CharacterSummary) => {
      calls.push(`enter:${character.id}`);
      entered.push(character);
    },
    onTakeoverError: () => calls.push('takeoverError'),
    onEnterError: () => calls.push('enterError'),
  };
  return { calls, entered, collaborators };
}

describe('switchCharacter', () => {
  it('tears down then enters directly for an offline target, without taking over', async () => {
    const { calls, collaborators } = collabHarness();
    const target = char({ id: 2, online: false });
    await switchCharacter(target, collaborators);
    expect(calls).toEqual(['teardown', 'enter:2']);
  });

  it('confirms, takes over, tears down, then enters as offline for an online target', async () => {
    const { calls, entered, collaborators } = collabHarness();
    const target = char({ id: 3, online: true });
    await switchCharacter(target, collaborators);
    expect(calls).toEqual(['takeover:3', 'teardown', 'enter:3']);
    // Regression pin: after a successful takeover, entry must not re-request
    // another takeover confirm on the character's own new session.
    expect(entered[0]?.online).toBe(false);
  });

  it('does nothing (no teardown, no enter) when the take-over confirm is declined', async () => {
    const { calls, collaborators } = collabHarness();
    collaborators.confirmTakeOver = () => false;
    const target = char({ id: 4, online: true });
    await switchCharacter(target, collaborators);
    expect(calls).toEqual([]);
  });

  // Regression: teardown used to run BEFORE the takeover request, so a
  // transient takeover failure (network blip, 5xx) left the current session
  // already torn down with nothing to fall back into. Takeover now runs
  // first, so a rejection never tears down the in-flight session at all.
  it('never tears down and never enters when the takeover call rejects', async () => {
    const { calls, collaborators } = collabHarness();
    collaborators.takeover = async () => {
      calls.push('takeover:reject');
      throw new Error('taken');
    };
    const target = char({ id: 5, online: true });
    await switchCharacter(target, collaborators);
    expect(calls).toEqual(['takeover:reject', 'takeoverError']);
  });

  // Regression: switchCharacter used to await enter() with no rejection
  // handler, so a failure there (enterWorld's prepareWorldEntry, or the
  // ClientWorld/WebSocket construction it drives) escaped as an unhandled
  // rejection with teardown already run: no world, no Welcome Screen, no
  // recovery overlay. onEnterError now catches it.
  it('calls onEnterError, after teardown, when enter rejects', async () => {
    const { calls, collaborators } = collabHarness();
    collaborators.enter = async () => {
      calls.push('enter:reject');
      throw new Error('entry failed');
    };
    const target = char({ id: 9, online: false });
    await switchCharacter(target, collaborators);
    expect(calls).toEqual(['teardown', 'enter:reject', 'enterError']);
  });

  // Regression: teardown ran unconditionally after the takeover await, so a
  // disconnect, or the in-flight session proceeding to the game, DURING that
  // round trip left teardown tearing down a session something else already
  // handled (double-mounting the Welcome Screen, or building a new session
  // behind a terminal disconnect overlay). isSwitchable is now re-checked
  // right after takeover resolves; when it reports false, the session was
  // already claimed by something else mid-takeover, so teardown must never run.
  it('never tears down or enters when the session is no longer switchable after takeover resolves', async () => {
    const { calls, collaborators } = collabHarness();
    collaborators.isSwitchable = () => false;
    const target = char({ id: 7, online: true });
    await switchCharacter(target, collaborators);
    expect(calls).toEqual(['takeover:7']);
  });

  it('never confirms for an already-offline target', async () => {
    const { collaborators } = collabHarness();
    let confirmed = false;
    collaborators.confirmTakeOver = () => {
      confirmed = true;
      return true;
    };
    await switchCharacter(char({ id: 6, online: false }), collaborators);
    expect(confirmed).toBe(false);
  });

  // Regression: hasBegunWorldEntry in src/main.ts used to be a page-load
  // one-shot latch that nothing ever reset, so the SECOND enterWorld() call
  // in a row (A -> B, then B -> C) bailed out of prepareWorldEntry() and
  // silently dead-ended with no world, no welcome screen, and no error
  // overlay. Each switch here uses its own teardown/enter collaborators (the
  // way main.ts's switchWelcomeCharacter closure does per call), so this
  // pins that BOTH switches actually reach enter, not just the first.
  it('tears down and enters correctly across two switches in a row', async () => {
    const first = collabHarness();
    await switchCharacter(char({ id: 10, online: false }), first.collaborators);
    expect(first.calls).toEqual(['teardown', 'enter:10']);

    const second = collabHarness();
    await switchCharacter(char({ id: 11, online: false }), second.collaborators);
    expect(second.calls).toEqual(['teardown', 'enter:11']);
  });
});
