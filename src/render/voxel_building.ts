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
//
// The shell mesh is split into a stone GROUND-FLOOR band and a plaster/timber
// UPPER band (geometry groups + two materials on one BufferGeometry), each
// carrying real "triplanar-lite" UVs picked per-triangle from the dominant
// face normal (x/y/z), the same trick voxel_terrain.ts's shader does with a
// custom onBeforeCompile but done once at mesh-build time here so the result
// is a PLAIN surfaceMat() material with a real UV attribute: a marching-cubes
// mesh has no natural UV space, and the keep's walls are close enough to
// axis-aligned that a per-triangle dominant-axis projection reads as clean
// tiling stone/plaster with no visible seam. A real pitched roof, door frame,
// window insets, and per-floor flooring are layered on top as ordinary boxed
// geometry (real UVs, no projection trick needed) using the same texture set.
import * as THREE from 'three';
import {
  KEEP_DOOR_HALF_WIDTH,
  KEEP_DOOR_HEIGHT,
  KEEP_FLOOR_HEIGHT,
  KEEP_WINDOW_HALF_WIDTH,
  KEEP_WINDOW_HEIGHT,
} from '../sim/content/keep';
import type { Entity } from '../sim/types';
import {
  KEEP_FLOORS,
  KEEP_HALF,
  KEEP_POS,
  KEEP_TOTAL_HEIGHT,
  keepBaseY,
  keepFloorY,
  keepVoxelDensity,
  keepWindowSpecs,
} from '../sim/voxel_building';
import { meshVoxelChunk } from '../sim/voxel_mesh';
import { surfaceMat } from './gfx';
import { buildKeepInteriorDecor } from './keep_interior_decor';
import { buildKeepStairs } from './keep_stairs';
import { plankMaps, roofMaps, stoneMaps, wallMaps } from './textures';

export interface KeepView {
  group: THREE.Group;
  /** Call once per frame with the local player entity to swap the
   * per-floor marker to match `activeFloor` (0 = outside, hides all). */
  update(localPlayer: Entity | undefined): void;
}

// floor 1 / 2 / 3 / 4 / attic
const FLOOR_MARKER_COLORS = [0x5fb0ff, 0x7fe07f, 0xffb35f, 0xff7f9f, 0xc79fff];
const TEX_SCALE = 3; // world units per texture tile, for the projected UVs

// Assigns one UV set to a raw (non-indexed-friendly) triangle soup by
// projecting each triangle's three vertices along whichever axis its face
// normal is MOST aligned with (dominant-axis / "triplanar-lite" projection).
// Also buckets each triangle into the stone (ground floor exterior) or wall
// (everything above) group by average vertex height, so the same shell mesh
// can carry two surfaceMat() materials via geometry groups.
function projectShellUVs(
  positions: Float32Array,
  normals: Float32Array,
  indices: Uint32Array | Uint16Array,
  baseY: number,
): { uv: Float32Array; stoneIndices: number[]; wallIndices: number[] } {
  const uv = new Float32Array((positions.length / 3) * 2);
  const stoneIndices: number[] = [];
  const wallIndices: number[] = [];
  const groundBandTop = baseY + KEEP_FLOOR_HEIGHT * 0.9;

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
    if (avgY <= groundBandTop) stoneIndices.push(i0, i1, i2);
    else wallIndices.push(i0, i1, i2);
  }

  return { uv, stoneIndices, wallIndices };
}

