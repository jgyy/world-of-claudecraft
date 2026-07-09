import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { WORLD_MAX_X, WORLD_MAX_Z, WORLD_MIN_Z } from '../sim/data';
import {
  chunkNearAnyTunnel,
  TUNNELS,
  tunnelBounds,
  tunnelInteriorFactor,
  voxelDensity,
} from '../sim/voxel';
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
const OVERLAP_VOXELS = 2; // extra voxel cells of overlap padded onto every sub-chunk side, avoids seams
// Generous: below this many yd past the deepest tunnel floor, a downward-
// looking camera would otherwise fall through the bottom of the meshed
// volume and see the raw scene background (sky/fog color) instead of rock -
// exactly the "view outside the map" a reviewer flagged. A deep, doubled-
// depth tunnel needs real headroom here, not a tight sliver.
const HEIGHT_MARGIN = 35;
const CAP_MARGIN = 40; // yd of lateral padding on the backstop floor cap below

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

// Light decoration: a warm torch (flame cone + point light, the same visual
// language as dungeon.ts's wall torches, kept self-contained here rather
// than sharing dungeon.ts's fireLights budget array, which is dungeon-
// instance-specific) at every other waypoint, mounted to the tunnel wall,
// plus a scatter of rock boulders on the floor between them, so the
// interior reads as a lived-in cave, not a bare tube.
const TORCH_FLAME_COLOR = 0xff8c3c;
const TORCH_LIGHT_COLOR = 0xffa050;
const TORCH_LIGHT_DISTANCE = 34;
let flameGeo: THREE.ConeGeometry | null = null;
let boulderGeo: THREE.IcosahedronGeometry | null = null;

function addTorch(group: THREE.Group, x: number, y: number, z: number, side: number): void {
  flameGeo ??= new THREE.ConeGeometry(0.24, 0.65, 6);
  const flame = new THREE.Mesh(
    flameGeo,
    new THREE.MeshLambertMaterial({
      color: TORCH_FLAME_COLOR,
      emissive: TORCH_FLAME_COLOR,
      emissiveIntensity: 1.6,
      transparent: true,
      opacity: 0.92,
    }),
  );
  flame.position.set(x, y, z);
  group.add(flame);

  const light = new THREE.PointLight(TORCH_LIGHT_COLOR, 30, TORCH_LIGHT_DISTANCE, 1.5);
  light.position.set(x, y + 0.3, z);
  group.add(light);

  // stick/mount stub, just enough to read as "attached to the wall"
  const mount = new THREE.Mesh(
    new THREE.CylinderGeometry(0.08, 0.08, 0.7, 5),
    new THREE.MeshStandardMaterial({ color: 0x3a2a1c, roughness: 1 }),
  );
  mount.position.set(x - side * 0.15, y - 0.35, z);
  mount.rotation.z = side * 0.35;
  group.add(mount);
}

function addBoulder(group: THREE.Group, x: number, y: number, z: number, scale: number): void {
  boulderGeo ??= new THREE.IcosahedronGeometry(1, 0);
  const boulder = new THREE.Mesh(
    boulderGeo,
    new THREE.MeshStandardMaterial({ color: 0x8a8378, roughness: 1 }),
  );
  boulder.position.set(x, y, z);
  boulder.scale.setScalar(scale);
  boulder.rotation.set(scale * 1.7, scale * 2.3, scale * 0.9); // deterministic, varies only by scale
  boulder.castShadow = true;
  boulder.receiveShadow = true;
  group.add(boulder);
}

// Organic mouth dressing: a scatter of hanging branches with leaf clumps
// framing the top of the archway, plus a short dirt/rock path patch leading
// from the threshold outward, matching the reference photo (rounded rock
// archway in a grassy hillside, foliage overhanging the opening, a visible
// path leading in). All offsets are deterministic (a fixed function of the
// waypoint's own position and a hand-picked `side`/`lobe` index), never
// Math.random, so the same mouth always dresses identically.
const LEAF_COLOR = 0x3d6b2e;
const BRANCH_COLOR = 0x4a3826;
const PATH_COLOR = 0x6b5a44;
let leafGeo: THREE.IcosahedronGeometry | null = null;
let branchGeo: THREE.CylinderGeometry | null = null;
let pathGeo: THREE.CircleGeometry | null = null;

