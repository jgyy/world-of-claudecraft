import * as THREE from 'three';
import { GLIMMERVEIN_GORGE_ZS, GLIMMERVEIN_PASS_X } from '../sim/data';
import { terrainHeight } from '../sim/world';

// Glimmervein Cavern: a real underground CHAMBER through the natural
// zone1/zone2 mountain ridge (src/sim/world.ts pierces that ridge with a
// second, wide pass at GLIMMERVEIN_PASS_X, distinct from the x=0 causeway
// pass). That pass is a whole room's width, not a corridor slot: the ordinary
// heightfield closes back to a tall rock wall only past the shoulder, well
// off the walkable floor. This module adds the CEILING (the heightfield has
// no roof geometry, only a floor) across the FULL footprint (a grid, not a
// single centerline), wall slabs hugging the real walls all the way around,
// support pillars and floor stalagmites for a real-room silhouette, and
// glowing crystal clusters for underground light, so the whole area reads as
// one big enclosed cavern, not a tunnel corridor. One new
// src/render/<thing>.ts per the repo's "new visual system" convention, not a
// method bank on renderer.ts.

const ROCK_COLOR = 0x4a4a46;
const STALACTITE_COLOR = 0x3a3a38;
// Same tint family as the 'cave' outdoor fog preset (renderer.ts BIOME_FOG.cave
// = 0x76807c) so the ceiling stone reads as part of the same cave palette.
const CEILING_TINT = 0x76807c;
const CRYSTAL_COLOR = 0x7fd9e8;

export interface CaveTunnelView {
  group: THREE.Group;
}

// Chamber cross-section: matches the wide pass in src/sim/data.ts
// (GLIMMERVEIN_PASS_HALF_WIDTH=16), so the room reads as a real cave space a
// player can walk around in, not a narrow corridor with a roof slapped on.
const HALF_WIDTH = 17;
const CEILING_HEIGHT = 14;

// Dense sample grid over the chamber's full footprint (x AND z, not just a
// centerline): every tile gets its own ceiling/floor slab with zero gap to
// its neighbors, so the roof reads as one continuous cavern with no sky
// visible anywhere inside, not a tunnel strip. Only the two true end mouths
// (where the ridge itself tapers below the enclosure threshold) stay open,
// reading as the chamber's entrance/exit.
const SEGMENT_STEP = 6;
const GORGE_Z_MIN = Math.min(...GLIMMERVEIN_GORGE_ZS) - 6;
const GORGE_Z_MAX = Math.max(...GLIMMERVEIN_GORGE_ZS) + 6;
// The real ridge wall, sampled just past the pass shoulder, must clear this
// much above the floor before we call the spot "inside the mountain" and
// enclose it; short of that (the two mouths) we leave it open to daylight.
const ENCLOSURE_SPAN_MIN = 10;
// Sampled a bit past the pass shoulder (GLIMMERVEIN_PASS_SHOULDER=32 in
// world.ts) so this reads the ridge's real, near-full-height wall, not the
// still-opening shoulder slope.
const WALL_SAMPLE_OFFSET = 36;

function wallHeightAt(floorY: number, z: number, seed: number): number {
  const left = terrainHeight(GLIMMERVEIN_PASS_X - WALL_SAMPLE_OFFSET, z, seed);
  const right = terrainHeight(GLIMMERVEIN_PASS_X + WALL_SAMPLE_OFFSET, z, seed);
  return Math.max(left, right, floorY);
}

