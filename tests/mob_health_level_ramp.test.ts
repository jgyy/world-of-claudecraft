import { describe, expect, it } from 'vitest';
import { createMob } from '../src/sim/entity';
import type { MobTemplate } from '../src/sim/types';

// Trash mobs used to be nearly flat across the 16-20 level band (hpPerLevel is
// small relative to hpBase), so a level-cap player could clear them in one
// ability. This pins the level 16 -> MAX_LEVEL (20) ramp that makes a
// non-elite mob's authored HP grow to 2.5x by the level cap, while leaving
// elite/rare/boss templates (which already carry their own hand-tuned 2.3x
// multiplier) untouched.

const NON_ELITE: MobTemplate = {
  id: 'ramp_test_trash',
  name: 'Ramp Test Trash',
  minLevel: 1,
  maxLevel: 20,
  family: 'humanoid',
  hpBase: 60,
  hpPerLevel: 19,
  dmgBase: 10,
  dmgPerLevel: 1,
  attackSpeed: 2,
  armorPerLevel: 3,
  moveSpeed: 3,
  aggroRadius: 10,
  loot: [],
  scale: 1,
  color: 0xffffff,
};

const ELITE: MobTemplate = {
  ...NON_ELITE,
  id: 'ramp_test_elite',
  name: 'Ramp Test Elite',
  elite: true,
};

const OPTED_OUT: MobTemplate = {
  ...NON_ELITE,
  id: 'ramp_test_opted_out',
  name: 'Ramp Test Opted Out',
  noHealthRamp: true,
};

const pos = { x: 0, y: 0, z: 0 };
const rawHpAt = (level: number) => NON_ELITE.hpBase + NON_ELITE.hpPerLevel * (level - 1);

describe('non-elite mob health ramp toward the level cap', () => {
  it('leaves levels at or below 16 exactly at the unramped formula', () => {
    expect(createMob(1, NON_ELITE, 10, pos).maxHp).toBe(rawHpAt(10));
    expect(createMob(1, NON_ELITE, 16, pos).maxHp).toBe(rawHpAt(16));
  });

  it('leaves levels above the level cap unramped (heroic-scaled instance adds)', () => {
    // Heroic dungeons deliberately spawn adds above MAX_LEVEL (e.g. level 22) and
    // already carry their own separate healthMultiplier; this world-content ramp
    // must not compound on top of that.
    const rawHpAt22 = NON_ELITE.hpBase + NON_ELITE.hpPerLevel * (22 - 1);
    expect(createMob(1, NON_ELITE, 22, pos).maxHp).toBe(rawHpAt22);
  });

  it('scales gradually between level 16 and the level cap', () => {
    const hp16 = createMob(1, NON_ELITE, 16, pos).maxHp;
    const hp17 = createMob(1, NON_ELITE, 17, pos).maxHp;
    const hp18 = createMob(1, NON_ELITE, 18, pos).maxHp;
    const hp19 = createMob(1, NON_ELITE, 19, pos).maxHp;
    const hp20 = createMob(1, NON_ELITE, 20, pos).maxHp;
    // strictly increasing, and each step outpaces the flat per-level growth
    // the old formula alone would have produced.
    expect(hp17).toBeGreaterThan(hp16);
    expect(hp18).toBeGreaterThan(hp17);
    expect(hp19).toBeGreaterThan(hp18);
    expect(hp20).toBeGreaterThan(hp19);
    expect(hp20 - hp19).toBeGreaterThan(hp17 - hp16);
  });

  it('reaches exactly 2.5x the unramped value at the level cap', () => {
    const hp20 = createMob(1, NON_ELITE, 20, pos).maxHp;
    expect(hp20).toBe(Math.round(rawHpAt(20) * 2.5));
  });

  it('lands close to the bug report anchors (~400 at 16, ~1000 at the cap)', () => {
    const hp16 = createMob(1, NON_ELITE, 16, pos).maxHp;
    const hp20 = createMob(1, NON_ELITE, 20, pos).maxHp;
    expect(hp16).toBeGreaterThanOrEqual(300);
    expect(hp16).toBeLessThanOrEqual(420);
    expect(hp20).toBeGreaterThanOrEqual(950);
    expect(hp20).toBeLessThanOrEqual(1150);
  });
});

describe('noHealthRamp opts a non-elite template out of the ramp entirely', () => {
  it('stays at the unramped formula at the level cap, unlike an equivalent non-opted-out template', () => {
    const optedOutHp20 = createMob(1, OPTED_OUT, 20, pos).maxHp;
    const rampedHp20 = createMob(1, NON_ELITE, 20, pos).maxHp;
    expect(optedOutHp20).toBe(rawHpAt(20));
    expect(optedOutHp20).toBeLessThan(rampedHp20);
  });
});

describe('elite mobs are unaffected by the new ramp', () => {
  it('keeps the existing 2.3x elite multiplier at the level cap, with no extra ramp', () => {
    const eliteHp20 = createMob(1, ELITE, 20, pos).maxHp;
    expect(eliteHp20).toBe(Math.round(rawHpAt(20) * 2.3));
  });

  it('produces the same elite HP at level 20 whether or not the ramp window applies', () => {
    // Elite HP at 16 and 20 both follow the flat 2.3x rule; the ramp must not
    // widen the gap between them the way it does for non-elite templates.
    const eliteHp16 = createMob(1, ELITE, 16, pos).maxHp;
    const eliteHp20 = createMob(1, ELITE, 20, pos).maxHp;
    expect(eliteHp20 - eliteHp16).toBe(
      Math.round(rawHpAt(20) * 2.3) - Math.round(rawHpAt(16) * 2.3),
    );
  });
});
