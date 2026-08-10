// Tip-scoped weapon aura geometry: builds a per-vertex alpha ramp so a weapon
// aura overlay can be scoped to the blade's far end (Adder's Bite) instead of
// washing the full blade (Festering Venom).
import * as THREE from 'three';

// Tip-scoped weapon aura: how far up the blade the wash starts (fraction of
// the blade's long axis measured from the grip) and how quickly it ramps in.
export const WEAPON_AURA_TIP_START = 0.55;
export const WEAPON_AURA_TIP_RAMP = 0.35;

/** A private clone of the weapon mesh geometry carrying an RGBA vertex-color
 *  ramp: opaque white at the blade tip fading to alpha 0 toward the grip, so
 *  an additive overlay in this geometry reads as a tipped weapon (Adder's
 *  Bite) instead of the full soak. The blade axis is the geometry's longest
 *  bbox extent; the tip is whichever end of it sits farther from the grip
 *  (the holder origin, transformed into this mesh's local space so quantized
 *  or recentered geometry cannot flip the ramp). Returns null when the
 *  geometry cannot be ramped (no position attribute); callers fall back to
 *  the full-blade overlay. The clone is aura-owned: dispose it with the aura. */
export function tipFadedWeaponGeometry(
  mesh: THREE.Mesh,
  holder: THREE.Object3D,
): THREE.BufferGeometry | null {
  const srcPos = mesh.geometry.getAttribute('position');
  if (!srcPos) return null;
  // grip point (the holder origin; weapon models author the grip at origin)
  // in this mesh's local space: compose the mesh -> holder chain from TRS
  // (world matrices can be stale during a rebuild), then invert.
  const toHolder = new THREE.Matrix4().compose(mesh.position, mesh.quaternion, mesh.scale);
  const step = new THREE.Matrix4();
  let node = mesh.parent;
  while (node && node !== holder) {
    step.compose(node.position, node.quaternion, node.scale);
    toHolder.premultiply(step);
    node = node.parent;
  }
  const gripLocal = new THREE.Vector3(0, 0, 0);
  if (node === holder) gripLocal.applyMatrix4(toHolder.invert());
  const box = new THREE.Box3().setFromBufferAttribute(srcPos as THREE.BufferAttribute);
  const size = new THREE.Vector3();
  box.getSize(size);
  const axis = size.x >= size.y && size.x >= size.z ? 'x' : size.y >= size.z ? 'y' : 'z';
  const min = box.min[axis];
  const max = box.max[axis];
  const span = max - min;
  if (!(span > 1e-6)) return null;
  // orient the ramp: 1 at the end farther from the grip (the tip)
  const tipAtMax = max - gripLocal[axis] >= gripLocal[axis] - min;
  const geometry = mesh.geometry.clone();
  const pos = geometry.getAttribute('position');
  const rgba = new Float32Array(pos.count * 4);
  for (let i = 0; i < pos.count; i++) {
    const v = axis === 'x' ? pos.getX(i) : axis === 'y' ? pos.getY(i) : pos.getZ(i);
    let t = (v - min) / span;
    if (!tipAtMax) t = 1 - t;
    const alpha = Math.min(1, Math.max(0, (t - WEAPON_AURA_TIP_START) / WEAPON_AURA_TIP_RAMP));
    rgba.set([1, 1, 1, alpha], i * 4);
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(rgba, 4));
  return geometry;
}
