// placeAquaticDressing draws the lily-pad + kelp instanced-mesh dressing for
// the flooded Drowned Temple / Drowned Court rooms. hash2 is Math.sin-based
// (not Math.random), so the same layout must produce byte-identical instance
// counts and matrices on every call.
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { placeAquaticDressing } from '../src/render/dungeon_aquatic_dressing';
import type { DungeonLayout } from '../src/sim/dungeon_layout';

function makeLayout(overrides: Partial<DungeonLayout> = {}): DungeonLayout {
  return {
    zMin: 0,
    zMax: 60,
    sideWallZ: 30,
    sideWallHd: 30,
    pillars: [],
    tombs: [],
    stubs: [],
    dais: { x: 0, z: 55, r: 6 },
    ...overrides,
  };
}

function matrixArrays(group: THREE.Group): number[][][] {
  return group.children.map((child) => {
    const mesh = child as THREE.InstancedMesh;
    const out: number[][] = [];
    const m = new THREE.Matrix4();
    for (let i = 0; i < mesh.count; i++) {
      mesh.getMatrixAt(i, m);
      out.push(m.toArray());
    }
    return out;
  });
}

describe('placeAquaticDressing', () => {
  it('is deterministic: identical layout produces identical instance counts and matrices', () => {
    const layout = makeLayout();

    const groupA = new THREE.Group();
    placeAquaticDressing(groupA, layout);
    const groupB = new THREE.Group();
    placeAquaticDressing(groupB, layout);

    expect(groupA.children.length).toBeGreaterThan(0);
    expect(groupA.children.length).toBe(groupB.children.length);

    const countsA = groupA.children.map((c) => (c as THREE.InstancedMesh).count);
    const countsB = groupB.children.map((c) => (c as THREE.InstancedMesh).count);
    expect(countsA).toEqual(countsB);
    expect(countsA.every((n) => n > 0)).toBe(true);

    expect(matrixArrays(groupA)).toEqual(matrixArrays(groupB));
  });

  it('adds no meshes when the z-range is too small for the placement loops to fire', () => {
    // Lily pads step from zMin+8 in strides of 12 while z < zMax-6; kelp
    // steps from zMin+10 in strides of 13 while z < zMax-8. A room shorter
    // than either first stride never enters either loop.
    const layout = makeLayout({ zMin: 0, zMax: 10 });

    const group = new THREE.Group();
    placeAquaticDressing(group, layout);

    expect(group.children.length).toBe(0);
  });
});
