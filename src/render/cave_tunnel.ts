import * as THREE from 'three';
import { SUNKEN_ROAD_FLOOR_Y, SUNKEN_ROAD_WAYPOINTS } from '../sim/data';
import { surfaceMat } from './gfx';

// Purely cosmetic dressing for the Sunken Road tunnel (sim/content/sunken_road.ts):
// glowing crystal clusters at each carved waypoint. The tunnel itself is
// terrain (HeightStamp carves in the sim heightfield), so there is no
// wall/ceiling/pillar geometry to build here, only the crystal markers.
const CRYSTAL_COLOR = 0x6fd1e6;
const CRYSTAL_Y_OFFSET = 0.4;

export interface CaveTunnelView {
  group: THREE.Group;
}

export function buildCaveTunnel(): CaveTunnelView {
  const group = new THREE.Group();
  group.name = 'sunkenRoadCrystals';
  const geo = new THREE.OctahedronGeometry(0.6, 0);
  const mat = surfaceMat({ color: CRYSTAL_COLOR, emissive: CRYSTAL_COLOR, emissiveIntensity: 1.2 });
  for (const wp of SUNKEN_ROAD_WAYPOINTS) {
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(wp.x, SUNKEN_ROAD_FLOOR_Y + CRYSTAL_Y_OFFSET, wp.z);
    mesh.castShadow = true;
    mesh.name = `sunkenRoadCrystal_${wp.x}_${wp.z}`;
    group.add(mesh);
  }
  return { group };
}
