// Hand-authored tunnel/cave volumes carved into the voxel density field
// (see ../voxel.ts). Declarative data, no RNG: a tunnel is a capsule path
// (a polyline of waypoints, each with its own radius) subtracted from the
// solid terrain. Append-only content table, same spirit as content/dungeons.ts.
export interface TunnelWaypoint {
  x: number;
  y: number;
  z: number;
  radius: number;
  // Cross-section shape, both optional and both defaulting to 1 (a plain
  // sphere, the original shape): the vertical half-extent above/below this
  // waypoint's own y is `radius * archScale` / `radius * floorScale`
  // respectively, instead of a uniform `radius` in every direction. A real
  // cave reads as a rounded arch overhead and a flatter, more walkable floor
  // underfoot, not a circular pipe bore: archScale > 1 domes the ceiling
  // taller than the horizontal radius, floorScale < 1 compresses the floor
  // in close underneath. A mouth waypoint pushes both further (a tall
  // archScale, floorScale near/at 1) so the opening itself reads as an
  // upright doorway cut into the hillside face, not a circular hole lying
  // flat on the ground.
  archScale?: number;
  floorScale?: number;
}

export interface TunnelVolume {
  id: string;
  waypoints: TunnelWaypoint[];
}

// A short kobold-warren tunnel under the Vale foothills, mouth open to the
// surface near (60, 150) then dipping underground and dead-ending in a small
// chamber. Coordinates sit well clear of zone hubs/camps/roads. Left as a
// plain sphere cross-section (no archScale/floorScale): a small fixture
// tunnel, not the one under review for cave-shape realism.
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
// the ridge crest before resurfacing on the Marsh side. Held at a constant
// x=110, on the EAST side of both zones (well clear of the Eastbrook<->
// Fenbridge causeway at x=0, both zones' hubs, every lake, the Boar Meadow/
// Bandit Camp/Fallen Chapel/Brightwood Glade/Widow Thicket POIs, and the
// vale_kobold_warren tunnel to the west).
//
// Cross-section shape (archScale/floorScale, see TunnelWaypoint above): every
// waypoint domes taller overhead than it is wide (archScale > 1) and flattens
// underfoot (floorScale < 1), so the tube reads as a real arched cave, not a
// circular pipe bore. The two mouth waypoints push this further still
// (archScale 2.2, floorScale 1.0): a tall, upright doorway cut into the
// hillside face, the shape a player actually walks INTO, not a round hole
// lying flat on the ground. The shape tapers smoothly from that upright
// mouth into the ordinary arched-cave cross-section over the next couple of
// waypoints in from each end.
//
// Profile (the y each waypoint sits at): each mouth's first stretch is now
// kept close to level (a gentle few-degree dip over the first ~8yd) before
// the passage curves into a real descent toward the crest. This is a
// deliberate correction: an early version dropped steeply (~14yd of y over
// just 9yd of z) starting immediately at the mouth, which reads from outside
// as looking straight down a well/pit shaft rather than walking horizontally
// through a doorway into a hillside. Holding the entry level first, then
// curving down over the following waypoints, keeps the actual view into the
// mouth reading as an upright cave entrance regardless of camera angle; the
// steepest part of the descent is now entirely past the mouth, out of the
// exterior sightline.
//
// Diameter (radius) is bumped up again (+15%) and the depth under the ridge
// is deepened further still (crest now ~54yd below mouth level, was ~38yd):
// a real, roomy walk-in cave, deeper under the ridge than before, with even
// more solid rock overhead at the crest than the previous round.
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
      { x: 110, y: 3.4, z: 146, radius: 7.8, archScale: 2.2, floorScale: 1.0 },
      { x: 110, y: 1.8, z: 150, radius: 7.6, archScale: 1.9, floorScale: 0.9 },
      { x: 110, y: -1.0, z: 154, radius: 7.4, archScale: 1.6, floorScale: 0.8 },
      { x: 110, y: -12.0, z: 160, radius: 7.5, archScale: 1.4, floorScale: 0.72 },
      { x: 110, y: -28.0, z: 168, radius: 7.9, archScale: 1.32, floorScale: 0.66 },
      { x: 110, y: -51.0, z: 180, radius: 8.4, archScale: 1.3, floorScale: 0.6 },
      { x: 110, y: -28.0, z: 192, radius: 7.9, archScale: 1.32, floorScale: 0.66 },
      { x: 110, y: -12.0, z: 200, radius: 7.5, archScale: 1.4, floorScale: 0.72 },
      { x: 110, y: -1.0, z: 206, radius: 7.4, archScale: 1.6, floorScale: 0.8 },
      { x: 110, y: 1.8, z: 210, radius: 7.6, archScale: 1.9, floorScale: 0.9 },
      { x: 110, y: 2.9, z: 214, radius: 7.8, archScale: 2.2, floorScale: 1.0 },
    ],
  },
];
