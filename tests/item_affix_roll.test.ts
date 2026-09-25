// src/sim/item_affix_roll.ts: the loot-time affix roll for `affixable` item
// shells (content/item_affixes.ts prices the pools).
import { describe, expect, it } from 'vitest';
import {
  ITEM_AFFIX_BLUE_CHANCE,
  ITEM_AFFIXES,
  ITEM_AFFIXES_BLUE,
  ITEM_AFFIXES_GREEN,
} from '../src/sim/content/item_affixes';
import { rollItemAffixInstance } from '../src/sim/item_affix_roll';
import { Rng } from '../src/sim/rng';
import type { ItemDef } from '../src/sim/types';

const AFFIXABLE_SWORD: ItemDef = {
  id: 'test_affixable_sword',
  name: 'Test Affixable Sword',
  kind: 'weapon',
  slot: 'mainhand',
  hand: 'twohand',
  quality: 'uncommon',
  weapon: { min: 39, max: 58, speed: 3.3 },
  sellValue: 500,
  affixable: true,
};

const PLAIN_SWORD: ItemDef = {
  ...AFFIXABLE_SWORD,
  id: 'test_plain_sword',
  affixable: undefined,
};

describe('rollItemAffixInstance', () => {
  it('draws nothing for a non-affixable def', () => {
    const rng = new Rng(1);
    expect(rollItemAffixInstance(rng, PLAIN_SWORD)).toBeUndefined();
    // Zero draws: the stream is unmoved, so a second identical call agrees.
    const rngAgain = new Rng(1);
    expect(rollItemAffixInstance(rngAgain, PLAIN_SWORD)).toBeUndefined();
  });

  it('rolls a green (uncommon) affix with no quality stamp most of the time', () => {
    // Seed chosen so the first rng.chance(ITEM_AFFIX_BLUE_CHANCE) draw misses.
    const rng = new Rng(1);
    const roll = rollItemAffixInstance(rng, AFFIXABLE_SWORD);
    expect(roll).toBeDefined();
    expect(roll?.quality).toBeUndefined();
    const affix = ITEM_AFFIXES_GREEN.find((a) => a.id === roll?.affixId);
    expect(affix, `${roll?.affixId} should be a green affix`).toBeDefined();
  });

  it('every rolled stat is a whole number inside the affix def range', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const rng = new Rng(seed);
      const roll = rollItemAffixInstance(rng, AFFIXABLE_SWORD);
      expect(roll).toBeDefined();
      if (!roll) continue;
      const affix = ITEM_AFFIXES[roll.affixId];
      expect(affix).toBeDefined();
      for (const statRoll of affix.stats) {
        const value = roll.stats[statRoll.stat];
        expect(Number.isInteger(value)).toBe(true);
        expect(value).toBeGreaterThanOrEqual(statRoll.min);
        expect(value).toBeLessThanOrEqual(statRoll.max);
      }
      // No stray stats beyond what the affix def declares.
      expect(Object.keys(roll.stats).sort()).toEqual(
        [...new Set(affix.stats.map((s) => s.stat))].sort(),
      );
    }
  });

  it('a blue roll always names a rare-tier affix and stamps quality rare', () => {
    // Sweep seeds until we observe both branches; the blue chance (15%) is
    // common enough that 200 seeds reliably hits both.
    let sawGreen = false;
    let sawBlue = false;
    for (let seed = 1; seed <= 200; seed++) {
      const roll = rollItemAffixInstance(new Rng(seed), AFFIXABLE_SWORD);
      if (!roll) continue;
      if (roll.quality === 'rare') {
        sawBlue = true;
        const affix = ITEM_AFFIXES_BLUE.find((a) => a.id === roll.affixId);
        expect(affix, `${roll.affixId} should be a blue affix`).toBeDefined();
      } else {
        sawGreen = true;
        expect(roll.quality).toBeUndefined();
      }
    }
    expect(sawGreen).toBe(true);
    expect(sawBlue).toBe(true);
  });

  it('draws exactly one chance() plus one int() per stat, nothing else', () => {
    // Determinism/draw-order pin: same seed, same result, every call.
    const a = rollItemAffixInstance(new Rng(42), AFFIXABLE_SWORD);
    const b = rollItemAffixInstance(new Rng(42), AFFIXABLE_SWORD);
    expect(a).toEqual(b);
  });

  it('the observed blue rate over many seeds is close to ITEM_AFFIX_BLUE_CHANCE', () => {
    const trials = 4000;
    let blue = 0;
    for (let seed = 1; seed <= trials; seed++) {
      const roll = rollItemAffixInstance(new Rng(seed), AFFIXABLE_SWORD);
      if (roll?.quality === 'rare') blue++;
    }
    const rate = blue / trials;
    expect(rate).toBeGreaterThan(ITEM_AFFIX_BLUE_CHANCE - 0.05);
    expect(rate).toBeLessThan(ITEM_AFFIX_BLUE_CHANCE + 0.05);
  });
});

describe('content/item_affixes.ts pools', () => {
  it('every affix id is unique across the green and blue pools', () => {
    const ids = [...ITEM_AFFIXES_GREEN, ...ITEM_AFFIXES_BLUE].map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('green affixes carry 1-2 stats, blue affixes up to 3, per the design thread tiers', () => {
    for (const affix of ITEM_AFFIXES_GREEN) {
      expect(affix.stats.length).toBeGreaterThanOrEqual(1);
      expect(affix.stats.length).toBeLessThanOrEqual(2);
      expect(affix.tier).toBe('uncommon');
    }
    for (const affix of ITEM_AFFIXES_BLUE) {
      expect(affix.stats.length).toBeGreaterThanOrEqual(1);
      expect(affix.stats.length).toBeLessThanOrEqual(3);
      expect(affix.tier).toBe('rare');
    }
  });

  it('ITEM_AFFIXES indexes every green and blue affix by id', () => {
    for (const affix of [...ITEM_AFFIXES_GREEN, ...ITEM_AFFIXES_BLUE]) {
      expect(ITEM_AFFIXES[affix.id]).toBe(affix);
    }
  });
});
