// The post-cap progression dispatch (server/progression_commands.ts): the
// hone_item frame's shape-only parse, and the two-command dispatcher routing
// prestige and hone_item to the sim with nothing else laundered through.
import { describe, expect, it } from 'vitest';
import { dispatchProgressionCommand, parseHoneItemCommand } from '../server/progression_commands';

describe('parseHoneItemCommand', () => {
  it('accepts a real equipment key beside a real honing stat', () => {
    expect(parseHoneItemCommand({ slot: 'mainhand', stat: 'str' })).toEqual({
      slot: 'mainhand',
      stat: 'str',
    });
    expect(parseHoneItemCommand({ slot: 'ring2', stat: 'spi' })).toEqual({
      slot: 'ring2',
      stat: 'spi',
    });
  });

  it('drops the frame whole on any malformed token', () => {
    expect(parseHoneItemCommand({ slot: 'backpack', stat: 'str' })).toBeNull();
    expect(parseHoneItemCommand({ slot: 'mainhand', stat: 'armor' })).toBeNull();
    expect(parseHoneItemCommand({ slot: 'mainhand' })).toBeNull();
    expect(parseHoneItemCommand({ stat: 'str' })).toBeNull();
    expect(parseHoneItemCommand({ slot: 3, stat: 'str' })).toBeNull();
    expect(parseHoneItemCommand({ slot: 'mainhand', stat: ['str'] })).toBeNull();
    expect(parseHoneItemCommand({})).toBeNull();
  });
});

describe('dispatchProgressionCommand', () => {
  function sim() {
    const calls: unknown[][] = [];
    return {
      calls,
      prestige: (...args: unknown[]) => {
        calls.push(['prestige', ...args]);
        return true;
      },
      honeItem: (...args: unknown[]) => {
        calls.push(['honeItem', ...args]);
        return true;
      },
    };
  }

  it('routes prestige with the pid only', () => {
    const s = sim();
    dispatchProgressionCommand('prestige', { cmd: 'prestige', slot: 'mainhand' }, s, 9);
    expect(s.calls).toEqual([['prestige', 9]]);
  });

  it('routes a well-formed hone_item frame and drops a malformed one before the sim', () => {
    const s = sim();
    dispatchProgressionCommand('hone_item', { cmd: 'hone_item', slot: 'chest', stat: 'sta' }, s, 4);
    dispatchProgressionCommand('hone_item', { cmd: 'hone_item', slot: 'chest', stat: 'hp' }, s, 4);
    dispatchProgressionCommand('other', { cmd: 'other', slot: 'chest', stat: 'sta' }, s, 4);
    expect(s.calls).toEqual([['honeItem', 'chest', 'sta', 4]]);
  });
});