function buildShellMesh(seed: number): THREE.Mesh | null {
  const baseY = keepBaseY(seed);
  const density = (x: number, y: number, z: number) => keepVoxelDensity(x, y, z, seed);
  const pad = KEEP_HALF * 0.3;
  // The keep is now taller than it is wide (four stories + attic knee), so the
  // mesher's cubic chunk must be sized to the FULL height, not the footprint,
  // and centred on the building so every wall stays inside the chunk. y0 sits a
  // yard below the ground; the cube reaches a yard past the eave line.
  const widthSpan = KEEP_HALF * 2 + 2 * pad;
  const heightSpan = KEEP_TOTAL_HEIGHT + 2;
  const size = Math.max(widthSpan, heightSpan);
  const mesh = meshVoxelChunk(density, {
    x0: KEEP_POS.x - size / 2,
    y0: baseY - 1,
    z0: KEEP_POS.z - size / 2,
    size,
    // ~0.28yd voxels at this size: fine enough that the 0.5yd walls stay
    // several voxels deep (no near-coincident faces that z-fight) and the
    // carved window openings resolve cleanly.
    resolution: 80,
  });
  if (mesh.positions.length === 0) return null;

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(mesh.positions, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(mesh.normals, 3));

  const { uv, stoneIndices, wallIndices } = projectShellUVs(
    mesh.positions,
    mesh.normals,
    mesh.indices,
    baseY,
  );
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));

  const combined = new Uint32Array(stoneIndices.length + wallIndices.length);
  combined.set(stoneIndices, 0);
  combined.set(wallIndices, stoneIndices.length);
  geo.setIndex(new THREE.BufferAttribute(combined, 1));
  geo.addGroup(0, stoneIndices.length, 0);
  geo.addGroup(stoneIndices.length, wallIndices.length, 1);

  const stone = stoneMaps();
  const wall = wallMaps();
  const stoneMat = surfaceMat({
    color: 0xbdb6a4,
    map: stone.map,
    normalMap: stone.normalMap,
    roughness: 0.92,
  });
  const wallMat = surfaceMat({
    color: 0xe4d7b8,
    map: wall.map,
    normalMap: wall.normalMap,
    roughness: 0.82,
  });

  const shell = new THREE.Mesh(geo, [stoneMat, wallMat]);
  shell.castShadow = true;
  shell.receiveShadow = true;
  shell.name = 'keep-shell';
  return shell;
}

// Builds one quad (two triangles, CCW winding so the normal faces "up" per
// the given vertex order) as raw positions + a simple planar UV, appended to
// the given arrays. Explicit vertices (not PlaneGeometry + Euler rotations)
// keep the roof slope unambiguous: three.js's XYZ Euler composition is easy
// to get subtly wrong by hand and a wrong composition silently degenerates
// the slope to an edge-on sliver instead of throwing.
function pushQuad(
  positions: number[],
  uvs: number[],
  a: THREE.Vector3,
  b: THREE.Vector3,
  c: THREE.Vector3,
  d: THREE.Vector3,
  scale: number,
  uAxis: 'x' | 'z',
): void {
  const tri = (p1: THREE.Vector3, p2: THREE.Vector3, p3: THREE.Vector3) => {
    positions.push(p1.x, p1.y, p1.z, p2.x, p2.y, p2.z, p3.x, p3.y, p3.z);
    for (const p of [p1, p2, p3]) {
      const u = (uAxis === 'x' ? p.x : p.z) / scale;
      const v = p.y / scale;
      uvs.push(u, v);
    }
  };
  tri(a, b, c);
  tri(a, c, d);
}

