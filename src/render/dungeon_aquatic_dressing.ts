// Flooded-room aquatic dressing (lily pads + kelp) for the Drowned Temple and
// Drowned Court dungeon interiors. Pulled out of dungeon.ts's
// DungeonInteriors class: this reads only the layout it is given and writes
// only into the group it is given, so it lives as a plain sibling function
// (see delve_marsh_dressing.ts for the same family pattern).

import * as THREE from 'three';
import type { DungeonLayout } from '../sim/dungeon_layout';

// stable per-position hash (same trick as dungeon.ts and jail_scene.ts)
function hash2(a: number, b: number): number {
  const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
  return s - Math.floor(s);
}

export function placeAquaticDressing(group: THREE.Group, layout: DungeonLayout): void {
  const inWaist = (z: number) => layout.stubs.some((s) => Math.abs(z - s.z) < s.hd + 2);
  const obj = new THREE.Object3D();

  // lily pads drifting on the flood, hugging the walls (clear of the aisle)
  const padGeo = new THREE.CircleGeometry(0.95, 14).rotateX(-Math.PI / 2);
  const padMat = new THREE.MeshLambertMaterial({
    color: 0x2f6e3a,
    emissive: 0x0c3a26,
    emissiveIntensity: 0.5,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.95,
  });
  const pads: THREE.Matrix4[] = [];
  for (let z = layout.zMin + 8; z < layout.zMax - 6; z += 12) {
    for (const side of [-1, 1]) {
      if (inWaist(z)) continue;
      const h = hash2(side * 5.7, z);
      if (h < 0.4) continue;
      const x = side * (9 + h * 9);
      obj.position.set(x, 0.22, z + (hash2(z, side) - 0.5) * 4);
      obj.rotation.set(0, hash2(x, z) * Math.PI, 0);
      obj.scale.setScalar(0.7 + hash2(z * 1.7, x) * 0.7);
      obj.updateMatrix();
      pads.push(obj.matrix.clone());
    }
  }
  if (pads.length) {
    const padMesh = new THREE.InstancedMesh(padGeo, padMat, pads.length);
    for (let i = 0; i < pads.length; i++) padMesh.setMatrixAt(i, pads[i]);
    padMesh.instanceMatrix.needsUpdate = true;
    padMesh.renderOrder = 2;
    group.add(padMesh);
  }

  // kelp climbing out of the flood near the colonnade and walls
  const kelpGeo = new THREE.CylinderGeometry(0.05, 0.22, 1, 5).translate(0, 0.5, 0);
  const kelpMat = new THREE.MeshLambertMaterial({
    color: 0x1f6b52,
    emissive: 0x0a3326,
    emissiveIntensity: 0.6,
  });
  const stalks: THREE.Matrix4[] = [];
  for (let z = layout.zMin + 10; z < layout.zMax - 8; z += 13) {
    for (const side of [-1, 1]) {
      if (inWaist(z)) continue;
      const h = hash2(side * 3.1, z * 1.3);
      if (h < 0.45) continue;
      const cx = side * (13 + h * 7);
      const clump = 2 + Math.floor(hash2(z, side * 2.2) * 2);
      for (let k = 0; k < clump; k++) {
        const jx = cx + (hash2(cx + k, z) - 0.5) * 2.2;
        const jz = z + (hash2(z, cx + k * 3) - 0.5) * 2.2;
        const height = 2.4 + hash2(jx, jz) * 2.4;
        obj.position.set(jx, 0.05, jz);
        obj.rotation.set(
          (hash2(jx, jz * 2) - 0.5) * 0.5,
          hash2(jz, jx) * Math.PI,
          (hash2(jx * 2, jz) - 0.5) * 0.5,
        );
        obj.scale.set(1, height, 1);
        obj.updateMatrix();
        stalks.push(obj.matrix.clone());
      }
    }
  }
  if (stalks.length) {
    const kelpMesh = new THREE.InstancedMesh(kelpGeo, kelpMat, stalks.length);
    for (let i = 0; i < stalks.length; i++) kelpMesh.setMatrixAt(i, stalks[i]);
    kelpMesh.instanceMatrix.needsUpdate = true;
    group.add(kelpMesh);
  }
}
