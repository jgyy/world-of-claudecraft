// Which hand-authored tunnel/cave entrance mounds get a world-map marker, for
// a given zone band. Pure data logic, no DOM: the HUD map loop is the thin
// consumer (mirrors map_dungeon_portals.ts's overworldDungeonPortals).
//
// Only a tunnel waypoint marked `mound` is a real, findable entrance a player
// walks up to outdoors (see TunnelWaypoint.mound in content/tunnels.ts); the
// buried interior waypoints between two mouths never get a marker.
import type { TunnelVolume } from '../sim/content/tunnels';

export interface MapTunnelMouth {
  tunnelId: string;
  x: number;
  z: number;
}

// Mouths to draw for the zone whose band is [zMin, zMax). Matches the map
// loop's own bounds test (mouth z in [zMin, zMax)).
export function overworldTunnelMouths(
  tunnels: readonly TunnelVolume[],
  zMin: number,
  zMax: number,
): MapTunnelMouth[] {
  const mouths: MapTunnelMouth[] = [];
  for (const tunnel of tunnels) {
    for (const w of tunnel.waypoints) {
      if (!w.mound) continue;
      if (w.z < zMin || w.z >= zMax) continue;
      mouths.push({ tunnelId: tunnel.id, x: w.x, z: w.z });
    }
  }
  return mouths;
}
