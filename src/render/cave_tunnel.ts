import * as THREE from 'three';
import { GLIMMERVEIN_GORGE_ZS, GLIMMERVEIN_PASS_X } from '../sim/data';
import { terrainHeight } from '../sim/world';

// Glimmervein Cavern: a real tunnel through the natural zone1/zone2 mountain
// ridge (src/sim/world.ts pierces that ridge with a second, narrow pass at
// GLIMMERVEIN_PASS_X, distinct from the wide x=0 causeway pass). Because that
// pass is tight, the ordinary heightfield itself closes back to a tall, close
// rock wall a short distance from the walkable centerline; this module only
// adds the CEILING (the heightfield has no roof geometry, only a floor), plus
// wall-facing rock slabs that hug those real walls and glowing crystal props
// for underground light, so the corridor reads as an enclosed tunnel, not an
// open mountain notch. One new src/render/<thing>.ts per the repo's "new
// visual system" convention, not a method bank on renderer.ts.

const ROCK_COLOR = 0x4a4a46;
const STALACTITE_COLOR = 0x3a3a38;
// Same tint family as the 'cave' outdoor fog preset (renderer.ts BIOME_FOG.cave
// = 0x76807c) so the ceiling stone reads as part of the same cave palette.
const CEILING_TINT = 0x76807c;
const CRYSTAL_COLOR = 0x7fd9e8;

export interface CaveTunnelView {
  group: THREE.Group;
}

// Tunnel cross-section: fixed and narrow (independent of the ridge's full
// ~40yd height above), so it reads as a snug rock corridor, not a canyon with
// a floating roof. The pass's real walls sit just past HALF_WIDTH; the wall
// slabs and ceiling are placed to hug them with no visible gap.
const HALF_WIDTH = 6;
const CEILING_HEIGHT = 8;

// Dense sample step along the tunnel centerline. Each ceiling/wall segment is
// SEGMENT_STEP deep with zero gap to its neighbor, so the roof reads as one
// continuous tunnel with no sky visible along the walkable length, not
// periodic archways with open sky showing through the gaps between them.
// Only the two true end mouths (where the ridge itself tapers below the
// enclosure threshold) stay open, reading as the tunnel's entrance/exit.
const SEGMENT_STEP = 4;
const GORGE_Z_MIN = Math.min(...GLIMMERVEIN_GORGE_ZS) - 6;
const GORGE_Z_MAX = Math.max(...GLIMMERVEIN_GORGE_ZS) + 6;
// The real ridge wall, sampled just past the pass shoulder, must clear this
// much above the floor before we call the spot "inside the mountain" and
// enclose it; short of that (the two mouths) we leave it open to daylight.
const ENCLOSURE_SPAN_MIN = 10;
// Sampled a bit past the pass shoulder (GLIMMERVEIN_PASS_SHOULDER=15 in
// world.ts) so this reads the ridge's real, near-full-height wall, not the
// still-opening shoulder slope.
const WALL_SAMPLE_OFFSET = 18;

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

  let segCounter = 0;
  for (let z = GORGE_Z_MIN; z <= GORGE_Z_MAX; z += SEGMENT_STEP) {
    const floorY = terrainHeight(GLIMMERVEIN_PASS_X, z, seed);
    const wallTop = wallHeightAt(floorY, z, seed);
    const span = wallTop - floorY;
    // Only enclose where the real ridge wall is tall enough to plausibly hold
    // a roof; the tunnel mouths (low ridge, span below threshold) stay open
    // sky by design, reading as the entrance/exit rather than a mid-tunnel gap.
    if (span < ENCLOSURE_SPAN_MIN) continue;

    const ceilingY = floorY + CEILING_HEIGHT;
    const ceiling = new THREE.Mesh(
      new THREE.BoxGeometry(HALF_WIDTH * 2 + 4, 3.2, SEGMENT_STEP + 0.4),
      ceilingMat,
    );
    ceiling.position.set(GLIMMERVEIN_PASS_X, ceilingY, z);
    group.add(ceiling);

    // Side wall slabs closing the gap between the tunnel floor and the
    // ceiling's underside, hugging the real ridge terrain just outside the
    // walkable width, so the roof reads as continuous rock, not a floating
    // slab with sky visible at the seams.
    for (const side of [-1, 1]) {
      const wall = new THREE.Mesh(
        new THREE.BoxGeometry(4, CEILING_HEIGHT, SEGMENT_STEP + 0.4),
        rockMat,
      );
      wall.position.set(
        GLIMMERVEIN_PASS_X + side * (HALF_WIDTH + 2),
        floorY + CEILING_HEIGHT / 2,
        z,
      );
      group.add(wall);
    }

    // Stalactites hanging from the ceiling underside for silhouette, thinned
    // out (every other segment) so they read as detail rather than clutter.
    if (segCounter % 2 === 0) {
      for (const dx of [-4, 0, 4]) {
        const stal = new THREE.Mesh(new THREE.ConeGeometry(0.7, 2, 6), stalMat);
        stal.rotation.x = Math.PI;
        stal.position.set(GLIMMERVEIN_PASS_X + dx, ceilingY - 2, z + (dx === 0 ? 0 : 1.2));
        group.add(stal);
      }
    }

    // Glowing crystal clusters embedded in the walls every few segments: the
    // "Glimmervein" light source, in the absence of daylight this deep in.
    if (segCounter % 3 === 0) {
      const side = segCounter % 6 === 0 ? -1 : 1;
      const crystal = new THREE.Mesh(new THREE.OctahedronGeometry(0.9), crystalMat);
      crystal.position.set(GLIMMERVEIN_PASS_X + side * (HALF_WIDTH - 0.5), floorY + 2.2, z);
      group.add(crystal);
      const light = new THREE.PointLight(CRYSTAL_COLOR, 1.4, 14, 2);
      light.position.copy(crystal.position);
      group.add(light);
    }
    segCounter++;
  }

  group.traverse((obj) => {
    obj.castShadow = false;
    obj.receiveShadow = false;
  });
  return { group };
}
