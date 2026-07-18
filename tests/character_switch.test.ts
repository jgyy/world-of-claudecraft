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
    teardown: () => calls.push('teardown'),
    takeover: async (id: number) => {
      calls.push(`takeover:${id}`);
    },
    enter: async (character: CharacterSummary) => {
      calls.push(`enter:${character.id}`);
      entered.push(character);
    },
    onTakeoverError: () => calls.push('takeoverError'),
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

  it('confirms, tears down, takes over, then enters as offline for an online target', async () => {
    const { calls, entered, collaborators } = collabHarness();
    const target = char({ id: 3, online: true });
    await switchCharacter(target, collaborators);
    expect(calls).toEqual(['teardown', 'takeover:3', 'enter:3']);
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

  it('tears down but never enters when the takeover call rejects', async () => {
    const { calls, collaborators } = collabHarness();
    collaborators.takeover = async () => {
      calls.push('takeover:reject');
      throw new Error('taken');
    };
    const target = char({ id: 5, online: true });
    await switchCharacter(target, collaborators);
    expect(calls).toEqual(['teardown', 'takeover:reject', 'takeoverError']);
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
