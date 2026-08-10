// Weapon-local geometry helpers shared by weapon_vfx.ts: root-relative
// transforms, measured local bounds, weapon-local anchor resolution, and
// area-weighted random surface points. All emitter math in weapon_vfx.ts
// runs in ROOT-RELATIVE space (the GLB's canonical frame: grip at origin,
// blade along +Y) regardless of how the root is currently scaled, posed or
// parented (pedestal-normalized OR attached to a hand bone), so the rig can
// be built or rebuilt at any time.
import * as THREE from 'three';
import type { WeaponVfxAnchor } from './weapon_vfx';

export function rootRelativeMatrix(root: THREE.Object3D, mesh: THREE.Object3D): THREE.Matrix4 {
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
  return inv.multiply(mesh.matrixWorld);
}

export function localBounds(root: THREE.Object3D): THREE.Box3 {
  root.updateMatrixWorld(true);
  const box = new THREE.Box3();
  const sub = new THREE.Box3();
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh || !mesh.geometry || mesh.userData.__vfx) return;
    if (mesh.geometry.boundingBox === null) mesh.geometry.computeBoundingBox();
    sub.copy(mesh.geometry.boundingBox as THREE.Box3).applyMatrix4(rootRelativeMatrix(root, mesh));
    box.union(sub);
  });
  return box;
}

export function resolvePoint(b: THREE.Box3, p: WeaponVfxAnchor = {}): THREE.Vector3 {
  const f = (axis: 'x' | 'y' | 'z', frac: number) => {
    const min = b.min[axis];
    const max = b.max[axis];
    return min + (max - min) * frac;
  };
  return new THREE.Vector3(
    f('x', p.xF ?? 0.5) + (p.dx ?? 0),
    f('y', p.yF ?? 0.5) + (p.dy ?? 0),
    f('z', p.zF ?? 0.5) + (p.dz ?? 0),
  );
}

export const rand = (a: number, b: number) => a + Math.random() * (b - a);

/** Area-weighted random points on the weapon's mesh surfaces, in root-relative
 *  (canonical weapon) space, filtered to y >= yMin. */
export function surfacePoints(root: THREE.Object3D, count: number, yMin: number): THREE.Vector3[] {
  root.updateMatrixWorld(true);
  const tris: { a: THREE.Vector3; b: THREE.Vector3; c: THREE.Vector3; cum: number }[] = [];
  let total = 0;
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh || !mesh.geometry?.attributes?.position || mesh.userData.__vfx) return;
    const pos = mesh.geometry.attributes.position as THREE.BufferAttribute;
    const idx = mesh.geometry.index;
    const m = rootRelativeMatrix(root, mesh);
    const va = new THREE.Vector3();
    const vb = new THREE.Vector3();
    const vc = new THREE.Vector3();
    const n = idx ? idx.count : pos.count;
    for (let i = 0; i + 2 < n; i += 3) {
      const ia = idx ? idx.getX(i) : i;
      const ib = idx ? idx.getX(i + 1) : i + 1;
      const ic = idx ? idx.getX(i + 2) : i + 2;
      va.fromBufferAttribute(pos, ia).applyMatrix4(m);
      vb.fromBufferAttribute(pos, ib).applyMatrix4(m);
      vc.fromBufferAttribute(pos, ic).applyMatrix4(m);
      if (Math.max(va.y, vb.y, vc.y) < yMin) continue;
      const area = new THREE.Vector3()
        .subVectors(vb, va)
        .cross(new THREE.Vector3().subVectors(vc, va))
        .length();
      if (area <= 0) continue;
      total += area;
      tris.push({ a: va.clone(), b: vb.clone(), c: vc.clone(), cum: total });
    }
  });
  const out: THREE.Vector3[] = [];
  if (!tris.length) return out;
  for (let k = 0; k < count; k++) {
    const target = Math.random() * total;
    let lo = 0;
    let hi = tris.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (tris[mid].cum < target) lo = mid + 1;
      else hi = mid;
    }
    const t = tris[lo];
    let u = Math.random();
    let v = Math.random();
    if (u + v > 1) {
      u = 1 - u;
      v = 1 - v;
    }
    const p = new THREE.Vector3()
      .copy(t.a)
      .addScaledVector(new THREE.Vector3().subVectors(t.b, t.a), u)
      .addScaledVector(new THREE.Vector3().subVectors(t.c, t.a), v);
    if (p.y >= yMin) out.push(p);
  }
  return out;
}
