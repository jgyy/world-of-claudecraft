import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { TUNNELS, tunnelBounds, tunnelCarveDensity } from '../sim/voxel';
import { meshVoxelChunk } from '../sim/voxel_mesh';

// Renders the hand-authored TunnelVolume content (content/tunnels.ts) into
// the live game world: a small voxel-meshed patch built ONLY across each
// tunnel's own bounding box (see tunnelBounds), not the whole map. This is
// deliberately narrower than voxel_terrain.ts's whole-world verification
// build (which replaces the production heightfield mesh everywhere and is
// wired to nothing but its own screenshot tour script): swapping the entire
// production terrain renderer for the voxel engine is its own follow-up, out
// of scope here. This module only makes the carved tunnels themselves
// visible, as an additive interior mesh layered under the existing
// heightfield terrain (terrain.ts) at each tunnel's footprint.
//
// Meshes tunnelCarveDensity (the tunnel's own capsule geometry), NOT the
// terrain-blended voxelDensity used for gameplay: meshing voxelDensity would
// re-tessellate the ordinary ground surface itself wherever a tunnel's
// padded chunk box brushes near it (every mouth, by construction), producing
// a second, z-fighting copy of the terrain mesh layered right over the real
// one. Meshing the tunnel's own carve alone always produces a clean, terrain-
// independent tube: solid rock walls underground (which is exactly what
// should be visible from inside), and at each mouth a rounded knoll where the
// capsule's end cap pokes out near the surface, never a duplicate terrain
// patch.
//
// Known cosmetic limitation: terrain.ts's heightfield can't be "cut a hole
// in" at a tunnel mouth (it's a 2.5D height field, one height per x,z, same
// reason colliders.ts/pathfind.ts needed tunnel_traversal.ts), so the mouth
// reads as a rocky knoll with a dark hollow rather than a seamlessly carved
// cliff face. The tunnels are authored so both mouths sit close to the local
// terrainHeight (see content/tunnels.ts), keeping the seam minor. Fully
// blending it means terrain.ts learning to mask a footprint, a documented
// follow-up, not this pass.

const CHUNK_SIZE = 16; // world units per chunk cube, matches voxel_terrain.ts
const CHUNK_RESOLUTION = 24; // voxels per axis: finer than the whole-map build since this is tiny
const OVERLAP_VOXELS = 1; // extra voxel cells of overlap padded onto every chunk side, avoids seams
const BOUNDS_MARGIN = 1; // yd padding around each tunnel's own AABB (just enough for mesher overlap)

const ROCK_COLOR = 0x6b6459;

export interface TunnelOverlayView {
  group: THREE.Group;
  chunkCount: number;
  triangleCount: number;
}

export function buildTunnelOverlay(): TunnelOverlayView {
  const group = new THREE.Group();
  group.name = 'tunnel-overlay';
  const density = tunnelCarveDensity;
  const material = new THREE.MeshStandardMaterial({
    color: ROCK_COLOR,
    roughness: 0.95,
    metalness: 0,
  });

  let chunkCount = 0;
  let triangleCount = 0;
  const step = CHUNK_SIZE / CHUNK_RESOLUTION;
  const pad = step * OVERLAP_VOXELS;

  for (const tunnel of TUNNELS) {
    const b = tunnelBounds(tunnel);
    const cx0 = Math.floor((b.minX - BOUNDS_MARGIN) / CHUNK_SIZE);
    const cx1 = Math.ceil((b.maxX + BOUNDS_MARGIN) / CHUNK_SIZE);
    const cy0 = Math.floor((b.minY - BOUNDS_MARGIN) / CHUNK_SIZE);
    const cy1 = Math.ceil((b.maxY + BOUNDS_MARGIN) / CHUNK_SIZE);
    const cz0 = Math.floor((b.minZ - BOUNDS_MARGIN) / CHUNK_SIZE);
    const cz1 = Math.ceil((b.maxZ + BOUNDS_MARGIN) / CHUNK_SIZE);

    const geos: THREE.BufferGeometry[] = [];
    for (let cx = cx0; cx < cx1; cx++) {
      for (let cy = cy0; cy < cy1; cy++) {
        for (let cz = cz0; cz < cz1; cz++) {
          const mesh = meshVoxelChunk(density, {
            x0: cx * CHUNK_SIZE - pad,
            y0: cy * CHUNK_SIZE - pad,
            z0: cz * CHUNK_SIZE - pad,
            size: CHUNK_SIZE + 2 * pad,
            resolution: CHUNK_RESOLUTION + 2 * OVERLAP_VOXELS,
          });
          if (mesh.positions.length === 0) continue;
          const geo = new THREE.BufferGeometry();
          geo.setAttribute('position', new THREE.BufferAttribute(mesh.positions, 3));
          geo.setAttribute('normal', new THREE.BufferAttribute(mesh.normals, 3));
          geo.setIndex(new THREE.BufferAttribute(mesh.indices, 1));
          geos.push(geo);
          chunkCount++;
          triangleCount += mesh.indices.length / 3;
        }
      }
    }
    if (geos.length === 0) continue;
    const merged = geos.length === 1 ? geos[0] : mergeGeometries(geos, false);
    if (!merged) continue;
    const tunnelMesh = new THREE.Mesh(merged, material);
    tunnelMesh.name = `tunnel-overlay-${tunnel.id}`;
    tunnelMesh.matrixAutoUpdate = false;
    tunnelMesh.updateMatrix();
    group.add(tunnelMesh);
  }

  return { group, chunkCount, triangleCount };
}
