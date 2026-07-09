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

  // One small glow marker per floor at its landing, only one visible at a
  // time (the local player's current floor). Cheap, instance-free: this
  // building is a single fixed landmark, not a repeated prop.
  const markers: THREE.Mesh[] = [];
  for (let floor = 1; floor <= KEEP_FLOORS; floor++) {
    const y = keepFloorY(seed, floor) + 0.4;
    const geo = new THREE.SphereGeometry(0.35, 12, 8);
    const mat = surfaceMat({
      color: FLOOR_MARKER_COLORS[floor - 1] ?? 0xffffff,
      emissive: FLOOR_MARKER_COLORS[floor - 1] ?? 0xffffff,
      emissiveIntensity: 1.2,
    });
    const marker = new THREE.Mesh(geo, mat);
    marker.position.set(KEEP_POS.x, y, KEEP_POS.z);
    marker.visible = false;
    marker.name = `keep-floor-marker-${floor}`;
    group.add(marker);
    markers.push(marker);
  }

  return {
    group,
    update(localPlayer) {
      const active = localPlayer?.activeFloor ?? 0;
      for (let i = 0; i < markers.length; i++) {
        markers[i].visible = active === i + 1;
      }
    },
  };
}

export { KEEP_POS, KEEP_TOTAL_HEIGHT };