// A real pitched (gabled) roof sitting above the flat voxel roof slab: a
// ridge running east-west (along local x), two sloped panels down to the
// eaves on the north/south sides, and two triangular gable-end fills so the
// attic space under the ridge is not an open hole. Built from explicit
// vertices (see pushQuad) rather than PlaneGeometry + rotations.
function buildPitchedRoof(seed: number): THREE.Group {
  const group = new THREE.Group();
  group.name = 'keep-roof';
  const roof = roofMaps();
  const mat = surfaceMat({
    color: 0x8a4a3a,
    map: roof.map,
    normalMap: roof.normalMap,
    roughness: 0.8,
    side: THREE.DoubleSide,
  });
  const wall = wallMaps();
  const gableMat = surfaceMat({
    color: 0xe4d7b8,
    map: wall.map,
    normalMap: wall.normalMap,
    roughness: 0.82,
    side: THREE.DoubleSide,
  });

  const eaveY = keepBaseY(seed) + KEEP_TOTAL_HEIGHT;
  const ridgeHeight = KEEP_HALF * 0.75;
  const overhang = 0.6;
  const halfX = KEEP_HALF + overhang;
  const halfZ = KEEP_HALF + overhang;
  const cx = KEEP_POS.x;
  const cz = KEEP_POS.z;
  const ridgeY = eaveY + ridgeHeight;
  const ROOF_TEX_SCALE = 3;

  const roofPositions: number[] = [];
  const roofUvs: number[] = [];
  const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

  // North slope (toward +z): ridge edge at z=cz, eave edge at z=cz+halfZ.
  pushQuad(
    roofPositions,
    roofUvs,
    v(cx - halfX, ridgeY, cz),
    v(cx + halfX, ridgeY, cz),
    v(cx + halfX, eaveY, cz + halfZ),
    v(cx - halfX, eaveY, cz + halfZ),
    ROOF_TEX_SCALE,
    'x',
  );
  // South slope (toward -z).
  pushQuad(
    roofPositions,
    roofUvs,
    v(cx + halfX, ridgeY, cz),
    v(cx - halfX, ridgeY, cz),
    v(cx - halfX, eaveY, cz - halfZ),
    v(cx + halfX, eaveY, cz - halfZ),
    ROOF_TEX_SCALE,
    'x',
  );

  const roofGeo = new THREE.BufferGeometry();
  roofGeo.setAttribute('position', new THREE.Float32BufferAttribute(roofPositions, 3));
  roofGeo.setAttribute('uv', new THREE.Float32BufferAttribute(roofUvs, 2));
  roofGeo.computeVertexNormals();
  const roofMesh = new THREE.Mesh(roofGeo, mat);
  roofMesh.castShadow = true;
  roofMesh.receiveShadow = true;
  group.add(roofMesh);

  // Gable-end triangular fills at x = cx-halfX and x = cx+halfX (closes the
  // attic under the ridge; the plain shell width, not the roof overhang).
  const gablePositions: number[] = [];
  const gableUvs: number[] = [];
  const gableTri = (x: number) => {
    const p1 = v(x, eaveY, cz - KEEP_HALF);
    const p2 = v(x, eaveY, cz + KEEP_HALF);
    const p3 = v(x, ridgeY, cz);
    gablePositions.push(p1.x, p1.y, p1.z, p2.x, p2.y, p2.z, p3.x, p3.y, p3.z);
    for (const p of [p1, p2, p3]) gableUvs.push(p.z / ROOF_TEX_SCALE, p.y / ROOF_TEX_SCALE);
    // both winds, so the fill reads from either side without relying on
    // material.side alone to save a second draw call
    gablePositions.push(p1.x, p1.y, p1.z, p3.x, p3.y, p3.z, p2.x, p2.y, p2.z);
    for (const p of [p1, p3, p2]) gableUvs.push(p.z / ROOF_TEX_SCALE, p.y / ROOF_TEX_SCALE);
  };
  gableTri(cx - KEEP_HALF);
  gableTri(cx + KEEP_HALF);
  const gableGeo = new THREE.BufferGeometry();
  gableGeo.setAttribute('position', new THREE.Float32BufferAttribute(gablePositions, 3));
  gableGeo.setAttribute('uv', new THREE.Float32BufferAttribute(gableUvs, 2));
  gableGeo.computeVertexNormals();
  const gableMesh = new THREE.Mesh(gableGeo, gableMat);
  gableMesh.castShadow = true;
  gableMesh.receiveShadow = true;
  group.add(gableMesh);

  return group;
}

// A timber-framed door surround (plankMaps) around the ground-floor opening,
// and a set of decorative plank-framed window insets along the upper walls:
// flush overlays against the solid shell (the sim carves only the door
// opening, see sim/voxel_building.ts), reading as shuttered windows without
// widening the sim's collision/geometry contract.
function buildDoorAndWindows(seed: number): THREE.Group {
  const group = new THREE.Group();
  group.name = 'keep-door-windows';
  const baseY = keepBaseY(seed);
  const plank = plankMaps();
  const frameMat = surfaceMat({
    color: 0x6b4a2c,
    map: plank.map,
    normalMap: plank.normalMap,
    roughness: 0.9,
  });
  const paneMat = surfaceMat({ color: 0x2a2118, roughness: 0.6 });

  // Door frame: two side posts + a lintel around the south door gap.
  const postW = 0.3;
  const postH = KEEP_DOOR_HEIGHT + 0.3;
  const postGeo = new THREE.BoxGeometry(postW, postH, 0.35);
  for (const side of [-1, 1]) {
    const post = new THREE.Mesh(postGeo, frameMat);
    post.position.set(
      KEEP_POS.x + side * (KEEP_DOOR_HALF_WIDTH + postW / 2),
      baseY + postH / 2,
      KEEP_POS.z - KEEP_HALF,
    );
    post.castShadow = true;
    group.add(post);
  }
  const lintel = new THREE.Mesh(
    new THREE.BoxGeometry(KEEP_DOOR_HALF_WIDTH * 2 + postW * 2, 0.4, 0.35),
    frameMat,
  );
  lintel.position.set(KEEP_POS.x, baseY + KEEP_DOOR_HEIGHT + 0.2, KEEP_POS.z - KEEP_HALF);
  lintel.castShadow = true;
  group.add(lintel);

  // Window dressing: a plank frame + dark pane sitting in each REAL carved
  // opening (the sim subtracts these from the shell, see
  // sim/voxel_building.ts keepWindowSpecs), on every wall face and every floor
  // including the ground floor. Driven by the SAME keepWindowSpecs the carve
  // uses, so the dressing always lines up with the hole.
  const winW = KEEP_WINDOW_HALF_WIDTH * 2;
  const winH = KEEP_WINDOW_HEIGHT;
  const baseYW = keepBaseY(seed);
  for (const w of keepWindowSpecs()) {
    const y = baseYW + w.ly;
    const northSouth = w.wall === 'north' || w.wall === 'south';
    // Outward face sign along the wall's normal axis.
    const outSign = w.wall === 'north' || w.wall === 'east' ? 1 : -1;
    const rotY = northSouth ? (w.wall === 'north' ? 0 : Math.PI) : outSign * (Math.PI / 2);

    const pane = new THREE.Mesh(new THREE.PlaneGeometry(winW, winH), paneMat);
    pane.rotation.y = rotY;
    pane.position.set(w.x, y, w.z);
    if (northSouth) pane.position.z += outSign * 0.06;
    else pane.position.x += outSign * 0.06;
    group.add(pane);

    // A thin frame box spanning the opening, its short axis through the wall.
    const frameW = winW + 0.24;
    const frameH = winH + 0.24;
    const frameGeo = northSouth
      ? new THREE.BoxGeometry(frameW, frameH, 0.14)
      : new THREE.BoxGeometry(0.14, frameH, frameW);
    const frame = new THREE.Mesh(frameGeo, frameMat);
    frame.position.set(w.x, y, w.z);
    if (northSouth) frame.position.z += outSign * 0.02;
    else frame.position.x += outSign * 0.02;
    frame.castShadow = true;
    group.add(frame);
  }
  return group;
}

