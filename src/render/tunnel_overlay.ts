import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { WORLD_MAX_X, WORLD_MAX_Z, WORLD_MIN_Z } from '../sim/data';
import { chunkNearAnyTunnel, TUNNELS, tunnelBounds, voxelDensity } from '../sim/voxel';
import { meshVoxelChunk } from '../sim/voxel_mesh';
import { terrainHeight } from '../sim/world';
import { loadTexture } from './assets/loader';
import { registerPreload } from './assets/preload';
import { CHUNK_SIZE as TERRAIN_CHUNK_SIZE, TUNNEL_CHUNK_MARGIN } from './terrain';

// Renders the hand-authored TunnelVolume content (content/tunnels.ts) as part
// of the SAME continuous ground surface as the rest of the map, not a second
// layer: terrain.ts leaves a hole (chunkNearAnyTunnel) over exactly the 60yd
// terrain chunks a tunnel's footprint touches, and this module fills that
// same hole with a voxel-meshed patch built from voxelDensity - the ordinary
// terrain-blended density (open air above the surface, solid below, EXCEPT
// where a tunnel's carve wins and opens a cave). One continuous isosurface:
// the ground really deforms down into a cave mouth exactly where the terrain
// used to just end abruptly against a separate rock knoll, and the two
// pieces can never z-fight because there is only the one mesh here, never a
// classic terrain chunk underneath it too.
const SUBCHUNK = 16; // world units per fine voxel-meshing sub-chunk
const VOXEL_RESOLUTION = 24; // voxels per axis per sub-chunk (finer than the terrain grid this replaces)
const OVERLAP_VOXELS = 1; // extra voxel cells of overlap padded onto every sub-chunk side, avoids seams
const HEIGHT_MARGIN = 8; // yd of slack around the sampled local terrain height band

// Real PBR albedo (ambientCG 1K, the same asset set voxel_terrain.ts already
// ships under public/textures/terrain): grass for open ground, rock for
// steep faces and the tunnel's own walls/ceiling, triplanar-projected and
// blended by slope so the patch reads as the same ground as the surrounding
// terrain, not a differently-textured insert.
const TEX: Record<string, THREE.Texture> = {};
function kickTex(key: string, file: string): void {
  registerPreload(
    loadTexture(`/textures/terrain/${file}`, { srgb: true, repeat: true }).then((tex) => {
      TEX[key] = tex;
      return tex;
    }),
  );
}
kickTex('grassC', 'Grass001_Color.jpg');
kickTex('rockC', 'Rock051_Color.jpg');

export interface TunnelOverlayView {
  group: THREE.Group;
  chunkCount: number;
  triangleCount: number;
}

