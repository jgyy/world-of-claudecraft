import { describe, expect, it } from 'vitest';
import {
  delveModuleInteriorKey,
  delveModuleOrderKey,
  isDelveSlotInteriorKey,
  shouldRetireDelveSlot,
} from '../src/render/delve_interior_residency_core';

describe('delveModuleInteriorKey', () => {
  it('matches the format every renderer.ts call site expects', () => {
    expect(delveModuleInteriorKey('drowned_litany', 3, 'litany_apse')).toBe(
      'delve:drowned_litany:3:litany_apse',
    );
  });
});

describe('isDelveSlotInteriorKey', () => {
  it('matches every key built for the given delve+slot, any moduleId', () => {
    expect(isDelveSlotInteriorKey('delve:drowned_litany:3:litany_apse', 'drowned_litany', 3)).toBe(
      true,
    );
    expect(
      isDelveSlotInteriorKey('delve:drowned_litany:3:litany_sluice', 'drowned_litany', 3),
    ).toBe(true);
  });

  it('does not match a different slot on the same delve', () => {
    expect(isDelveSlotInteriorKey('delve:drowned_litany:4:litany_apse', 'drowned_litany', 3)).toBe(
      false,
    );
  });

  it('does not match a different delve on the same slot number', () => {
    expect(
      isDelveSlotInteriorKey('delve:collapsed_reliquary:3:reliquary_finale', 'drowned_litany', 3),
    ).toBe(false);
  });

  it('does not match a non-delve interior key', () => {
    expect(isDelveSlotInteriorKey('reliquary_finale:3', 'drowned_litany', 3)).toBe(false);
    expect(isDelveSlotInteriorKey('arena:3', 'drowned_litany', 3)).toBe(false);
  });
});

describe('delveModuleOrderKey / shouldRetireDelveSlot', () => {
  it('the SAME module order (a rejoin of the run already in progress) never retires', () => {
    const order = ['litany_baptistry', 'litany_sluice', 'litany_ledger', 'litany_apse'];
    const key = delveModuleOrderKey(order);
    expect(shouldRetireDelveSlot(key, delveModuleOrderKey([...order]))).toBe(false);
  });

  it('a RE-SHUFFLED order (a new run reusing a recycled slot) retires', () => {
    const first = delveModuleOrderKey(['litany_baptistry', 'litany_sluice', 'litany_apse']);
    const second = delveModuleOrderKey(['litany_sluice', 'litany_baptistry', 'litany_apse']);
    expect(shouldRetireDelveSlot(first, second)).toBe(true);
  });

  it('a different SUBSET of modules (different moduleCount) retires', () => {
    const first = delveModuleOrderKey(['litany_baptistry', 'litany_sluice', 'litany_apse']);
    const second = delveModuleOrderKey(['litany_baptistry', 'litany_apse']);
    expect(shouldRetireDelveSlot(first, second)).toBe(true);
  });

  it('the first build of a never-before-used slot always retires (no-op: nothing tracked yet)', () => {
    expect(shouldRetireDelveSlot(undefined, delveModuleOrderKey(['litany_apse']))).toBe(true);
  });
});
