import * as THREE from 'three';
import {
  GLIMMERVEIN_FLOOR_Y,
  GLIMMERVEIN_PASS_X,
  GLIMMERVEIN_RAMP_NORTH_Z,
  GLIMMERVEIN_RAMP_SOUTH_Z,
  GLIMMERVEIN_TUNNEL_HALF_WIDTH,
} from '../sim/data';
import { terrainHeight } from '../sim/world';

// Glimmervein Cavern: a real underground TUNNEL (src/sim/data.ts pulls the
// ground down to a fixed floor, GLIMMERVEIN_FLOOR_Y, for the tunnel's whole
// run: a long flat 'flat'-falloff body plus a short 'smooth' ramp at each
// end so the descent is walkable). The heightfield only has a floor, no
// roof, so this module adds the ceiling. Critically it roofs the RAMPS too,
// not just the flat body: it encloses every sampled point whose height has
// actually been pulled down toward the tunnel floor (ENCLOSE_THRESHOLD),
// which covers the ramps' whole descent, so there is no open-air stretch
// anywhere along the run and the surface above stays ordinary, unbroken
// ground except right at the two small mouths where the ramp rejoins grade.
// One new src/render/<thing>.ts per the repo's "new visual system"
// convention, not a method bank on renderer.ts.

const ROCK_COLOR = 0x4a4a46;
const STALACTITE_COLOR = 0x3a3a38;
// Same tint family as the 'cave' outdoor fog preset (renderer.ts BIOME_FOG.cave
// = 0x76807c) so the ceiling stone reads as part of the same cave palette.
const CEILING_TINT = 0x76807c;
const CRYSTAL_COLOR = 0x7fd9e8;

export interface CaveTunnelView {
  group: THREE.Group;
}

// Tunnel cross-section: a thick subway-tunnel width, matching
// GLIMMERVEIN_TUNNEL_HALF_WIDTH in data.ts, plus headroom for a real
// walk-through interior.
const HALF_WIDTH = GLIMMERVEIN_TUNNEL_HALF_WIDTH;
const CEILING_HEIGHT = 12;

// Dense sample grid over the tunnel's full run (both ramps plus the body),
// x AND z, not just a centerline: every tile gets its own ceiling slab with
// zero gap to its neighbors, so the roof reads as one continuous bore with
// no sky visible anywhere along the walkable length.
const SEGMENT_STEP = 6;
const RUN_Z_MIN = GLIMMERVEIN_RAMP_SOUTH_Z - 30;
const RUN_Z_MAX = GLIMMERVEIN_RAMP_NORTH_Z + 30;
// A sampled point is "inside the tunnel" once its (already-edited) height has
// been pulled at least this far below the fixed floor's own surroundings;
// GLIMMERVEIN_FLOOR_Y is deep (-22) and ordinary ground here is roughly
// -3..+5 (well up to the ridge crest further out), so anything within this
// margin of the floor is genuinely underground, not still-descending ramp
// shoulder. Short of that (the two mouths, where the ramp's blend weight has
// faded back toward the natural surface) we leave it open to daylight.
const ENCLOSE_THRESHOLD = GLIMMERVEIN_FLOOR_Y + 10;

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
  for (let z = RUN_Z_MIN; z <= RUN_Z_MAX; z += SEGMENT_STEP) {
    const centerFloorY = terrainHeight(GLIMMERVEIN_PASS_X, z, seed);
    // Only enclose where the tunnel is actually underground at its centerline;
    // short of that we're past the mouth, in open air, by design.
    if (centerFloorY > ENCLOSE_THRESHOLD) {
      rowCounter++;
      continue;
    }

    // Tile the ceiling across the full tunnel width (a 2D grid over x AND z),
    // following the local floor height (so it tracks the ramp's descent),
    // not just a centerline strip.
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

    // Perimeter wall slabs closing the gap between the tunnel floor and the
    // ceiling's underside at both edges, hugging the real terrain wall just
    // outside the walkable width, so the roof reads as continuous rock all
    // the way around, not a floating slab with sky at the seams.
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

    // A support pillar every few rows, offset from the centerline: reads as
    // a real bored tunnel holding its own roof up, not a floating ceiling.
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