interface PatchRegion {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

// The exact terrain.ts chunks excluded on the identical grid, as INDIVIDUAL
// boxes (never a single bounding rectangle across all of them): two tunnels
// far apart in x but overlapping in z (as here: vale_kobold_warren at x~60-84
// and vale_marsh_ridge_tunnel at x~110) would otherwise inflate one bounding
// box to also cover the large empty stretch between them, meshing far more
// world than any tunnel actually touches.
function excludedChunks(): PatchRegion[] {
  const chunksX = Math.ceil((WORLD_MAX_X * 2) / TERRAIN_CHUNK_SIZE);
  const chunksZ = Math.ceil((WORLD_MAX_Z - WORLD_MIN_Z) / TERRAIN_CHUNK_SIZE);
  const out: PatchRegion[] = [];
  for (let cz = 0; cz < chunksZ; cz++) {
    for (let cx = 0; cx < chunksX; cx++) {
      const x0 = -WORLD_MAX_X + cx * TERRAIN_CHUNK_SIZE;
      const z0 = WORLD_MIN_Z + cz * TERRAIN_CHUNK_SIZE;
      if (
        !chunkNearAnyTunnel(x0, z0, TERRAIN_CHUNK_SIZE, TERRAIN_CHUNK_SIZE, TUNNEL_CHUNK_MARGIN)
      ) {
        continue;
      }
      out.push({
        minX: x0,
        maxX: x0 + TERRAIN_CHUNK_SIZE,
        minZ: z0,
        maxZ: z0 + TERRAIN_CHUNK_SIZE,
      });
    }
  }
  return out;
}

// Local vertical band ONE excluded chunk needs to mesh: the sampled terrain
// height across just that chunk's footprint, widened to also cover any
// tunnel's own vertical extent that overlaps it (a tunnel can dip well below
// the surrounding terrain sample points), plus a margin on both ends.
function heightBand(region: PatchRegion, seed: number): { min: number; max: number } {
  let min = Infinity;
  let max = -Infinity;
  const steps = 4;
  for (let i = 0; i <= steps; i++) {
    for (let j = 0; j <= steps; j++) {
      const x = region.minX + (region.maxX - region.minX) * (i / steps);
      const z = region.minZ + (region.maxZ - region.minZ) * (j / steps);
      const h = terrainHeight(x, z, seed);
      if (h < min) min = h;
      if (h > max) max = h;
    }
  }
  for (const tunnel of TUNNELS) {
    const b = tunnelBounds(tunnel);
    if (
      b.minX > region.maxX ||
      b.maxX < region.minX ||
      b.minZ > region.maxZ ||
      b.maxZ < region.minZ
    ) {
      continue;
    }
    min = Math.min(min, b.minY);
    max = Math.max(max, b.maxY);
  }
  return { min: min - HEIGHT_MARGIN, max: max + HEIGHT_MARGIN };
}

export function buildTunnelOverlay(seed: number): TunnelOverlayView {
  const group = new THREE.Group();
  group.name = 'tunnel-overlay';
  const chunks = excludedChunks();
  if (chunks.length === 0) return { group, chunkCount: 0, triangleCount: 0 };

  const density = (x: number, y: number, z: number) => voxelDensity(x, y, z, seed);
  const material = new THREE.MeshStandardMaterial({ roughness: 0.92, metalness: 0 });
  material.onBeforeCompile = (shader) => {
    shader.uniforms.grassMap = { value: TEX.grassC };
    shader.uniforms.rockMap = { value: TEX.rockC };
    shader.vertexShader = shader.vertexShader.replace(
      '#include <common>',
      `#include <common>
      varying vec3 vWorldPos;
      varying vec3 vWorldNormal;`,
    );
    shader.vertexShader = shader.vertexShader.replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
      vWorldPos = (modelMatrix * vec4(position, 1.0)).xyz;
      vWorldNormal = normalize(mat3(modelMatrix) * normal);`,
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <common>',
      `#include <common>
      uniform sampler2D grassMap;
      uniform sampler2D rockMap;
      varying vec3 vWorldPos;
      varying vec3 vWorldNormal;
      vec3 triplanar(sampler2D tex, vec3 pos, vec3 blend, float scale) {
        vec3 xCol = texture2D(tex, pos.yz * scale).rgb;
        vec3 yCol = texture2D(tex, pos.xz * scale).rgb;
        vec3 zCol = texture2D(tex, pos.xy * scale).rgb;
        return xCol * blend.x + yCol * blend.y + zCol * blend.z;
      }`,
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <map_fragment>',
      `{
        vec3 n = normalize(vWorldNormal);
        vec3 blend = abs(n);
        blend /= (blend.x + blend.y + blend.z);
        // Grass on up-facing, walkable ground; rock everywhere steeper -
        // the tunnel's own walls and ceiling are always steep-to-vertical
        // or facing downward, so they read as bare rock, same as the
        // production terrain's own slope-based blend (terrain.ts).
        float slopeT = clamp(1.0 - (n.y - 0.3) / 0.5, 0.0, 1.0);
        vec3 grassAlb = triplanar(grassMap, vWorldPos, blend, 0.05);
        vec3 rockAlb = triplanar(rockMap, vWorldPos, blend, 0.045);
        diffuseColor.rgb *= mix(grassAlb, rockAlb, slopeT);
      }`,
    );
  };

  let chunkCount = 0;
  let triangleCount = 0;
  const step = SUBCHUNK / VOXEL_RESOLUTION;
  const pad = step * OVERLAP_VOXELS;
  const geos: THREE.BufferGeometry[] = [];

  // Every fine sub-chunk (cx, cz) any excluded terrain chunk actually
  // touches, deduplicated: two adjacent excluded 60yd chunks share sub-chunk
  // columns along their boundary (60 isn't a multiple of SUBCHUNK), and a
  // global vertical band across only the chunks that are ACTUALLY excluded
  // (never the empty space between two separate tunnels - see excludedChunks
  // above).
  const subchunkKeys = new Set<string>();
  let bandMin = Infinity;
  let bandMax = -Infinity;
  for (const chunk of chunks) {
    const b = heightBand(chunk, seed);
    bandMin = Math.min(bandMin, b.min);
    bandMax = Math.max(bandMax, b.max);
    const cx0 = Math.floor(chunk.minX / SUBCHUNK);
    const cx1 = Math.ceil(chunk.maxX / SUBCHUNK);
    const cz0 = Math.floor(chunk.minZ / SUBCHUNK);
    const cz1 = Math.ceil(chunk.maxZ / SUBCHUNK);
    for (let cx = cx0; cx < cx1; cx++) {
      for (let cz = cz0; cz < cz1; cz++) subchunkKeys.add(`${cx},${cz}`);
    }
  }
  const cy0 = Math.floor(bandMin / SUBCHUNK);
  const cy1 = Math.ceil(bandMax / SUBCHUNK);

  for (const key of subchunkKeys) {
    const [cx, cz] = key.split(',').map(Number);
    for (let cy = cy0; cy < cy1; cy++) {
      const mesh = meshVoxelChunk(density, {
        x0: cx * SUBCHUNK - pad,
        y0: cy * SUBCHUNK - pad,
        z0: cz * SUBCHUNK - pad,
        size: SUBCHUNK + 2 * pad,
        resolution: VOXEL_RESOLUTION + 2 * OVERLAP_VOXELS,
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

  if (geos.length > 0) {
    const merged = geos.length === 1 ? geos[0] : mergeGeometries(geos, false);
    if (merged) {
      const patchMesh = new THREE.Mesh(merged, material);
      patchMesh.name = 'tunnel-overlay-patch';
      patchMesh.receiveShadow = true;
      patchMesh.matrixAutoUpdate = false;
      patchMesh.updateMatrix();
      group.add(patchMesh);
    }
  }

  return { group, chunkCount, triangleCount };
}
