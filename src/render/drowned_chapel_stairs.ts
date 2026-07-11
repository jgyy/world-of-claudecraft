// Visible staircase geometry for the Drowned Chapel
// (sim/content/drowned_chapel.ts CHAPEL_STAIRS). Presentation only: the
// actual floor transition is the per-player chapelFloor flip keyed off the
// landing's trigger volume (sim/drowned_chapel_floor.ts); this module just
// draws the real stepped flight under the landing so the transition reads as
// climbing stairs instead of teleporting.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CHAPEL_FLOOR_HEIGHT, CHAPEL_STAIRS } from '../sim/content/drowned_chapel';
import { chapelFloorY } from '../sim/drowned_chapel_building';
import { surfaceMat } from './gfx';
import { stoneMaps } from './textures';

const STEPS_PER_FLIGHT = 10;
const STAIR_WIDTH = 1.8;

/** Builds one merged mesh of every chapel staircase flight. */
export function buildChapelStairs(seed: number): THREE.Mesh | null {
  const boxes: THREE.BufferGeometry[] = [];
  for (const s of CHAPEL_STAIRS) {
    const lowerY = chapelFloorY(seed, s.fromFloor);
    const rise = CHAPEL_FLOOR_HEIGHT / STEPS_PER_FLIGHT;
    const run = 0.34;
    for (let i = 0; i < STEPS_PER_FLIGHT; i++) {
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
    color: 0x7c7869,
    map: stone.map,
    normalMap: stone.normalMap,
    roughness: 0.95,
  });
  const mesh = new THREE.Mesh(merged, mat);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.name = 'chapel-stairs';
  return mesh;
}