// Per-floor ground covering: stone flags on the ground floor, timber planks
// on the upper floors, a thin textured slab just above each floor's
// collision height so it reads as real flooring rather than a bare voxel cap.
function buildFloorCoverings(seed: number): THREE.Group {
  const group = new THREE.Group();
  group.name = 'keep-floor-coverings';
  const stone = stoneMaps();
  const plank = plankMaps();
  const stoneMat = surfaceMat({
    color: 0xb7ada0,
    map: stone.map,
    normalMap: stone.normalMap,
    roughness: 0.9,
  });
  const plankMat = surfaceMat({
    color: 0x8a6a45,
    map: plank.map,
    normalMap: plank.normalMap,
    roughness: 0.75,
  });

  // Floors 1..KEEP_FLOORS plus the attic (floor KEEP_FLOORS+1, sitting on the
  // top floor slab). The covering hugs each floor's walkable surface so it
  // reads as real flooring, not a bare voxel cap.
  for (let floor = 1; floor <= KEEP_FLOORS + 1; floor++) {
    const y = keepFloorY(seed, floor) + 0.05;
    const geo = new THREE.PlaneGeometry(KEEP_HALF * 2 - 0.4, KEEP_HALF * 2 - 0.4);
    geo.rotateX(-Math.PI / 2);
    const mat = floor === 1 ? stoneMat : plankMat;
    const slab = new THREE.Mesh(geo, mat);
    slab.position.set(KEEP_POS.x, y, KEEP_POS.z);
    slab.receiveShadow = true;
    group.add(slab);
  }
  return group;
}

export function buildKeepView(seed: number, fireLights: THREE.PointLight[] = []): KeepView {
  const group = new THREE.Group();
  group.name = 'keep';

  const shell = buildShellMesh(seed);
  if (shell) group.add(shell);
  group.add(buildPitchedRoof(seed));
  group.add(buildDoorAndWindows(seed));
  group.add(buildFloorCoverings(seed));
  const stairs = buildKeepStairs(seed);
  if (stairs) group.add(stairs);
  group.add(buildKeepInteriorDecor(seed, fireLights).group);

  // One small glow marker per floor at its landing, only the local player's
  // CURRENT floor lit at a time, so walking up a staircase visibly changes
  // what is highlighted without re-meshing the building. Actual room
  // lighting now comes from the wall torches (keep_interior_decor.ts),
  // budget-capped through the shared `fireLights` array like every other
  // interior; this marker is a cheap always-tiny cosmetic accent, not a
  // scene light.
  const markers: THREE.Mesh[] = [];
  for (let floor = 1; floor <= KEEP_FLOORS + 1; floor++) {
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
