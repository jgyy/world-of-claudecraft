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
  // Marks this waypoint as an entrance mound: voxel.ts additively solidifies
  // a dome of rock above the ambient terrain here (see moundSolidAmount),
  // so the tunnel carve cuts its doorway through a real protruding knoll
  // instead of just dipping into the existing hillside slope. moundRadius/
  // moundHeight both default (radius + 4 / 8) when mound is true and either
  // is omitted.
  mound?: boolean;
  moundRadius?: number;
  moundHeight?: number;
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
// clearly ABOVE the local terrainHeight, cut into a real protruding mound
// (see the `mound` field above and moundSolidAmount in voxel.ts) rather than
// just a dip in the existing hillside slope. Held at a constant x=110, on
// the EAST side of both zones (well clear of the Eastbrook<->Fenbridge
// causeway at x=0, both zones' hubs, every lake, the Boar Meadow/Bandit
// Camp/Fallen Chapel/Brightwood Glade/Widow Thicket POIs, and the
// vale_kobold_warren tunnel to the west).
//
// Cross-section shape (archScale/floorScale, see TunnelWaypoint above): every
// waypoint domes taller overhead than it is wide (archScale > 1) and flattens
// underfoot (floorScale < 1), so the tube reads as a real arched cave, not a
// circular pipe bore. The two mouth waypoints push this further still
// (archScale 2.2, floorScale 1.0): a tall, upright doorway cut into the
// mound's face, the shape a player actually walks INTO, not a round hole
// lying flat on the ground. The shape tapers smoothly from that upright
// mouth into the ordinary arched-cave cross-section over the next couple of
// waypoints in from each end.
//
// Profile (the y each waypoint sits at): every single segment is held to a
// MAXIMUM 30 degree slope (|dy/dz| <= tan(30) = 0.577), the crest still sits
// well under the ridge (~19-25yd below mouth level, the deepest a 30 degree
// grade can reach given the z run available between each mouth and the
// z=180 boundary), and each mouth's first stretch stays close to level
// (a shallow single-digit-degree dip over the first ~10yd) before the
// passage curves into its real descent. Both of these are deliberate
// corrections from an earlier pass: dropping steeply (~14yd of y over just
// 9yd of z, a ~58 degree grade) starting right at the mouth reads from
// outside as looking straight down a well/pit shaft, not walking
// horizontally through a doorway into a hillside; holding the entry level
// first, then curving down at a walkable grade, keeps the actual view into
// the mouth reading as an upright cave entrance regardless of camera angle.
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
      {
        x: 110,
        y: 3.4,
        z: 128,
        radius: 7.8,
        archScale: 2.2,
        floorScale: 1.0,
        mound: true,
        moundRadius: 14,
        moundHeight: 10,
      },
      { x: 110, y: 1.0, z: 138, radius: 7.6, archScale: 1.9, floorScale: 0.9 },
      { x: 110, y: -5.0, z: 150, radius: 7.4, archScale: 1.6, floorScale: 0.8 },
      { x: 110, y: -12.4, z: 163, radius: 7.6, archScale: 1.4, floorScale: 0.72 },
      { x: 110, y: -22.0, z: 180, radius: 8.4, archScale: 1.3, floorScale: 0.6 },
      { x: 110, y: -12.4, z: 197, radius: 7.6, archScale: 1.4, floorScale: 0.72 },
      { x: 110, y: -5.0, z: 210, radius: 7.4, archScale: 1.6, floorScale: 0.8 },
      { x: 110, y: 1.0, z: 222, radius: 7.6, archScale: 1.9, floorScale: 0.9 },
      {
        x: 110,
        y: 2.9,
        z: 232,
        radius: 7.8,
        archScale: 2.2,
        floorScale: 1.0,
        mound: true,
        moundRadius: 14,
        moundHeight: 10,
      },
    ],
  },
];
