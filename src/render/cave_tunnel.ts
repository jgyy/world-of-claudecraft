import * as THREE from 'three';
import { SUNKEN_ROAD_CENTERLINE, SUNKEN_ROAD_FLOOR_Y, SUNKEN_ROAD_WAYPOINTS } from '../sim/data';
import { surfaceMat } from './gfx';

// The Sunken Road tunnel (sim/content/sunken_road.ts): a real ENCLOSED bore,
// not just an open-air carved trench. The sim carves a NARROW floor (radius
// TUNNEL_FLOOR_RADIUS in sunken_road.ts, 'flat' falloff so its walls are
// sharp, not a smoothed-out bowl); this module wraps that same dense
// centerline in a rock shell comfortably wider than the carve, so the shell
// fully encloses the walkable floor everywhere, including straight up.
const ROCK_COLOR = 0x241f1a;
const CRYSTAL_COLOR = 0x6fd1e6;
const CRYSTAL_Y_OFFSET = 0.4;
// Wider than the floor's own 8yd carve radius (with real margin), so the
// shell's footprint always exceeds the walkable floor's: a player standing
// anywhere on the floor, including right at its edge, is still well inside
// the tube's radius and can never see past its rim to the sky.
const TUBE_RADIUS = 12;
const RADIAL_SEGMENTS = 16;

export interface CaveTunnelView {
  group: THREE.Group;
}

export function buildCaveTunnel(): CaveTunnelView {
  const group = new THREE.Group();
  group.name = 'sunkenRoadTunnel';

  const centerY = SUNKEN_ROAD_FLOOR_Y + TUBE_RADIUS;
  // Swept along the DENSE centerline (the same points the terrain carve
  // itself follows), not the sparse control waypoints, so the shell hugs the
  // corridor tightly through every turn instead of cutting corners a wide
  // CatmullRom spline through only a few points would.
  const points = SUNKEN_ROAD_CENTERLINE.map((wp) => new THREE.Vector3(wp.x, centerY, wp.z));
  const curve = new THREE.CatmullRomCurve3(points, false, 'catmullrom', 0.15);
  const tubularSegments = Math.max(50, SUNKEN_ROAD_CENTERLINE.length * 2);
  const shellGeo = new THREE.TubeGeometry(
    curve,
    tubularSegments,
    TUBE_RADIUS,
    RADIAL_SEGMENTS,
    false,
  );
  // BackSide: the camera walks INSIDE the tube, so it must render the
  // interior-facing surface, not the (invisible from inside) outer skin.
  const shellMat = surfaceMat({ color: ROCK_COLOR, roughness: 1, side: THREE.BackSide });
  const shell = new THREE.Mesh(shellGeo, shellMat);
  shell.receiveShadow = true;
  shell.name = 'sunkenRoadShell';
  group.add(shell);

  const crystalGeo = new THREE.OctahedronGeometry(0.6, 0);
  const crystalMat = surfaceMat({
    color: CRYSTAL_COLOR,
    emissive: CRYSTAL_COLOR,
    emissiveIntensity: 1.2,
  });
  for (const wp of SUNKEN_ROAD_WAYPOINTS) {
    const mesh = new THREE.Mesh(crystalGeo, crystalMat);
    mesh.position.set(wp.x, SUNKEN_ROAD_FLOOR_Y + CRYSTAL_Y_OFFSET, wp.z);
    mesh.castShadow = true;
    mesh.name = `sunkenRoadCrystal_${wp.x}_${wp.z}`;
    group.add(mesh);
  }
  return { group };
}
