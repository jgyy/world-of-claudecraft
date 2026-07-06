import * as THREE from 'three';
import { GLIMMERVEIN_WAYPOINTS } from '../sim/data';
import { terrainHeight } from '../sim/world';

// Glimmervein Cavern: a winding sunken trench (src/sim/data.ts pulls the
// ground down along a chain of curving waypoints, GLIMMERVEIN_WAYPOINTS).
// No ceiling, wall, or pillar geometry here on purpose: the concave bowl
// shape of each waypoint's own terrain edit IS the wall, the same way a
// lake basin's shore needs no fence. This module only adds the
// "Glimmervein" glowing crystal clusters along the trench floor for
// underground light and identity. One new src/render/<thing>.ts per the
// repo's "new visual system" convention, not a method bank on renderer.ts.

const CRYSTAL_COLOR = 0x7fd9e8;

export interface CaveTunnelView {
  group: THREE.Group;
}

export function buildCaveTunnel(seed: number): CaveTunnelView {
  const group = new THREE.Group();
  const crystalMat = new THREE.MeshLambertMaterial({
    color: CRYSTAL_COLOR,
    emissive: CRYSTAL_COLOR,
    emissiveIntensity: 0.9,
  });

  GLIMMERVEIN_WAYPOINTS.forEach((w, i) => {
    // One crystal cluster per waypoint, alternating sides of the curving
    // centerline, so the glow reads as a trail following the winding path.
    const side = i % 2 === 0 ? -1 : 1;
    const cx = w.x + side * 6;
    const cz = w.z + (i % 2 === 0 ? 4 : -4);
    const floorY = terrainHeight(cx, cz, seed);
    const crystal = new THREE.Mesh(new THREE.OctahedronGeometry(1.1), crystalMat);
    crystal.position.set(cx, floorY + 1.4, cz);
    group.add(crystal);
    const light = new THREE.PointLight(CRYSTAL_COLOR, 1.6, 24, 2);
    light.position.copy(crystal.position);
    group.add(light);
  });

  group.traverse((obj) => {
    obj.castShadow = false;
    obj.receiveShadow = false;
  });
  return { group };
}
