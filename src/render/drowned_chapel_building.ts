// Renders the Drowned Chapel (sim/content/drowned_chapel.ts,
// sim/drowned_chapel_building.ts): a real open-world, 2-story ruined temple
// building meshed with the same voxel engine as voxel_terrain.ts, replacing
// the Zone 2 ruin compound's old freestanding perimeter wall. Presentation
// only: reads IWorld, never mutates it.
//
// The exterior shell (walls, door opening, carved windows, floor slabs) is
// ONE mesh, meshed via the shared marching-cubes chunker. A weathered,
// cracked look (matching the Tripo prop aesthetic already decorating the
// compound) comes from the stone/wall texture set already used by other
// stone structures, tinted mossy/grey rather than the warm plaster of a kept
// building.
import * as THREE from 'three';
import {
  CHAPEL_DOOR_HALF_WIDTH,
  CHAPEL_DOOR_HEIGHT,
  CHAPEL_FLOOR_HEIGHT,
  CHAPEL_WINDOW_HALF_WIDTH,
  CHAPEL_WINDOW_HEIGHT,
} from '../sim/content/drowned_chapel';
import {
  CHAPEL_FLOORS,
  CHAPEL_HALF,
  CHAPEL_POS,
  CHAPEL_TOTAL_HEIGHT,
  chapelBaseY,
  chapelFloorY,
  chapelVoxelDensity,
  chapelWindowSpecs,
} from '../sim/drowned_chapel_building';
import type { Entity } from '../sim/types';
import { meshVoxelChunk } from '../sim/voxel_mesh';
import { buildChapelStairs } from './drowned_chapel_stairs';
import { surfaceMat } from './gfx';
import { plankMaps, stoneMaps, wallMaps } from './textures';

export interface ChapelView {
  group: THREE.Group;
  /** Call once per frame with the local player entity to swap the per-floor
   * marker to match `chapelFloor` (0 = outside, hides all). */
  update(localPlayer: Entity | undefined): void;
}

const FLOOR_MARKER_COLORS = [0x6fd0ff, 0x9fffb0];
const TEX_SCALE = 3;

// Assigns one UV set to a raw triangle soup by projecting each triangle along
// whichever axis its face normal is most aligned with, and buckets triangles
// into a "ground" (stone) or "upper" (weathered wall) material group by
// average vertex height, same technique the terrain/keep-style shells use.
function projectShellUVs(
  positions: Float32Array,
  normals: Float32Array,
  indices: Uint32Array | Uint16Array,
  baseY: number,
): { uv: Float32Array; groundIndices: number[]; upperIndices: number[] } {
  const uv = new Float32Array((positions.length / 3) * 2);
  const groundIndices: number[] = [];
  const upperIndices: number[] = [];
  const groundBandTop = baseY + CHAPEL_FLOOR_HEIGHT * 0.9;

  for (let t = 0; t < indices.length; t += 3) {
    const i0 = indices[t];
    const i1 = indices[t + 1];
    const i2 = indices[t + 2];
    const nx = (normals[i0 * 3] + normals[i1 * 3] + normals[i2 * 3]) / 3;
    const ny = (normals[i0 * 3 + 1] + normals[i1 * 3 + 1] + normals[i2 * 3 + 1]) / 3;
    const nz = (normals[i0 * 3 + 2] + normals[i1 * 3 + 2] + normals[i2 * 3 + 2]) / 3;
    const ax = Math.abs(nx);
    const ay = Math.abs(ny);
    const az = Math.abs(nz);
    const dominant = ax > ay && ax > az ? 'x' : ay > az ? 'y' : 'z';

    let avgY = 0;
    for (const vi of [i0, i1, i2]) {
      const px = positions[vi * 3];
      const py = positions[vi * 3 + 1];
      const pz = positions[vi * 3 + 2];
      avgY += py;
      let u: number;
      let v: number;
      if (dominant === 'x') {
        u = pz;
        v = py;
      } else if (dominant === 'z') {
        u = px;
        v = py;
      } else {
        u = px;
        v = pz;
      }
      uv[vi * 2] = u / TEX_SCALE;
      uv[vi * 2 + 1] = v / TEX_SCALE;
    }
    avgY /= 3;
    if (avgY <= groundBandTop) groundIndices.push(i0, i1, i2);
    else upperIndices.push(i0, i1, i2);
  }

  return { uv, groundIndices, upperIndices };
}

