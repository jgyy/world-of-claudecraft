import { describe, expect, it } from 'vitest';
import { isSolidVoxel, TUNNELS, tunnelBounds, voxelDensity } from '../src/sim/voxel';
import { terrainHeight } from '../src/sim/world';

describe('voxel density field', () => {
  it('matches the existing heightfield outdoors, away from any tunnel', () => {
    const seed = 1;
    const x = -400;
    const z = -400; // far from the authored tunnel
    const surface = terrainHeight(x, z, seed);
    const y = surface + 3.7; // arbitrary offset, not the surface itself
    expect(voxelDensity(x, y, z, seed)).toBeCloseTo(y - terrainHeight(x, z, seed));
    expect(voxelDensity(x, surface - 1, z, seed)).toBeLessThan(0);
    expect(voxelDensity(x, surface + 1, z, seed)).toBeGreaterThan(0);
    expect(isSolidVoxel(x, surface - 1, z, seed)).toBe(true);
    expect(isSolidVoxel(x, surface + 1, z, seed)).toBe(false);
  });

  it('is a pure function: same inputs always give the same density', () => {
    const seed = 7;
    const a = voxelDensity(12.34, -1.2, 56.78, seed);
    const b = voxelDensity(12.34, -1.2, 56.78, seed);
    expect(a).toBe(b);
  });

  it('carves open air at the center of an authored tunnel waypoint', () => {
    const seed = 1;
    const tunnel = TUNNELS[0];
    const mid = tunnel.waypoints[1];
    expect(voxelDensity(mid.x, mid.y, mid.z, seed)).toBeGreaterThan(0);
    expect(isSolidVoxel(mid.x, mid.y, mid.z, seed)).toBe(false);
  });

  it('stays solid well outside a tunnel waypoint radius', () => {
    const seed = 1;
    const tunnel = TUNNELS[0];
    const far = tunnel.waypoints[1];
    expect(isSolidVoxel(far.x + far.radius + 20, far.y, far.z, seed)).toBe(true);
  });

  it('reports a bounding box expanded by each waypoint radius, not just the center', () => {
    for (const tunnel of TUNNELS) {
      const b = tunnelBounds(tunnel);
      for (const w of tunnel.waypoints) {
        expect(b.minX).toBeLessThanOrEqual(w.x - w.radius);
        expect(b.maxX).toBeGreaterThanOrEqual(w.x + w.radius);
        expect(b.minY).toBeLessThanOrEqual(w.y - w.radius);
        expect(b.maxY).toBeGreaterThanOrEqual(w.y + w.radius);
        expect(b.minZ).toBeLessThanOrEqual(w.z - w.radius);
        expect(b.maxZ).toBeGreaterThanOrEqual(w.z + w.radius);
      }
    }
  });
});

describe('vale_marsh_ridge_tunnel (zone1 <-> zone2 through-tunnel)', () => {
  const seed = 20061; // the game's fixed world seed
  const tunnel = TUNNELS.find((t) => t.id === 'vale_marsh_ridge_tunnel')!;

  it('exists and its waypoints straddle the zone1/zone2 boundary (z=180)', () => {
    expect(tunnel).toBeDefined();
    const zs = tunnel.waypoints.map((w) => w.z);
    expect(Math.min(...zs)).toBeLessThan(180);
    expect(Math.max(...zs)).toBeGreaterThan(180);
  });

  it('carves open air at every waypoint center', () => {
    for (const w of tunnel.waypoints) {
      expect(voxelDensity(w.x, w.y, w.z, seed)).toBeGreaterThan(0);
      expect(isSolidVoxel(w.x, w.y, w.z, seed)).toBe(false);
    }
  });

  it('stays solid well outside each buried waypoint radius', () => {
    // Skip the two mouth waypoints: their y sits at the surface by design, so
    // stepping sideways lands in ordinary open air above ground, not rock.
    const buried = tunnel.waypoints.slice(1, -1);
    for (const w of buried) {
      expect(isSolidVoxel(w.x + w.radius + 20, w.y, w.z, seed)).toBe(true);
    }
  });

  it('the deepest waypoint (at the zone boundary) sits well under the ridge crest', () => {
    const crest = tunnel.waypoints.find((w) => w.z === 180)!;
    const surface = terrainHeight(crest.x, crest.z, seed);
    expect(surface - crest.y).toBeGreaterThan(25); // >25yd of solid rock overhead
  });

  it('both mouths sit visibly above the local surface, a real hillside cave opening rather than level with the flat ground', () => {
    const mouths = [tunnel.waypoints[0], tunnel.waypoints[tunnel.waypoints.length - 1]];
    for (const m of mouths) {
      const surface = terrainHeight(m.x, m.z, seed);
      const rise = m.y - surface;
      expect(rise).toBeGreaterThan(1); // clearly above ground, not flush with it
      expect(rise).toBeLessThan(6); // still close enough to read as this same hillside, not a floating arch
    }
  });
});