function addHangingBranch(
  group: THREE.Group,
  x: number,
  y: number,
  z: number,
  lean: number,
  scale: number,
): void {
  branchGeo ??= new THREE.CylinderGeometry(0.06, 0.1, 1.6, 5);
  const branch = new THREE.Mesh(
    branchGeo,
    new THREE.MeshStandardMaterial({ color: BRANCH_COLOR, roughness: 1 }),
  );
  branch.position.set(x, y, z);
  branch.rotation.set(Math.PI * 0.5 + lean * 0.55, lean * 1.3, lean * 0.3);
  branch.scale.setScalar(scale);
  branch.castShadow = true;
  group.add(branch);

  leafGeo ??= new THREE.IcosahedronGeometry(1, 0);
  for (let k = 0; k < 3; k++) {
    const leaf = new THREE.Mesh(leafGeo, new THREE.MeshLambertMaterial({ color: LEAF_COLOR }));
    const spread = 0.5 + k * 0.35;
    leaf.position.set(
      x + Math.sin(lean * 4 + k * 2.1) * spread * scale,
      y - 0.5 * scale - k * 0.35 * scale,
      z + Math.cos(lean * 3 + k * 1.7) * spread * scale,
    );
    leaf.scale.set(0.55 * scale, 0.4 * scale, 0.55 * scale);
    leaf.rotation.set(k * 1.1, k * 2.3, k * 0.7);
    leaf.castShadow = true;
    leaf.receiveShadow = true;
    group.add(leaf);
  }
}

function addMouthFoliage(
  group: THREE.Group,
  w: { x: number; y: number; z: number; radius: number },
): void {
  // A handful of overhanging branches ringing the top of the archway, at a
  // spread of deterministic angles/heights so the canopy reads as irregular
  // rather than a symmetric fringe.
  const lobes = [-1.1, -0.5, 0.15, 0.7, 1.2];
  for (let i = 0; i < lobes.length; i++) {
    const lean = lobes[i];
    const archTop = w.y + w.radius * 1.9; // near the top of the archScale-domed opening
    const lateral = w.x + Math.sin(lean * 1.7) * w.radius * 0.9;
    const depth = w.z + Math.cos(lean * 1.3) * w.radius * 0.35;
    addHangingBranch(group, lateral, archTop, depth, lean, 0.85 + 0.2 * ((i % 3) - 1));
  }

  // A short dirt/rock path patch on the ground just outside the threshold,
  // leading away from the mouth, so the entrance reads as an approached
  // doorway rather than an isolated hole in the hillside.
  pathGeo ??= new THREE.CircleGeometry(1, 10);
  const path = new THREE.Mesh(
    pathGeo,
    new THREE.MeshStandardMaterial({ color: PATH_COLOR, roughness: 1 }),
  );
  const outward = w.z < 180 ? -1 : 1; // lead away from the ridge crest, toward open ground
  path.rotation.x = -Math.PI / 2;
  path.position.set(w.x, w.y - w.radius * 0.55, w.z + outward * w.radius * 2.3);
  path.scale.set(w.radius * 0.55, w.radius * 1.0, 1);
  path.receiveShadow = true;
  group.add(path);
}

function addDecorations(group: THREE.Group): void {
  for (const tunnel of TUNNELS) {
    const wps = tunnel.waypoints;
    for (let i = 1; i < wps.length - 1; i++) {
      const w = wps[i];
      if (i % 2 === 1) {
        // torches on alternating walls, roughly at standing-head height
        const side = i % 4 === 1 ? 1 : -1;
        addTorch(group, w.x + side * w.radius * 0.85, w.y + w.radius * 0.15, w.z, side);
      } else {
        addBoulder(group, w.x + w.radius * 0.78, w.y - w.radius * 0.82, w.z, w.radius * 0.16);
        addBoulder(group, w.x - w.radius * 0.82, w.y - w.radius * 0.85, w.z + 1.2, w.radius * 0.12);
      }
    }
    for (const w of [wps[0], wps[wps.length - 1]]) {
      if (w.mound) addMouthFoliage(group, w);
    }
  }
}

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

