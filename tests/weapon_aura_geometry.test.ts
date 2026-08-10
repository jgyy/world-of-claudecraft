import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
  tipFadedWeaponGeometry,
  WEAPON_AURA_TIP_RAMP,
  WEAPON_AURA_TIP_START,
} from '../src/render/characters/weapon_aura_geometry';

/** A straight "blade" from x=0 (grip end, sits at the holder origin) to
 *  x=10 (tip end), parented directly under `holder` so the grip-local point
 *  is exactly the holder origin. */
function makeBladeMesh(): { mesh: THREE.Mesh; holder: THREE.Object3D } {
  const holder = new THREE.Object3D();
  const positions = new Float32Array(11 * 3);
  for (let i = 0; i <= 10; i++) {
    positions[i * 3] = i;
    positions[i * 3 + 1] = 0;
    positions[i * 3 + 2] = 0;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const mesh = new THREE.Mesh(geometry);
  holder.add(mesh);
  return { mesh, holder };
}

describe('tipFadedWeaponGeometry', () => {
  it('ramps the vertex-color alpha from 0 near the grip to 1 at the tip', () => {
    const { mesh, holder } = makeBladeMesh();

    const result = tipFadedWeaponGeometry(mesh, holder);

    expect(result).not.toBeNull();
    const color = result?.getAttribute('color') as THREE.BufferAttribute;
    expect(color).toBeDefined();
    expect(color.itemSize).toBe(4);
    for (let i = 0; i <= 10; i++) {
      const t = i / 10;
      const expectedAlpha = Math.min(
        1,
        Math.max(0, (t - WEAPON_AURA_TIP_START) / WEAPON_AURA_TIP_RAMP),
      );
      expect(color.getW(i)).toBeCloseTo(expectedAlpha, 5);
      // the ramp only ever touches alpha; color stays opaque white
      expect(color.getX(i)).toBe(1);
      expect(color.getY(i)).toBe(1);
      expect(color.getZ(i)).toBe(1);
    }
    // grip end (index 0) is fully transparent, tip end (index 10) fully opaque
    expect(color.getW(0)).toBe(0);
    expect(color.getW(10)).toBe(1);
  });

  it('returns null when the mesh geometry has no position attribute', () => {
    const holder = new THREE.Object3D();
    const mesh = new THREE.Mesh(new THREE.BufferGeometry());
    holder.add(mesh);

    expect(tipFadedWeaponGeometry(mesh, holder)).toBeNull();
  });

  it('returns null when the geometry has near-zero extent along every axis', () => {
    const holder = new THREE.Object3D();
    const positions = new Float32Array([0, 0, 0, 0, 0, 0]);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const mesh = new THREE.Mesh(geometry);
    holder.add(mesh);

    expect(tipFadedWeaponGeometry(mesh, holder)).toBeNull();
  });
});
