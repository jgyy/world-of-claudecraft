// Visible staircase geometry for the Drowned Chapel
// (sim/content/drowned_chapel.ts CHAPEL_STAIRS). Presentation only: the
// actual floor transition is the per-player chapelFloor flip keyed off the
// landing's trigger volume (sim/drowned_chapel_floor.ts); this module just
// draws the real stepped flight under the landing so the transition reads as
// climbing stairs instead of teleporting.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CHAPEL_STAIRS } from '../sim/content/drowned_chapel';
import { chapelFloorY } from '../sim/drowned_chapel_building';
import { surfaceMat } from './gfx';
import { stoneMaps } from './textures';

const STEPS_PER_FLIGHT = 12;
const STAIR_WIDTH = 1.8;
const RUN = 0.34;
// Railing dimensions: a newel/baluster post every few steps and a continuous
// sloped handrail cap on each side of the flight.
const BALUSTER_EVERY = 2;
const BALUSTER_W = 0.12;
const BALUSTER_H = 1.0;
const HANDRAIL_H = 0.14;
const RAIL_SIDE_INSET = 0.12;

/** Builds one merged mesh of every chapel staircase flight, including side
 * railings with balusters and a sloped handrail cap. */
export function buildChapelStairs(seed: number): THREE.Mesh | null {
  const boxes: THREE.BufferGeometry[] = [];
  for (const s of CHAPEL_STAIRS) {
    const lowerY = chapelFloorY(seed, s.fromFloor);
    const upperY = chapelFloorY(seed, s.toFloor);
    const rise = (upperY - lowerY) / STEPS_PER_FLIGHT;
    // The half-span perpendicular to the flight, where each side railing sits.
    const sideOffset = STAIR_WIDTH / 2 - RAIL_SIDE_INSET;

    for (let i = 0; i < STEPS_PER_FLIGHT; i++) {
      const treadTopY = lowerY + (i + 1) * rise;
      const h = treadTopY - lowerY;
      const along = -s.dir * RUN * (STEPS_PER_FLIGHT - 1 - i);
      const stepGeo =
        s.axis === 'z'
          ? new THREE.BoxGeometry(STAIR_WIDTH, h, RUN + 0.02)
          : new THREE.BoxGeometry(RUN + 0.02, h, STAIR_WIDTH);
      const x = s.axis === 'x' ? s.x + along : s.x;
      const z = s.axis === 'z' ? s.z + along : s.z;
      stepGeo.translate(x, lowerY + h / 2, z);
      boxes.push(stepGeo);

      // Balusters: short vertical posts standing on select treads, one on each
      // side of the flight, so the stair reads as railed rather than a bare ramp.
      if (i % BALUSTER_EVERY === 0) {
        for (const side of [-1, 1]) {
          const postGeo = new THREE.BoxGeometry(BALUSTER_W, BALUSTER_H, BALUSTER_W);
          const bx = s.axis === 'z' ? x + side * sideOffset : x;
          const bz = s.axis === 'z' ? z : z + side * sideOffset;
          postGeo.translate(bx, treadTopY + BALUSTER_H / 2, bz);
          boxes.push(postGeo);
        }
      }
    }

    // Sloped handrail cap: one long thin box per side spanning the whole flight,
    // rotated to sit on top of the balusters along the stair's incline.
    const lowerCapY = lowerY + BALUSTER_H;
    const upperCapY = upperY + BALUSTER_H;
    const flightLen = RUN * (STEPS_PER_FLIGHT - 1);
    const railLen = Math.hypot(flightLen, upperCapY - lowerCapY) + 0.3;
    const pitch = Math.atan2(upperCapY - lowerCapY, flightLen);
    const midAlong = (-s.dir * (RUN * (STEPS_PER_FLIGHT - 1))) / 2;
    const midX = s.axis === 'x' ? s.x + midAlong : s.x;
    const midZ = s.axis === 'z' ? s.z + midAlong : s.z;
    const midY = (lowerCapY + upperCapY) / 2;
    for (const side of [-1, 1]) {
      const capGeo =
        s.axis === 'z'
          ? new THREE.BoxGeometry(0.14, HANDRAIL_H, railLen)
          : new THREE.BoxGeometry(railLen, HANDRAIL_H, 0.14);
      // Incline the cap along the flight; dir sets which way the run descends.
      if (s.axis === 'z') capGeo.rotateX(s.dir * pitch);
      else capGeo.rotateZ(-s.dir * pitch);
      const cx = s.axis === 'z' ? midX + side * (STAIR_WIDTH / 2 - RAIL_SIDE_INSET) : midX;
      const cz = s.axis === 'z' ? midZ : midZ + side * (STAIR_WIDTH / 2 - RAIL_SIDE_INSET);
      capGeo.translate(cx, midY, cz);
      boxes.push(capGeo);
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
