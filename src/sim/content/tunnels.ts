// Hand-authored tunnel/cave volumes carved into the voxel density field
// (see ../voxel.ts). Declarative data, no RNG: a tunnel is a capsule path
// (a polyline of waypoints, each with its own radius) subtracted from the
// solid terrain. Append-only content table, same spirit as content/dungeons.ts.
export interface TunnelWaypoint {
  x: number;
  y: number;
  z: number;
  radius: number;
}

export interface TunnelVolume {
  id: string;
  waypoints: TunnelWaypoint[];
}

// A short kobold-warren tunnel under the Vale foothills, mouth open to the
// surface near (60, 150) then dipping underground and dead-ending in a small
// chamber. Coordinates sit well clear of zone hubs/camps/roads.
//
// A through-tunnel burrowing under the ridge that straddles the Eastbrook
// Vale / Mirefen Marsh border (zone1/zone2 meet at z=180): both mouths sit
// just above the local terrainHeight so the carve reads as a natural cave
// opening, then the path dips well under the ridge crest (which rises to
// ~+36yd at z=180) before resurfacing on the Marsh side. Held at a constant
// x=110, on the EAST side of both zones (well clear of the Eastbrook<->
// Fenbridge causeway at x=0, both zones' hubs, every lake, the Boar Meadow/
// Bandit Camp/Fallen Chapel/Brightwood Glade/Widow Thicket POIs, and the
// vale_kobold_warren tunnel to the west). Radii are double the tunnel's
// first pass (a real walk-in cave, not a crawlspace): floor to ceiling is
// roughly 2x each waypoint's radius, comfortably clearing a standing player.
export const TUNNELS: TunnelVolume[] = [
  {
    id: 'vale_kobold_warren',
    waypoints: [
      { x: 60, y: 6, z: 150, radius: 3.2 },
      { x: 66, y: 1, z: 158, radius: 2.8 },
      { x: 74, y: -4, z: 168, radius: 2.6 },
      { x: 84, y: -6, z: 176, radius: 3.6 },
    ],
  },
  {
    id: 'vale_marsh_ridge_tunnel',
    waypoints: [
      { x: 110, y: 0.9, z: 146, radius: 6.0 },
      { x: 110, y: -3.0, z: 155, radius: 5.6 },
      { x: 110, y: -9.0, z: 165, radius: 5.8 },
      { x: 110, y: -15.0, z: 175, radius: 6.2 },
      { x: 110, y: -17.0, z: 180, radius: 6.4 },
      { x: 110, y: -15.0, z: 185, radius: 6.2 },
      { x: 110, y: -9.0, z: 195, radius: 5.8 },
      { x: 110, y: -3.0, z: 205, radius: 5.6 },
      { x: 110, y: 0.3, z: 214, radius: 6.0 },
    ],
  },
];
