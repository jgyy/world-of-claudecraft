import { describe, expect, it } from 'vitest';
import { artisanRowPreloadInternalsForTest } from '../src/render/artisan_row_props';
import { CRAFT_RING } from '../src/sim/content/professions';

const { assetUrl, targetHeight, placements } = artisanRowPreloadInternalsForTest;

describe('artisan row props', () => {
  it('every placement kind has a matching asset URL and target height', () => {
    for (const p of placements) {
      expect(assetUrl[p.kind]).toMatch(/^\/models\/props\/.+\.glb$/);
      expect(targetHeight[p.kind]).toBeGreaterThan(0);
    }
  });

  it('has exactly one placement per asset kind (no duplicates)', () => {
    const kinds = placements.map((p) => p.kind);
    expect(new Set(kinds).size).toBe(kinds.length);
    expect(kinds.length).toBe(Object.keys(assetUrl).length);
  });

  it('covers a crafting or gathering prop for every profession still missing world flavor', () => {
    // weaponcrafting/armorcrafting already get an anvil at Smith Haldren's stall
    // (props.ts); every other profession id should map to a placement kind here.
    const craftIds = CRAFT_RING.map((c) => c.id).filter(
      (id) => id !== 'weaponcrafting' && id !== 'armorcrafting',
    );
    const gatherIds = ['mining', 'herbalism'];
    for (const id of [...craftIds, ...gatherIds]) {
      const matches = placements.some((p) => p.kind.startsWith(id));
      expect(matches, `no artisan row prop for profession "${id}"`).toBe(true);
    }
  });

  it('places every prop within the zone1 town bounds, clear of the market stall/house footprints', () => {
    for (const p of placements) {
      // Stays inside a loose town radius around Smith Haldren's stall (9.5, 17.5).
      expect(Math.hypot(p.x - 9.5, p.z - 17.5)).toBeLessThan(14);
      // Clears the stall's own footprint (r=1.7) and the house at (10, 12).
      expect(Math.hypot(p.x - 9.5, p.z - 17.5)).toBeGreaterThan(1.7);
      expect(Math.hypot(p.x - 10, p.z - 12)).toBeGreaterThan(3.5);
    }
  });
});