function buildShellMesh(seed: number): THREE.Mesh | null {
  const baseY = chapelBaseY(seed);
  const density = (x: number, y: number, z: number) => chapelVoxelDensity(x, y, z, seed);
  const pad = CHAPEL_HALF * 0.3;
  const widthSpan = CHAPEL_HALF * 2 + 2 * pad;
  const heightSpan = CHAPEL_TOTAL_HEIGHT + 2;
  const size = Math.max(widthSpan, heightSpan);
  const mesh = meshVoxelChunk(density, {
    x0: CHAPEL_POS.x - size / 2,
    y0: baseY - 1,
    z0: CHAPEL_POS.z - size / 2,
    size,
    resolution: 72,
  });
  if (mesh.positions.length === 0) return null;

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(mesh.positions, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(mesh.normals, 3));

  const { uv, groundIndices, upperIndices } = projectShellUVs(
    mesh.positions,
    mesh.normals,
    mesh.indices,
    baseY,
  );
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));

  const combined = new Uint32Array(groundIndices.length + upperIndices.length);
  combined.set(groundIndices, 0);
  combined.set(upperIndices, groundIndices.length);
  geo.setIndex(new THREE.BufferAttribute(combined, 1));
  geo.addGroup(0, groundIndices.length, 0);
  geo.addGroup(groundIndices.length, upperIndices.length, 1);

  const stone = stoneMaps();
  const wall = wallMaps();
  // Weathered / mossy tones, matching the Tripo ruin props: darker, greyer,
  // and desaturated versus a kept building's warm stone/plaster.
  const groundMat = surfaceMat({
    color: 0x7d7a68,
    map: stone.map,
    normalMap: stone.normalMap,
    roughness: 0.96,
  });
  const upperMat = surfaceMat({
    color: 0x8f9280,
    map: wall.map,
    normalMap: wall.normalMap,
    roughness: 0.9,
  });

  const shell = new THREE.Mesh(geo, [groundMat, upperMat]);
  shell.castShadow = true;
  shell.receiveShadow = true;
  shell.name = 'chapel-shell';
  return shell;
}

// Timber-and-stone door surround plus plank-framed window insets in each
// real carved opening (the sim carves only the opening itself).
function buildDoorAndWindows(seed: number): THREE.Group {
  const group = new THREE.Group();
  group.name = 'chapel-door-windows';
  const baseY = chapelBaseY(seed);
  const plank = plankMaps();
  const frameMat = surfaceMat({
    color: 0x4c3a26,
    map: plank.map,
    normalMap: plank.normalMap,
    roughness: 0.95,
  });
  const paneMat = surfaceMat({ color: 0x1c1712, roughness: 0.7 });

  const postW = 0.28;
  const postH = CHAPEL_DOOR_HEIGHT + 0.3;
  const postGeo = new THREE.BoxGeometry(postW, postH, 0.32);
  for (const side of [-1, 1]) {
    const post = new THREE.Mesh(postGeo, frameMat);
    post.position.set(
      CHAPEL_POS.x + side * (CHAPEL_DOOR_HALF_WIDTH + postW / 2),
      baseY + postH / 2,
      CHAPEL_POS.z + CHAPEL_HALF,
    );
    post.castShadow = true;
    group.add(post);
  }
  const lintel = new THREE.Mesh(
    new THREE.BoxGeometry(CHAPEL_DOOR_HALF_WIDTH * 2 + postW * 2, 0.36, 0.32),
    frameMat,
  );
  lintel.position.set(CHAPEL_POS.x, baseY + CHAPEL_DOOR_HEIGHT + 0.18, CHAPEL_POS.z + CHAPEL_HALF);
  lintel.castShadow = true;
  group.add(lintel);

  const winW = CHAPEL_WINDOW_HALF_WIDTH * 2;
  const winH = CHAPEL_WINDOW_HEIGHT;
  for (const w of chapelWindowSpecs()) {
    const y = baseY + w.ly;
    const northSouth = w.wall === 'north' || w.wall === 'south';
    const outSign = w.wall === 'north' || w.wall === 'east' ? 1 : -1;
    const rotY = northSouth ? (w.wall === 'north' ? 0 : Math.PI) : outSign * (Math.PI / 2);

    const pane = new THREE.Mesh(new THREE.PlaneGeometry(winW, winH), paneMat);
    pane.rotation.y = rotY;
    pane.position.set(w.x, y, w.z);
    if (northSouth) pane.position.z += outSign * 0.06;
    else pane.position.x += outSign * 0.06;
    group.add(pane);

    const frameW = winW + 0.2;
    const frameH = winH + 0.2;
    const frameGeo = northSouth
      ? new THREE.BoxGeometry(frameW, frameH, 0.13)
      : new THREE.BoxGeometry(0.13, frameH, frameW);
    const frame = new THREE.Mesh(frameGeo, frameMat);
    frame.position.set(w.x, y, w.z);
    if (northSouth) frame.position.z += outSign * 0.02;
    else frame.position.x += outSign * 0.02;
    frame.castShadow = true;
    group.add(frame);
  }
  return group;
}

