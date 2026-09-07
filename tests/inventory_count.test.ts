// The bag-count leaf (src/sim/inventory_count.ts): the plain count sums every
// stack, the fungible-only reading skips instanced slots (#1165).

import { describe, expect, it } from 'vitest';
import { countItemIn } from '../src/sim/inventory_count';
import type { InvSlot } from '../src/sim/types';

const bags: InvSlot[] = [
  { itemId: 'rune_of_passage', count: 3 },
  { itemId: 'waystone_ticket', count: 2 },
  { itemId: 'rune_of_passage', count: 1, instance: { signer: 'x' } as InvSlot['instance'] },
];

describe('countItemIn', () => {
  it('sums every stack of the id and nothing else', () => {
    expect(countItemIn(bags, 'rune_of_passage')).toBe(4);
    expect(countItemIn(bags, 'waystone_ticket')).toBe(2);
    expect(countItemIn(bags, 'nothing')).toBe(0);
    expect(countItemIn([], 'rune_of_passage')).toBe(0);
  });

  it('the fungible-only reading skips instanced slots', () => {
    expect(countItemIn(bags, 'rune_of_passage', true)).toBe(3);
    expect(countItemIn(bags, 'waystone_ticket', true)).toBe(2);
  });
});
