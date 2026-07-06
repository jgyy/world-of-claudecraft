import * as THREE from 'three';
import {
  GLIMMERVEIN_GORGE_FLOOR_HEIGHT,
  GLIMMERVEIN_GORGE_X,
  GLIMMERVEIN_GORGE_ZS,
} from '../sim/data';
import { terrainHeight } from '../sim/world';

// Rock-arch overhangs for Glimmervein Cavern: the sim carves a sunken gorge
// into the natural zone1/zone2 ridge (see the GLIMMERVEIN_GORGE_* consts in
// sim/data.ts); this module only adds the overhead rock geometry (arches,
// wall slabs, stalactites) so the gorge reads as enclosed/underground even
// though it is ordinary open-world terrain with no loading or instance
// transition. One new src/render/<thing>.ts per the repo's "new visual
// system" convention, not a method bank on renderer.ts.

const ROCK_COLOR = 0x4a4a46;
const STALACTITE_COLOR = 0x3a3a38;
// Same tint family as the 'cave' outdoor fog preset (renderer.ts BIOME_FOG.cave
// = 0x76807c) so the arch stone reads as part of the same cave palette.
const ARCH_TINT = 0x76807c;

export interface CaveTunnelView {
  group: THREE.Group;
}

function wallHeightAt(z: number, seed: number): number {
  // The ridge crests around z=180; sample a bit off-center on both sides of
  // the carved channel to get the ambient (uncarved) wall height at this z.
  const left = terrainHeight(GLIMMERVEIN_GORGE_X - 22, z, seed);
  const right = terrainHeight(GLIMMERVEIN_GORGE_X + 22, z, seed);
  return Math.max(left, right, GLIMMERVEIN_GORGE_FLOOR_HEIGHT + 4);
}

export function buildCaveTunnel(seed: number): CaveTunnelView {
  const group = new THREE.Group();
  const rockMat = new THREE.MeshLambertMaterial({ color: ROCK_COLOR });
  const stalMat = new THREE.MeshLambertMaterial({ color: STALACTITE_COLOR });
  const archMat = new THREE.MeshLambertMaterial({ color: ARCH_TINT });

  for (const z of GLIMMERVEIN_GORGE_ZS) {
    const floorY = terrainHeight(GLIMMERVEIN_GORGE_X, z, seed);
    const wallTop = wallHeightAt(z, seed);
    const span = wallTop - floorY;
    // Only build an overhang where the ridge is actually tall enough to feel
    // enclosed; the gorge mouths (low ridge) stay open sky by design.
    if (span < 8) continue;

    const archY = floorY + span * 0.62;
    const arch = new THREE.Mesh(new THREE.BoxGeometry(46, 3.2, 6), archMat);
    arch.position.set(GLIMMERVEIN_GORGE_X, archY, z);
    group.add(arch);

    // Side wall slabs closing the gap between the terrain wall and the arch's
    // underside, so the ceiling reads as continuous rock, not a floating beam.
    for (const side of [-1, 1]) {
      const wall = new THREE.Mesh(new THREE.BoxGeometry(6, span * 0.4, 6), rockMat);
      wall.position.set(GLIMMERVEIN_GORGE_X + side * 20, floorY + span * 0.8, z);
      group.add(wall);
    }

    // A few stalactites hanging from the arch underside for silhouette.
    for (let i = -1; i <= 1; i++) {
      const stal = new THREE.Mesh(new THREE.ConeGeometry(0.9, 2.6, 6), stalMat);
      stal.rotation.x = Math.PI;
      stal.position.set(GLIMMERVEIN_GORGE_X + i * 7, archY - 2.6, z + (i % 2 === 0 ? 1.5 : -1.5));
      group.add(stal);
    }
  }

  group.traverse((obj) => {
    obj.castShadow = false;
    obj.receiveShadow = false;
  });
  return { group };
}
