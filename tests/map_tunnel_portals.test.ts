import { describe, expect, it } from 'vitest';
import type { TunnelVolume } from '../src/sim/content/tunnels';
import { overworldTunnelMouths } from '../src/ui/map_tunnel_portals';

const TUNNEL: TunnelVolume = {
  id: 'test_tunnel',
  waypoints: [
    { x: 10, y: 0, z: 5, radius: 3, mound: true },
    { x: 12, y: -2, z: 10, radius: 3 },
    { x: 10, y: 0, z: 15, radius: 3, mound: true },
  ],
};

describe('overworldTunnelMouths', () => {
  it('returns only the mound waypoints, never buried interior waypoints', () => {
    const mouths = overworldTunnelMouths([TUNNEL], 0, 100);
    expect(mouths).toEqual([
      { tunnelId: 'test_tunnel', x: 10, z: 5 },
      { tunnelId: 'test_tunnel', x: 10, z: 15 },
    ]);
  });

  it('filters mouths to the given [zMin, zMax) band, mirroring dungeon portals', () => {
    expect(overworldTunnelMouths([TUNNEL], 0, 10)).toEqual([
      { tunnelId: 'test_tunnel', x: 10, z: 5 },
    ]);
    expect(overworldTunnelMouths([TUNNEL], 10, 20)).toEqual([
      { tunnelId: 'test_tunnel', x: 10, z: 15 },
    ]);
  });

  it('returns nothing for a tunnel with no mound waypoints', () => {
    const noMound: TunnelVolume = {
      id: 'buried',
      waypoints: [
        { x: 0, y: 0, z: 0, radius: 3 },
        { x: 1, y: 0, z: 1, radius: 3 },
      ],
    };
    expect(overworldTunnelMouths([noMound], -100, 100)).toEqual([]);
  });
});
