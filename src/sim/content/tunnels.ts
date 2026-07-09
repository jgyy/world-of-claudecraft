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
// ~+23yd at z=180) before resurfacing on the Marsh side. Held at a constant
// x=-25, clear of the Eastbrook<->Fenbridge causeway (x=0), the Mirror Lake
// and Deepfen Shallows lake carves, the Fenbridge/Prowler Reeds/Brightwood
// Glade POIs, and the vale_kobold_warren tunnel above.
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
      { x: -25, y: -3.1, z: 150, radius: 3.4 },
      { x: -25, y: -4.0, z: 160, radius: 3.0 },
      { x: -25, y: -6.0, z: 170, radius: 2.8 },
      { x: -25, y: -7.0, z: 180, radius: 2.8 },
      { x: -25, y: -6.0, z: 190, radius: 2.8 },
      { x: -25, y: -4.0, z: 200, radius: 3.0 },
      { x: -25, y: -0.7, z: 209, radius: 3.4 },
    ],
  },
];
