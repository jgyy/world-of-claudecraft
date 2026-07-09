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
// clearly ABOVE the local terrainHeight (not barely breaching it), reading
// as a real, visible cave mouth cut into the rising hillside rather than a
// hole level with the flat ground. Realistic on purpose, not just tall: each
// mouth's (x, z) sits exactly where the ridge is already starting to climb
// (z=146/214, where terrainHeight is rising a few yards per step toward the
// z=180 crest), so tunnel_overlay.ts's single combined terrain+cave mesh
// naturally slopes the grass UP to meet the raised opening, the same way a
// real hillside cave mouth sits above the surrounding low ground, never a
// floating arch with no slope leading to it. The path then dips well under
// the ridge crest (which rises to ~+36yd at z=180) before resurfacing on the
// Marsh side. Held at a constant x=110, on the EAST side of both zones (well
// clear of the Eastbrook<->Fenbridge causeway at x=0, both zones' hubs,
// every lake, the Boar Meadow/Bandit Camp/Fallen Chapel/Brightwood Glade/
// Widow Thicket POIs, and the vale_kobold_warren tunnel to the west). Both
// the depth (the vertical drop from mouth level to the crest, doubled from
// the first pass) and the radius (bumped up further) are generous: a real,
// roomy walk-in cave, deep enough under the ridge that even a wide-angle
// shot at the crest still has dozens of yards of solid rock in every
// direction before daylight.
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
      { x: 110, y: 3.4, z: 146, radius: 6.8 },
      { x: 110, y: -7.0, z: 155, radius: 6.3 },
      { x: 110, y: -19.0, z: 165, radius: 6.6 },
      { x: 110, y: -31.0, z: 175, radius: 7.0 },
      { x: 110, y: -35.0, z: 180, radius: 7.3 },
      { x: 110, y: -31.0, z: 185, radius: 7.0 },
      { x: 110, y: -19.0, z: 195, radius: 6.6 },
      { x: 110, y: -7.0, z: 205, radius: 6.3 },
      { x: 110, y: 2.9, z: 214, radius: 6.8 },
    ],
  },
];