// Computes and attaches the `aTunnelInterior` custom vertex attribute (see
// the shader wiring above) from the pure sim helper tunnelInteriorFactor,
// one sample per vertex of the given (already positioned/rotated/translated)
// geometry. Applied to every geometry using the shared tunnel material,
// including the backstop planes, so the shader's declared attribute is
// always present (a geometry missing a declared attribute is undefined
// behavior in WebGL).
function addInteriorAttribute(geo: THREE.BufferGeometry, seed: number): THREE.BufferGeometry {
  const pos = geo.getAttribute('position');
  const arr = new Float32Array(pos.count);
  for (let i = 0; i < pos.count; i++) {
    arr[i] = tunnelInteriorFactor(pos.getX(i), pos.getY(i), pos.getZ(i), seed);
  }
  geo.setAttribute('aTunnelInterior', new THREE.BufferAttribute(arr, 1));
  return geo;
}

export function buildTunnelOverlay(seed: number): TunnelOverlayView {
  const group = new THREE.Group();
  group.name = 'tunnel-overlay';
  const chunks = excludedChunks();
  if (chunks.length === 0) return { group, chunkCount: 0, triangleCount: 0 };

  const density = (x: number, y: number, z: number) => voxelDensity(x, y, z, seed);
  // Double-sided: the backstop planes below are flat quads whose correct
  // inward-facing orientation is easy to get backwards (exactly what
  // happened once already - a south/north wall pair with swapped rotations
  // rendered invisible from inside, letting the camera see clean through to
  // the raw scene background). Single-sided front-face culling buys nothing
  // here worth risking that failure mode for again.
  const material = new THREE.MeshStandardMaterial({
    roughness: 0.92,
    metalness: 0,
    side: THREE.DoubleSide,
  });
  material.onBeforeCompile = (shader) => {
    shader.uniforms.grassMap = { value: TEX.grassC };
    shader.uniforms.rockMap = { value: TEX.rockC };
    shader.vertexShader = shader.vertexShader.replace(
      '#include <common>',
      `#include <common>
      attribute float aTunnelInterior;
      varying vec3 vWorldPos;
      varying vec3 vWorldNormal;
      varying float vTunnelInterior;`,
    );
    shader.vertexShader = shader.vertexShader.replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
      vWorldPos = (modelMatrix * vec4(position, 1.0)).xyz;
      vWorldNormal = normalize(mat3(modelMatrix) * normal);
      vTunnelInterior = aTunnelInterior;`,
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <common>',
      `#include <common>
      uniform sampler2D grassMap;
      uniform sampler2D rockMap;
      varying vec3 vWorldPos;
      varying vec3 vWorldNormal;
      varying float vTunnelInterior;
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
        // production terrain's own slope-based blend (terrain.ts). That
        // slope-only test is WRONG for the tunnel's own flattened floor
        // (floorScale makes it face upward like ordinary ground, even
        // though it is buried underground): vTunnelInterior (computed per-
        // vertex from the pure sim helper tunnelInteriorFactor, see
        // voxel.ts) forces full rock whenever the point is genuinely
        // underground and close to a carved tunnel passage, regardless of
        // its local surface normal, while leaving the mound's own grassy
        // exterior (which sits at/above ambient ground level) on the
        // ordinary slope-based blend.
        float slopeT = clamp(1.0 - (n.y - 0.3) / 0.5, 0.0, 1.0);
        float rockT = max(slopeT, vTunnelInterior);
        vec3 grassAlb = triplanar(grassMap, vWorldPos, blend, 0.05);
        vec3 rockAlb = triplanar(rockMap, vWorldPos, blend, 0.045);
        diffuseColor.rgb *= mix(grassAlb, rockAlb, rockT);
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
      addInteriorAttribute(merged, seed);
      const patchMesh = new THREE.Mesh(merged, material);
      patchMesh.name = 'tunnel-overlay-patch';
      patchMesh.receiveShadow = true;
      patchMesh.matrixAutoUpdate = false;
      patchMesh.updateMatrix();
      group.add(patchMesh);
    }
  }

  // Backstop: a fully enclosing box of opaque rock-textured planes (floor,
  // ceiling, and all four walls) well outside the meshed voxel volume,
  // spanning generously past every excluded chunk's footprint. The voxel
  // mesh itself should already be watertight, but Surface Nets sampled at a
  // finite resolution can leave a hairline crack at a steep gradient (most
  // likely right where a tunnel's carve barely edges out rolling terrain
  // near a mouth) - exactly what let a prior pass see the raw scene
  // background (sky/fog color) through such a gap, a reviewer-flagged "view
  // outside the map". This backstop makes that impossible regardless: any
  // ray that somehow escapes the tunnel's own walls still lands on solid,
  // textured rock before it could ever reach open space.
  let capMinX = Infinity;
  let capMaxX = -Infinity;
  let capMinZ = Infinity;
  let capMaxZ = -Infinity;
  for (const chunk of chunks) {
    capMinX = Math.min(capMinX, chunk.minX);
    capMaxX = Math.max(capMaxX, chunk.maxX);
    capMinZ = Math.min(capMinZ, chunk.minZ);
    capMaxZ = Math.max(capMaxZ, chunk.maxZ);
  }
  const loY = bandMin - 2;
  const hiY = bandMax + 2;
  const w = capMaxX - capMinX + 2 * CAP_MARGIN;
  const d = capMaxZ - capMinZ + 2 * CAP_MARGIN;
  const h = hiY - loY;
  const cx = (capMinX + capMaxX) / 2;
  const cz = (capMinZ + capMaxZ) / 2;

  const addBackstop = (
    name: string,
    sizeA: number,
    sizeB: number,
    rotateX: number,
    rotateY: number,
    x: number,
    y: number,
    z: number,
  ): void => {
    const geo = new THREE.PlaneGeometry(sizeA, sizeB);
    if (rotateX) geo.rotateX(rotateX);
    if (rotateY) geo.rotateY(rotateY);
    geo.translate(x, y, z);
    addInteriorAttribute(geo, seed);
    const mesh = new THREE.Mesh(geo, material);
    mesh.name = name;
    mesh.matrixAutoUpdate = false;
    mesh.updateMatrix();
    group.add(mesh);
  };

  addBackstop('tunnel-overlay-backstop-floor', w, d, -Math.PI / 2, 0, cx, loY, cz);
  addBackstop('tunnel-overlay-backstop-ceiling', w, d, Math.PI / 2, 0, cx, hiY, cz);
  addBackstop(
    'tunnel-overlay-backstop-west',
    d,
    h,
    0,
    Math.PI / 2,
    capMinX - CAP_MARGIN,
    (loY + hiY) / 2,
    cz,
  );
  addBackstop(
    'tunnel-overlay-backstop-east',
    d,
    h,
    0,
    -Math.PI / 2,
    capMaxX + CAP_MARGIN,
    (loY + hiY) / 2,
    cz,
  );
  addBackstop(
    'tunnel-overlay-backstop-south',
    w,
    h,
    0,
    0,
    cx,
    (loY + hiY) / 2,
    capMinZ - CAP_MARGIN,
  );
  addBackstop(
    'tunnel-overlay-backstop-north',
    w,
    h,
    0,
    Math.PI,
    cx,
    (loY + hiY) / 2,
    capMaxZ + CAP_MARGIN,
  );

  addDecorations(group);

  // The dominant, reliable light source: unlike THREE.PointLight, neither
  // AmbientLight nor HemisphereLight is subject to renderer.ts's fire-light
  // budget system (budgetFireLights only ranks lights it explicitly tracks
  // in fireLights/viewLights; torches added here were never registered into
  // either array, so they render at the mercy of whatever default state
  // that system leaves them in - effectively dark in practice). This
  // guarantees baseline visibility throughout the tunnel independent of
  // that system entirely; the torches remain a warm decorative accent.
  const ambient = new THREE.AmbientLight(0xffffff, 0.45);
  group.add(ambient);
  const fill = new THREE.HemisphereLight(0x8896a8, 0x141414, 0.6);
  group.add(fill);

  return { group, chunkCount, triangleCount };
}
