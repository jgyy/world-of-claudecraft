import * as THREE from 'three';
import { SUNKEN_ROAD_FLOOR_Y, SUNKEN_ROAD_WAYPOINTS } from '../sim/data';
import { surfaceMat } from './gfx';

// The Sunken Road tunnel (sim/content/sunken_road.ts): a real ENCLOSED bore,
// not just an open-air carved trench. The sim carves the floor and walkable
// footprint via HeightStamp terrainEdits; this module adds the rock shell
// (a tube swept along the same waypoint centerline) so the sky is never
// visible while walking it, plus glowing crystal clusters for dressing.
const ROCK_COLOR = 0x241f1a;
const CRYSTAL_COLOR = 0x6fd1e6;
const CRYSTAL_Y_OFFSET = 0.4;
// Tube radius: the tube's bottom rests on the carved floor, its top forms the
// ceiling roughly 2x this above the floor. Comfortably wider/taller than a
// player model, narrower than the HeightStamp's own radius so the shell sits
// inside the walkable footprint rather than poking out past the carve.
const TUBE_RADIUS = 13;
const RADIAL_SEGMENTS = 16;

export interface CaveTunnelView {
  group: THREE.Group;
}

export function buildCaveTunnel(): CaveTunnelView {
  const group = new THREE.Group();
  group.name = 'sunkenRoadTunnel';

  const centerY = SUNKEN_ROAD_FLOOR_Y + TUBE_RADIUS;
  const points = SUNKEN_ROAD_WAYPOINTS.map((wp) => new THREE.Vector3(wp.x, centerY, wp.z));
  const curve = new THREE.CatmullRomCurve3(points, false, 'catmullrom', 0.15);
  const tubularSegments = Math.max(8, SUNKEN_ROAD_WAYPOINTS.length * 10);
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
