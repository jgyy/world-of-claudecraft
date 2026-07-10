import { describe, expect, it } from 'vitest';
import { tunnelColumnAt, tunnelFloorAt, tunnelSpanAt } from '../src/sim/tunnel_traversal';
import { terrainHeight } from '../src/sim/world';

const SEED = 20061; // the game's fixed world seed
// vale_marsh_ridge_tunnel has both mouths at x=128 (east side), z from 66 to 294.
const TX = 128;
const CREST_Z = 180;

describe('tunnelColumnAt / tunnelFloorAt', () => {
  it('returns null far outside any tunnel footprint', () => {
    expect(tunnelColumnAt(0, CREST_Z, SEED)).toBeNull(); // the causeway, x=0
    expect(tunnelFloorAt(0, CREST_Z, SEED)).toBeNull();
  });

  it('finds a floor/ceiling band well under the ridge at the zone boundary', () => {
    const col = tunnelColumnAt(TX, CREST_Z, SEED);
    expect(col).not.toBeNull();
    expect(col!.tunnelId).toBe('vale_marsh_ridge_tunnel');
    expect(col!.ceilingY).toBeGreaterThan(col!.floorY);
    // A real chamber, not a sliver: at least the authored radius across.
    expect(col!.ceilingY - col!.floorY).toBeGreaterThan(4);
    // Both floor and ceiling sit well below the surface (buried mid-tunnel).
    const surface = terrainHeight(TX, CREST_Z, SEED);
    expect(col!.ceilingY).toBeLessThan(surface - 10);
  });

  it('floor matches at the mouths (ceiling opens to sky there)', () => {
    const col = tunnelColumnAt(TX, 66, SEED);
    expect(col).not.toBeNull();
    expect(col!.ceilingY).toBe(Infinity);
  });

  it('is a pure function: same inputs always give the same column', () => {
    const a = tunnelColumnAt(TX, 165, SEED);
    const b = tunnelColumnAt(TX, 165, SEED);
    expect(a).toEqual(b);
  });
});

describe('tunnelSpanAt', () => {
  it('is present when standing inside the carved interior', () => {
    const col = tunnelColumnAt(TX, CREST_Z, SEED)!;
    const midY = (col.floorY + col.ceilingY) / 2;
    expect(tunnelSpanAt(TX, midY, CREST_Z, SEED)).not.toBeNull();
  });

  it('is absent when standing on the surface high above a buried stretch', () => {
    const surface = terrainHeight(TX, CREST_Z, SEED);
    expect(tunnelSpanAt(TX, surface, CREST_Z, SEED)).toBeNull();
  });

  it('is absent well outside the tunnel footprint entirely', () => {
    expect(tunnelSpanAt(0, 0, CREST_Z, SEED)).toBeNull();
  });
});