export function buildCaveTunnel(seed: number): CaveTunnelView {
  const group = new THREE.Group();
  const rockMat = new THREE.MeshLambertMaterial({ color: ROCK_COLOR });
  const stalMat = new THREE.MeshLambertMaterial({ color: STALACTITE_COLOR });
  const ceilingMat = new THREE.MeshLambertMaterial({ color: CEILING_TINT });
  const crystalMat = new THREE.MeshLambertMaterial({
    color: CRYSTAL_COLOR,
    emissive: CRYSTAL_COLOR,
    emissiveIntensity: 0.9,
  });

  let rowCounter = 0;
  for (let z = GORGE_Z_MIN; z <= GORGE_Z_MAX; z += SEGMENT_STEP) {
    const centerFloorY = terrainHeight(GLIMMERVEIN_PASS_X, z, seed);
    const wallTop = wallHeightAt(centerFloorY, z, seed);
    const span = wallTop - centerFloorY;
    // Only enclose where the real ridge wall is tall enough to plausibly hold
    // a roof; the chamber's two mouths (low ridge, span below threshold) stay
    // open sky by design, reading as the entrance/exit rather than a gap in
    // the middle of the room.
    if (span < ENCLOSURE_SPAN_MIN) continue;

    // Tile the ceiling across the FULL room width (a 2D grid over x AND z),
    // not just a centerline strip, so the whole chamber footprint reads as
    // one continuous roofed-over room, not a corridor.
    for (let x = -HALF_WIDTH; x <= HALF_WIDTH; x += SEGMENT_STEP) {
      const floorY = terrainHeight(GLIMMERVEIN_PASS_X + x, z, seed);
      const ceilingY = floorY + CEILING_HEIGHT;
      const ceiling = new THREE.Mesh(
        new THREE.BoxGeometry(SEGMENT_STEP + 0.4, 3.2, SEGMENT_STEP + 0.4),
        ceilingMat,
      );
      ceiling.position.set(GLIMMERVEIN_PASS_X + x, ceilingY, z);
      group.add(ceiling);

      // Stalactites hanging from the ceiling underside, thinned out so they
      // read as detail rather than clutter.
      if ((rowCounter + Math.round(x / SEGMENT_STEP)) % 3 === 0) {
        const stal = new THREE.Mesh(new THREE.ConeGeometry(0.8, 2.4, 6), stalMat);
        stal.rotation.x = Math.PI;
        stal.position.set(GLIMMERVEIN_PASS_X + x, ceilingY - 2.2, z);
        group.add(stal);
      }
    }

    // Perimeter wall slabs closing the gap between the room floor and the
    // ceiling's underside at both room edges, hugging the real ridge terrain
    // just outside the walkable width, so the roof reads as continuous rock
    // all the way around, not a floating slab with sky visible at the seams.
    for (const side of [-1, 1]) {
      const wall = new THREE.Mesh(
        new THREE.BoxGeometry(4, CEILING_HEIGHT, SEGMENT_STEP + 0.4),
        rockMat,
      );
      wall.position.set(
        GLIMMERVEIN_PASS_X + side * (HALF_WIDTH + 2),
        centerFloorY + CEILING_HEIGHT / 2,
        z,
      );
      group.add(wall);
    }

    // A support pillar every few rows, offset from the centerline so it
    // never blocks the mouths: reads as a real cave room holding its own
    // roof up, not a floating ceiling plane.
    if (rowCounter % 3 === 1) {
      const pillarSide = rowCounter % 6 === 1 ? -1 : 1;
      const pillarX = GLIMMERVEIN_PASS_X + pillarSide * (HALF_WIDTH * 0.5);
      const pillarFloorY = terrainHeight(pillarX, z, seed);
      const pillar = new THREE.Mesh(
        new THREE.CylinderGeometry(1.4, 1.8, CEILING_HEIGHT, 8),
        rockMat,
      );
      pillar.position.set(pillarX, pillarFloorY + CEILING_HEIGHT / 2, z);
      group.add(pillar);
    }

    // Glowing crystal clusters embedded in the walls every few rows: the
    // "Glimmervein" light source, in the absence of daylight this deep in.
    if (rowCounter % 2 === 0) {
      const side = rowCounter % 4 === 0 ? -1 : 1;
      const crystalX = GLIMMERVEIN_PASS_X + side * (HALF_WIDTH - 0.5);
      const crystalFloorY = terrainHeight(crystalX, z, seed);
      const crystal = new THREE.Mesh(new THREE.OctahedronGeometry(1.1), crystalMat);
      crystal.position.set(crystalX, crystalFloorY + 2.4, z);
      group.add(crystal);
      const light = new THREE.PointLight(CRYSTAL_COLOR, 1.6, 22, 2);
      light.position.copy(crystal.position);
      group.add(light);
    }
    rowCounter++;
  }

  group.traverse((obj) => {
    obj.castShadow = false;
    obj.receiveShadow = false;
  });
  return { group };
}
