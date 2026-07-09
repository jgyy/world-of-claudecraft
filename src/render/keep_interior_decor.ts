// Furniture + wall-torch decor for the Eastbrook Vale keep's three floors
// (src/render/voxel_building.ts builds the shell; this module dresses the
// interior so each level reads as a distinct room: great hall, storage/
// armory, study). Presentation only, same GLB-merge-and-instance pattern
// `dungeon.ts` uses for its KayKit interiors, scoped down for a small,
// fixed set of furniture pieces rather than a whole tileset.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { KEEP_HALF, KEEP_POS, keepFloorY } from '../sim/voxel_building';
import { loadGltf, releaseGltf } from './assets/loader';
import { registerPreload } from './assets/preload';

const FURNITURE_MODELS = [
  'table_long',
  'table_round_medium',
  'chair',
  'chest',
  'chest_gold',
  'chest_large',
  'barrel_large',
  'barrel_large_decorated',
  'crate_large',
  'crate_large_decorated',
  'crates_stacked',
  'scaffold_pillar_wall_torch',
] as const;

type FurnitureKind = (typeof FURNITURE_MODELS)[number];

interface FurnitureAsset {
  geo: THREE.BufferGeometry;
  material: THREE.Material;
}

const assets = new Map<FurnitureKind, FurnitureAsset>();
let assetsPromise: Promise<void> | null = null;

function attributeToFloat(geo: THREE.BufferGeometry, name: string): void {
  const attr = geo.getAttribute(name);
  if (!attr || (attr.array instanceof Float32Array && !attr.normalized)) return;
  const out = new Float32Array(attr.count * attr.itemSize);
  for (let i = 0; i < attr.count; i++) {
    for (let c = 0; c < attr.itemSize; c++) out[i * attr.itemSize + c] = attr.getComponent(i, c);
  }
  geo.setAttribute(name, new THREE.BufferAttribute(out, attr.itemSize));
}

function loadFurniture(kind: FurnitureKind): Promise<void> {
  const url = `models/dungeon/${kind}.glb`;
  return loadGltf(url).then((gltf) => {
    const geos: THREE.BufferGeometry[] = [];
    let material: THREE.Material | null = null;
    gltf.scene.updateMatrixWorld(true);
    gltf.scene.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (!mesh.isMesh) return;
      const geo = (mesh.geometry as THREE.BufferGeometry).clone();
      for (const attr of Object.keys(geo.attributes)) {
        if (attr !== 'position' && attr !== 'normal' && attr !== 'uv') geo.deleteAttribute(attr);
      }
      attributeToFloat(geo, 'position');
      attributeToFloat(geo, 'normal');
      attributeToFloat(geo, 'uv');
      geo.applyMatrix4(mesh.matrixWorld);
      geos.push(geo);
      if (!material) {
        material = (Array.isArray(mesh.material) ? mesh.material[0] : mesh.material) ?? null;
      }
    });
    if (!geos.length || !material) throw new Error(`keep furniture has no meshes: ${kind}`);
    const merged = geos.length === 1 ? geos[0] : (mergeGeometries(geos, false) ?? geos[0]);
    assets.set(kind, { geo: merged, material });
    releaseGltf(url);
  });
}

export function ensureKeepFurnitureAssets(): Promise<void> {
  assetsPromise ??= Promise.all(FURNITURE_MODELS.map((k) => loadFurniture(k))).then(
    () => undefined,
  );
  return assetsPromise;
}

if (typeof window !== 'undefined') registerPreload(ensureKeepFurnitureAssets());

interface FurniturePlacement {
  kind: FurnitureKind;
  x: number;
  z: number;
  rotY?: number;
  scale?: number;
}

// Local (offset from KEEP_POS) per-floor furniture layout, hand-authored so
// each level reads as a distinct room: floor 1 a great hall (long table,
// chairs, a chest by the wall), floor 2 storage/armory (crates, barrels),
// floor 3 a study/loft (round table, gilded chest).
const FLOOR_LAYOUTS: Record<number, FurniturePlacement[]> = {
  1: [
    { kind: 'table_long', x: 0, z: 0.5, rotY: Math.PI / 2 },
    { kind: 'chair', x: -1.6, z: -0.6, rotY: Math.PI / 2 },
    { kind: 'chair', x: -1.6, z: 1.6, rotY: Math.PI / 2 },
    { kind: 'chair', x: 1.6, z: -0.6, rotY: -Math.PI / 2 },
    { kind: 'chair', x: 1.6, z: 1.6, rotY: -Math.PI / 2 },
    { kind: 'chest', x: -KEEP_HALF + 1.1, z: -KEEP_HALF + 1.1, rotY: Math.PI / 4 },
  ],
  2: [
    { kind: 'crates_stacked', x: -KEEP_HALF + 1.3, z: -KEEP_HALF + 1.3 },
    { kind: 'crate_large', x: -KEEP_HALF + 1.3, z: KEEP_HALF - 1.5, rotY: 0.4 },
    { kind: 'crate_large_decorated', x: KEEP_HALF - 1.5, z: -KEEP_HALF + 1.5, rotY: -0.5 },
    { kind: 'barrel_large', x: KEEP_HALF - 1.4, z: KEEP_HALF - 1.4, rotY: 0.9 },
    { kind: 'barrel_large_decorated', x: KEEP_HALF - 1.4, z: KEEP_HALF - 3.2, rotY: -0.2 },
  ],
  3: [
    { kind: 'table_round_medium', x: 0, z: -0.5 },
    { kind: 'chest_gold', x: KEEP_HALF - 1.4, z: KEEP_HALF - 1.4, rotY: -Math.PI / 4 },
    { kind: 'chair', x: 1.6, z: -0.5, rotY: -Math.PI / 2 },
    { kind: 'chair', x: -1.6, z: -0.5, rotY: Math.PI / 2 },
  ],
};

