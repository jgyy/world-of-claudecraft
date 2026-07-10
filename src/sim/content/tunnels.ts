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
// just a dip in the existing hillside slope. Both mouths sit at x=128, on
// the EAST side of both zones (round 8: shifted east from x=110, since the
// old x=110 mouth's 14yd mound radius + 6yd decoration clearance overlapped
// the Fallen Chapel undead camp cluster around (88-92, 90) - a reviewer
// wanted the entrance clear of any mob spawn area. x=128 keeps a comfortable
// clearance margin from that camp and from every zone hub/lake/POI/road and
// the unrelated vale_kobold_warren tunnel to the west); the interior
// waypoints between the mouths S-curve laterally (x: 128 -> 138 -> 132 ->
// 116 -> 128 at the crest -> 138 -> 132 -> 116 -> 128). Round 9: the lateral
// swing was roughly doubled from the original +-6yd to a noticeably more
// pronounced +-10..12yd (the waypoint nearest each mouth is kept at +10
// rather than +12 so its carved capsule still stays clear of the mound's
// own grassy exterior slope right at the doorway; checked against
// vale_kobold_warren, which stays entirely within x=60..84, and against
// every zone1/zone2 camp/POI/road near x=116..140, z=66..294: still
// comfortably clear of everything above.
//
// Cross-section shape (archScale/floorScale, see TunnelWaypoint above): every
// waypoint domes taller overhead than it is wide (archScale > 1) and flattens
// underfoot (floorScale < 1), so the tube reads as a real arched cave, not a
// circular pipe bore. Round 8: the two mouth waypoints push this MUCH
// further than the tunnel body (radius 6.5, archScale 3.0, floorScale 0.45,
// narrower and noticeably flatter-floored than before) - floorScale 0.85 in
// the previous round still put the threshold floor well below the ambient
// hillside, so a camera at the mouth read it as looking down into a round
// pit/crater rather than through a doorway. Floor scale 0.45 combined with
// each mouth's own y (set so `y - radius*floorScale` lands almost exactly at
// that mouth's own ambient terrainHeight - see the mound/floor math in
// voxel.ts) puts the threshold at natural ground level: a real, walk-through
// doorway cut into the hillside face, not a dip you fall into. The shape
// tapers smoothly from that tighter, flatter mouth back out to the ordinary,
// wider arched-cave cross-section over the next couple of waypoints in from
// each end.
//
// Profile (the y each waypoint sits at): every single segment is held to a
// MAXIMUM 30 degree slope (|dy/dz| <= tan(30) = 0.577). Round 8: the crest
// pushed noticeably deeper again, from y=-37 to y=-52.5 (the ridge surface
// itself sits at y=+35.8 at the crest, so the tunnel is now ~88yd of solid
// rock below it, versus ~73yd before). To stay under the 30 degree cap given
// the extra depth, both mouths moved further out from the z=180 zone
// boundary: z=66 and z=294 (was z=96/z=264). Each mouth's first stretch still
// stays close to level before the passage curves into its real descent, for
// the same reason as before: dropping steeply right at the mouth reads from
// outside as looking straight down a well/pit shaft, not walking horizontally
// through a doorway into a hillside.
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
        x: 128,
        y: 8.0,
        z: 66,
        radius: 6.5,
        archScale: 3.0,
        floorScale: 0.45,
        mound: true,
        moundRadius: 14,
        moundHeight: 12,
      },
      { x: 138, y: -3.7, z: 88, radius: 7.6, archScale: 1.9, floorScale: 0.9 },
      { x: 132, y: -17.0, z: 114, radius: 7.4, archScale: 1.6, floorScale: 0.8 },
      { x: 116, y: -31.7, z: 142, radius: 7.6, archScale: 1.4, floorScale: 0.72 },
      { x: 128, y: -52.5, z: 180, radius: 8.4, archScale: 1.3, floorScale: 0.6 },
      { x: 138, y: -33.44, z: 218, radius: 7.6, archScale: 1.4, floorScale: 0.72 },
      { x: 132, y: -19.95, z: 246, radius: 7.4, archScale: 1.6, floorScale: 0.8 },
      { x: 116, y: -7.76, z: 272, radius: 7.6, archScale: 1.9, floorScale: 0.9 },
      {
        x: 128,
        y: 2.2,
        z: 294,
        radius: 6.5,
        archScale: 3.0,
        floorScale: 0.45,
        mound: true,
        moundRadius: 14,
        moundHeight: 12,
      },
    ],
  },
];
