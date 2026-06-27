import { describe, expect, it } from 'vitest';
import { comboScaledValue, MAX_COMBO } from '../src/sim/combat/finisher_scale';

describe('comboScaledValue', () => {
  it('returns the authored value unchanged for non-finishers (spentCombo <= 0)', () => {
    // Corruption/Moonfire path: spendsCombo false -> spentCombo 0.
    expect(comboScaledValue(96, 0)).toBe(96);
    expect(comboScaledValue(170, -1)).toBe(170);
  });

  it('delivers the full authored value at the 5-point maximum', () => {
    expect(comboScaledValue(96, 5)).toBe(96); // Rupture total
    expect(comboScaledValue(170, 5)).toBe(170); // Expose Armor armor
    expect(comboScaledValue(60, 5)).toBe(60); // Rip total
  });

  it('scales proportionally for partial combo spends', () => {
    // Rupture total 96 over 5 points => ~19.2 per point.
    expect(comboScaledValue(96, 1)).toBe(19); // round(19.2)
    expect(comboScaledValue(96, 3)).toBe(58); // round(57.6)
    // Expose Armor armor 170 => 34 per point, exact.
    expect(comboScaledValue(170, 1)).toBe(34);
    expect(comboScaledValue(170, 2)).toBe(68);
    expect(comboScaledValue(170, 4)).toBe(136);
  });

  it('is monotonic in combo points: more points never deliver less', () => {
    for (const base of [60, 96, 170]) {
      let prev = 0;
      for (let cp = 1; cp <= MAX_COMBO; cp++) {
        const v = comboScaledValue(base, cp);
        expect(v).toBeGreaterThanOrEqual(prev);
        prev = v;
      }
    }
  });

  it('floors at 1 so even a tiny 1-point finisher does something', () => {
    expect(comboScaledValue(3, 1)).toBe(1); // round(0.6) would be 1 anyway, but small totals never vanish
    expect(comboScaledValue(2, 1)).toBeGreaterThanOrEqual(1);
  });

  it('clamps combo above the maximum to the authored value', () => {
    expect(comboScaledValue(96, 7)).toBe(96);
  });

  it('is deterministic: same inputs, same output', () => {
    expect(comboScaledValue(96, 3)).toBe(comboScaledValue(96, 3));
  });
});