// Wall-mounted torches per floor, local (x,z) plus the wall-facing rotation
// (matches `scaffold_pillar_wall_torch`'s outward-facing orientation), one
// PointLight each, pushed into the renderer's shared `fireLights` budget
// array so the keep obeys the same GFX.maxPointLights cap as every other
// interior instead of stacking unbounded lights (root CLAUDE.md: graphics
// tiers may never change actionable info, but ARE allowed to budget cosmetic
// light count, same as dungeon.ts).
interface TorchPlacement {
  x: number;
  z: number;
  rotY: number;
}

const TORCH_LAYOUTS: Record<number, TorchPlacement[]> = {
  1: [
    { x: -KEEP_HALF + 0.3, z: 0, rotY: Math.PI / 2 },
    { x: KEEP_HALF - 0.3, z: 0, rotY: -Math.PI / 2 },
  ],
  2: [
    { x: -KEEP_HALF + 0.3, z: 0, rotY: Math.PI / 2 },
    { x: KEEP_HALF - 0.3, z: 0, rotY: -Math.PI / 2 },
  ],
  3: [{ x: 0, z: -KEEP_HALF + 0.3, rotY: 0 }],
};

const KEEP_TORCH_LIGHT_COLOR = 0xfff0c8;
const KEEP_TORCH_LIGHT_INTENSITY = 34;
const KEEP_TORCH_LIGHT_DISTANCE = 20;
const KEEP_TORCH_LIGHT_Y = 2.4;

export interface KeepInteriorDecor {
  group: THREE.Group;
}

/** Builds the per-floor furniture + wall torches for the keep. Call once
 * assets are resolved (main.ts awaits assetsReady() before the renderer
 * builds, same contract as every other subsystem). `fireLights` is the
 * renderer's shared, budget-capped point-light array (see gfx.ts
 * `GFX.maxPointLights` + renderer.ts `budgetFireLights`). */
export function buildKeepInteriorDecor(
  seed: number,
  fireLights: THREE.PointLight[],
): KeepInteriorDecor {
  const group = new THREE.Group();
  group.name = 'keep-interior-decor';

  for (const [floorStr, items] of Object.entries(FLOOR_LAYOUTS)) {
    const floor = Number(floorStr);
    const y = keepFloorY(seed, floor);
    for (const item of items) {
      const asset = assets.get(item.kind);
      if (!asset) continue;
      const mesh = new THREE.Mesh(asset.geo, asset.material);
      mesh.position.set(KEEP_POS.x + item.x, y, KEEP_POS.z + item.z);
      mesh.rotation.y = item.rotY ?? 0;
      if (item.scale) mesh.scale.setScalar(item.scale);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      group.add(mesh);
    }
  }

  for (const [floorStr, torches] of Object.entries(TORCH_LAYOUTS)) {
    const floor = Number(floorStr);
    const y = keepFloorY(seed, floor);
    const torchAsset = assets.get('scaffold_pillar_wall_torch');
    for (const t of torches) {
      if (torchAsset) {
        const mesh = new THREE.Mesh(torchAsset.geo, torchAsset.material);
        mesh.position.set(KEEP_POS.x + t.x, y + 1.6, KEEP_POS.z + t.z);
        mesh.rotation.y = t.rotY;
        mesh.castShadow = true;
        group.add(mesh);
      }
      const light = new THREE.PointLight(
        KEEP_TORCH_LIGHT_COLOR,
        KEEP_TORCH_LIGHT_INTENSITY,
        KEEP_TORCH_LIGHT_DISTANCE,
        2,
      );
      light.userData.baseIntensity = KEEP_TORCH_LIGHT_INTENSITY;
      light.position.set(KEEP_POS.x + t.x, y + KEEP_TORCH_LIGHT_Y, KEEP_POS.z + t.z);
      group.add(light);
      fireLights.push(light);
    }
  }

  return { group };
}
