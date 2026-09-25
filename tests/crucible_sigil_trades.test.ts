// The Crucible Quartermaster sigil-for-sigil trade table: derived, not
// hand-listed, so these pins hold the derivation to the documented shape
// (3 flavors x 5 slots x 4 same-flavor targets = 60 ordered pairs).

import { describe, expect, it } from 'vitest';
import { CRUCIBLE_SIGIL_TRADES } from '../src/sim/content/crucible_sigil_trades';
import { IGNIVAR_SIGIL_ITEMS } from '../src/sim/content/ignivar_loot';

describe('CRUCIBLE_SIGIL_TRADES', () => {
  it('has exactly 60 ordered pairs (3 flavors x 5 slots x 4 targets)', () => {
    expect(CRUCIBLE_SIGIL_TRADES.length).toBe(60);
  });

  it('every pair references a real sigil id', () => {
    for (const { fromSigilId, toSigilId } of CRUCIBLE_SIGIL_TRADES) {
      expect(IGNIVAR_SIGIL_ITEMS[fromSigilId], fromSigilId).toBeTruthy();
      expect(IGNIVAR_SIGIL_ITEMS[toSigilId], toSigilId).toBeTruthy();
    }
  });

  it('never pairs a sigil with itself', () => {
    expect(CRUCIBLE_SIGIL_TRADES.some((o) => o.fromSigilId === o.toSigilId)).toBe(false);
  });

  it('only pairs sigils of the SAME flavor (the class-gate invariant)', () => {
    for (const { fromSigilId, toSigilId } of CRUCIBLE_SIGIL_TRADES) {
      const fromFlavor = fromSigilId.split('_')[1];
      const toFlavor = toSigilId.split('_')[1];
      expect(toFlavor, `${fromSigilId} -> ${toSigilId}`).toBe(fromFlavor);
      expect(IGNIVAR_SIGIL_ITEMS[toSigilId].requiredClass).toEqual(
        IGNIVAR_SIGIL_ITEMS[fromSigilId].requiredClass,
      );
    }
  });

  it('is symmetric: every pair has a reverse pair', () => {
    const keys = new Set(CRUCIBLE_SIGIL_TRADES.map((o) => `${o.fromSigilId}>${o.toSigilId}`));
    for (const { fromSigilId, toSigilId } of CRUCIBLE_SIGIL_TRADES) {
      expect(keys.has(`${toSigilId}>${fromSigilId}`), `${toSigilId} -> ${fromSigilId}`).toBe(true);
    }
  });

  it('every sigil trades into exactly the other four slots of its own flavor', () => {
    for (const fromSigilId of Object.keys(IGNIVAR_SIGIL_ITEMS)) {
      const flavor = fromSigilId.split('_')[1];
      const targets = CRUCIBLE_SIGIL_TRADES.filter((o) => o.fromSigilId === fromSigilId).map(
        (o) => o.toSigilId,
      );
      const expected = Object.keys(IGNIVAR_SIGIL_ITEMS).filter(
        (id) => id !== fromSigilId && id.split('_')[1] === flavor,
      );
      expect(targets.sort(), fromSigilId).toEqual(expected.sort());
    }
  });
});
