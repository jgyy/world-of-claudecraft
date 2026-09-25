// src/ui/item_affix_name.ts: composes a rolled affix's suffix onto an
// already-resolved base item name.
import { describe, expect, it } from 'vitest';
import { ITEM_AFFIXES_GREEN } from '../src/sim/content/item_affixes';
import type { ItemInstancePayload } from '../src/sim/types';
import { affixSuffixedName } from '../src/ui/item_affix_name';

describe('affixSuffixedName', () => {
  it('returns the base name unchanged for an undefined instance', () => {
    expect(affixSuffixedName('Platinum Sword', undefined)).toBe('Platinum Sword');
  });

  it('returns the base name unchanged for an instance with no affixId', () => {
    const instance: ItemInstancePayload = { rolled: { stats: { str: 5 } } };
    expect(affixSuffixedName('Platinum Sword', instance)).toBe('Platinum Sword');
  });

  it('returns the base name unchanged for an unknown affixId (a retuned pool, never a throw)', () => {
    const instance: ItemInstancePayload = { affixId: 'not_a_real_affix' };
    expect(affixSuffixedName('Platinum Sword', instance)).toBe('Platinum Sword');
  });

  it('appends the localized suffix for a known affixId', () => {
    const affix = ITEM_AFFIXES_GREEN[0];
    const instance: ItemInstancePayload = { affixId: affix.id };
    const name = affixSuffixedName('Platinum Sword', instance);
    expect(name.startsWith('Platinum Sword ')).toBe(true);
    expect(name.length).toBeGreaterThan('Platinum Sword '.length);
  });

  it('composes a distinct name per affix id', () => {
    const names = new Set(
      ITEM_AFFIXES_GREEN.map((affix) => affixSuffixedName('Platinum Sword', { affixId: affix.id })),
    );
    expect(names.size).toBe(ITEM_AFFIXES_GREEN.length);
  });
});