// Per-floor ground covering: worn stone flags both floors (a ruined temple,
// not a timbered house), a thin textured slab just above each floor's
// collision height.
function buildFloorCoverings(seed: number): THREE.Group {
  const group = new THREE.Group();
  group.name = 'chapel-floor-coverings';
  const stone = stoneMaps();
  const stoneMat = surfaceMat({
    color: 0x8a8776,
    map: stone.map,
    normalMap: stone.normalMap,
    roughness: 0.94,
  });

  for (let floor = 1; floor <= CHAPEL_FLOORS; floor++) {
    const y = chapelFloorY(seed, floor) + 0.05;
    const geo = new THREE.PlaneGeometry(CHAPEL_HALF * 2 - 0.4, CHAPEL_HALF * 2 - 0.4);
    geo.rotateX(-Math.PI / 2);
    const slab = new THREE.Mesh(geo, stoneMat);
    slab.position.set(CHAPEL_POS.x, y, CHAPEL_POS.z);
    slab.receiveShadow = true;
    group.add(slab);
  }
  return group;
}

// A simple, partly-broken flat roof slab: fitting the ruined aesthetic (no
// pitched, well-kept roof for a temple that has stood open to the marsh air).
function buildRuinedRoof(seed: number): THREE.Mesh {
  const stone = stoneMaps();
  const mat = surfaceMat({
    color: 0x6c6a5c,
    map: stone.map,
    normalMap: stone.normalMap,
    roughness: 0.98,
  });
  const y = chapelBaseY(seed) + CHAPEL_TOTAL_HEIGHT + 0.3;
  // Slightly undersized versus the full footprint: reads as a partially
  // collapsed roof, open sky visible at the corners.
  const geo = new THREE.BoxGeometry(CHAPEL_HALF * 1.7, 0.5, CHAPEL_HALF * 1.7);
  const roof = new THREE.Mesh(geo, mat);
  roof.position.set(CHAPEL_POS.x, y, CHAPEL_POS.z);
  roof.castShadow = true;
  roof.receiveShadow = true;
  roof.name = 'chapel-roof';
  return roof;
}

export function buildChapelView(seed: number): ChapelView {
  const group = new THREE.Group();
  group.name = 'drowned-chapel';

  const shell = buildShellMesh(seed);
  if (shell) group.add(shell);
  group.add(buildRuinedRoof(seed));
  group.add(buildDoorAndWindows(seed));
  group.add(buildFloorCoverings(seed));
  const stairs = buildChapelStairs(seed);
  if (stairs) group.add(stairs);

  // One small glow marker per floor at its landing, only the local player's
  // CURRENT floor lit at a time.
  const markers: THREE.Mesh[] = [];
  for (let floor = 1; floor <= CHAPEL_FLOORS; floor++) {
    const y = chapelFloorY(seed, floor) + 0.4;
    const color = FLOOR_MARKER_COLORS[floor - 1] ?? 0xffffff;
    const geo = new THREE.SphereGeometry(0.3, 12, 8);
    const mat = surfaceMat({ color, emissive: color, emissiveIntensity: 1.1 });
    const marker = new THREE.Mesh(geo, mat);
    marker.position.set(CHAPEL_POS.x, y, CHAPEL_POS.z);
    marker.visible = false;
    marker.name = `chapel-floor-marker-${floor}`;
    group.add(marker);
    markers.push(marker);
  }

  return {
    group,
    update(localPlayer) {
      const active = localPlayer?.chapelFloor ?? 0;
      for (let i = 0; i < markers.length; i++) {
        markers[i].visible = active === i + 1;
      }
    },
  };
}

export { CHAPEL_POS, CHAPEL_TOTAL_HEIGHT };
