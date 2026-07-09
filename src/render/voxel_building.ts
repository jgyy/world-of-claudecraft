// Renders the Eastbrook Vale keep (sim/content/keep.ts, sim/voxel_building.ts):
// a real open-world, multi-floor building meshed with the same voxel engine
// as voxel_terrain.ts. Presentation only: reads IWorld, never mutates it.
//
// The exterior shell (walls, door opening, roof, floor slabs) is ONE mesh,
// always visible, since it is real geometry identical for every floor. The
// per-floor difference the spec asks for ("swap the interior floor geometry
// per activeFloor") is a small marker mesh per floor (a floor-number sconce
// glow), shown only for the local player's current floor, so walking up a
// staircase visibly changes what is lit without re-meshing the building.
import * as THREE from 'three';
import type { Entity } from '../sim/types';
import {
  KEEP_FLOORS,
  KEEP_HALF,
  KEEP_POS,
  KEEP_TOTAL_HEIGHT,
  keepBaseY,
  keepFloorY,
  keepVoxelDensity,
} from '../sim/voxel_building';
import { meshVoxelChunk } from '../sim/voxel_mesh';
import { surfaceMat } from './gfx';

export interface KeepView {
  group: THREE.Group;
  /** Call once per frame with the local player entity to swap the
   * per-floor marker to match `activeFloor` (0 = outside, hides all). */
  update(localPlayer: Entity | undefined): void;
}

const WALL_COLOR = 0x9a8f7d;
const FLOOR_MARKER_COLORS = [0x5fb0ff, 0x7fe07f, 0xffb35f]; // floor 1 / 2 / 3

export function buildKeepView(seed: number): KeepView {
  const group = new THREE.Group();
  group.name = 'keep';

  const baseY = keepBaseY(seed);
  const density = (x: number, y: number, z: number) => keepVoxelDensity(x, y, z, seed);
  const pad = KEEP_HALF * 0.3;
  const mesh = meshVoxelChunk(density, {
    x0: KEEP_POS.x - KEEP_HALF - pad,
    y0: baseY - 1,
    z0: KEEP_POS.z - KEEP_HALF - pad,
    size: KEEP_HALF * 2 + 2 * pad,
    resolution: 64,
  });

  if (mesh.positions.length > 0) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(mesh.positions, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(mesh.normals, 3));
    geo.setIndex(new THREE.BufferAttribute(mesh.indices, 1));
    const mat = surfaceMat({ color: WALL_COLOR, roughness: 0.85 });
    const shell = new THREE.Mesh(geo, mat);
    shell.castShadow = true;
    shell.receiveShadow = true;
    shell.name = 'keep-shell';
    group.add(shell);
  }

  // One small glow marker + matching point light per floor at its landing,
  // only the local player's CURRENT floor lit at a time. The keep is an
  // open-world building (not a dungeon interior instance), so it gets no
  // "drop sun + sky ambient" indoor override from renderer.ts; with walls
  // and a roof blocking daylight, the point light is the ONLY practical
  // light source up here, same convention dungeon.ts uses for its KayKit
  // interiors (torch PointLights carry the whole scene, see
  // DUNGEON_LIGHT_INTENSITY/DUNGEON_LIGHT_DISTANCE). Matched to that
  // magnitude rather than the much dimmer decorative glow this used to be,
  // and ranged to clear the KEEP_HALF*2 footprint corner-to-corner. Cheap,
  // instance-free: this building is a single fixed landmark, not a repeated
  // prop.
  const KEEP_LIGHT_INTENSITY = 42;
  const KEEP_LIGHT_DISTANCE = KEEP_HALF * 4;
  const markers: THREE.Mesh[] = [];
  const lights: THREE.PointLight[] = [];
  for (let floor = 1; floor <= KEEP_FLOORS; floor++) {
    const y = keepFloorY(seed, floor) + 0.4;
    const color = FLOOR_MARKER_COLORS[floor - 1] ?? 0xffffff;
    const geo = new THREE.SphereGeometry(0.35, 12, 8);
    const mat = surfaceMat({ color, emissive: color, emissiveIntensity: 1.2 });
    const marker = new THREE.Mesh(geo, mat);
    marker.position.set(KEEP_POS.x, y, KEEP_POS.z);
    marker.visible = false;
    marker.name = `keep-floor-marker-${floor}`;
    group.add(marker);
    markers.push(marker);

    const light = new THREE.PointLight(0xfff2d0, KEEP_LIGHT_INTENSITY, KEEP_LIGHT_DISTANCE, 2);
    light.position.set(KEEP_POS.x, y + 2.2, KEEP_POS.z);
    light.visible = false;
    group.add(light);
    lights.push(light);
  }

  return {
    group,
    update(localPlayer) {
      const active = localPlayer?.activeFloor ?? 0;
      for (let i = 0; i < markers.length; i++) {
        const visible = active === i + 1;
        markers[i].visible = visible;
        lights[i].visible = visible;
      }
    },
  };
}

export { KEEP_POS, KEEP_TOTAL_HEIGHT };
