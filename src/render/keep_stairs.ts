// Visible staircase geometry for the Eastbrook Vale keep
// (sim/content/keep.ts KEEP_STAIRS). Presentation only: the actual floor
// transition is the per-player activeFloor flip keyed off each landing's
// trigger volume (sim/keep_floor.ts); this module just draws the real stepped
// flight under each landing so the transition reads as climbing stairs instead
// of teleporting. Each flight's TOP sits at its landing (aligned with the
// stairwell hole carved in the floor slab, sim/voxel_building.ts) and descends
// along the landing's authored axis/dir toward the floor below.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { KEEP_FLOOR_HEIGHT, KEEP_STAIRS } from '../sim/content/keep';
import { keepFloorY } from '../sim/voxel_building';
import { surfaceMat } from './gfx';
import { stoneMaps } from './textures';

const STEPS_PER_FLIGHT = 12;
const STAIR_WIDTH = 2.0;

/** Builds one merged mesh of every keep staircase flight. */
export function buildKeepStairs(seed: number): THREE.Mesh | null {
  const boxes: THREE.BufferGeometry[] = [];
  for (const s of KEEP_STAIRS) {
    const lowerY = keepFloorY(seed, s.fromFloor);
    const rise = KEEP_FLOOR_HEIGHT / STEPS_PER_FLIGHT;
    const run = 0.34;
    for (let i = 0; i < STEPS_PER_FLIGHT; i++) {
      // Solid stepped profile: each step spans from the lower floor up to its
      // own tread, so the flight reads as a filled staircase, not floating
      // treads. The top step (i = STEPS_PER_FLIGHT-1) sits at the landing.
      const treadTopY = lowerY + (i + 1) * rise;
      const h = treadTopY - lowerY;
      const along = -s.dir * run * (STEPS_PER_FLIGHT - 1 - i);
      const geo =
        s.axis === 'z'
          ? new THREE.BoxGeometry(STAIR_WIDTH, h, run + 0.02)
          : new THREE.BoxGeometry(run + 0.02, h, STAIR_WIDTH);
      const x = s.axis === 'x' ? s.x + along : s.x;
      const z = s.axis === 'z' ? s.z + along : s.z;
      geo.translate(x, lowerY + h / 2, z);
      boxes.push(geo);
    }
  }
  if (!boxes.length) return null;
  const merged = mergeGeometries(boxes, false) ?? boxes[0];
  const stone = stoneMaps();
  const mat = surfaceMat({
    color: 0xa9a094,
    map: stone.map,
    normalMap: stone.normalMap,
    roughness: 0.9,
  });
  const mesh = new THREE.Mesh(merged, mat);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.name = 'keep-stairs';
  return mesh;
}
