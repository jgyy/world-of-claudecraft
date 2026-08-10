// Weapon-local geometry helpers extracted from weapon_vfx.ts: root-relative
// transforms, measured local bounds, weapon-local anchor resolution, and
// area-weighted random surface points. Plain THREE, no document/canvas
// stubbing needed.
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
  localBounds,
  resolvePoint,
  rootRelativeMatrix,
  surfacePoints,
} from '../src/render/weapon_vfx_geometry';

describe('resolvePoint', () => {
  const box = new THREE.Box3(new THREE.Vector3(-2, 0, 10), new THREE.Vector3(4, 8, 20));

  it('resolves xF/yF/zF fractions against the box min/max plus dx/dy/dz offsets', () => {
    const p = resolvePoint(box, { xF: 0.25, yF: 0.75, zF: 0.5, dx: 1, dy: -0.5, dz: 2 });
    // x: -2 + (4 - -2) * 0.25 = -0.5, then +1 => 0.5
    // y: 0 + (8 - 0) * 0.75 = 6, then -0.5 => 5.5
    // z: 10 + (20 - 10) * 0.5 = 15, then +2 => 17
    expect(p.x).toBeCloseTo(0.5);
    expect(p.y).toBeCloseTo(5.5);
    expect(p.z).toBeCloseTo(17);
  });

  it('resolves the yF=0 boundary to the box minimum', () => {
    const p = resolvePoint(box, { yF: 0 });
    expect(p.y).toBeCloseTo(0);
  });

  it('resolves the yF=1 boundary to the box maximum', () => {
    const p = resolvePoint(box, { yF: 1 });
    expect(p.y).toBeCloseTo(8);
  });

  it('defaults every axis fraction to 0.5 (box center) when given {}', () => {
    const p = resolvePoint(box, {});
    expect(p.x).toBeCloseTo(1); // -2 + 6 * 0.5
    expect(p.y).toBeCloseTo(4); // 0 + 8 * 0.5
    expect(p.z).toBeCloseTo(15); // 10 + 10 * 0.5
  });

  it('defaults every axis fraction to 0.5 when the anchor argument is omitted', () => {
    const p = resolvePoint(box);
    expect(p.x).toBeCloseTo(1);
    expect(p.y).toBeCloseTo(4);
    expect(p.z).toBeCloseTo(15);
  });
});

describe('rootRelativeMatrix', () => {
  it('returns the identity when mesh === root', () => {
    const root = new THREE.Object3D();
    root.position.set(3, 4, 5);
    root.updateMatrixWorld(true);
    const m = rootRelativeMatrix(root, root);
    expect(m.elements).toEqual(new THREE.Matrix4().elements);
  });

  it('composes correctly for a child offset from root', () => {
    const root = new THREE.Object3D();
    root.position.set(1, 2, 3);
    root.rotation.y = Math.PI / 2;
    const child = new THREE.Object3D();
    child.position.set(0, 1, 0);
    root.add(child);
    root.updateMatrixWorld(true);

    const m = rootRelativeMatrix(root, child);
    // The child sits at local (0, 1, 0) relative to root regardless of root's
    // own world transform, so the root-relative point should recover exactly
    // that local offset.
    const p = new THREE.Vector3().applyMatrix4(m);
    expect(p.x).toBeCloseTo(0);
    expect(p.y).toBeCloseTo(1);
    expect(p.z).toBeCloseTo(0);
  });
});

describe('localBounds', () => {
  it('unions a simple mesh geometry bounding box into root-relative space', () => {
    const root = new THREE.Object3D();
    const geometry = new THREE.BoxGeometry(2, 2, 2); // -1..1 on every axis
    const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial());
    mesh.position.set(5, 0, 0);
    root.add(mesh);

    const box = localBounds(root);
    expect(box.min.x).toBeCloseTo(4);
    expect(box.max.x).toBeCloseTo(6);
    expect(box.min.y).toBeCloseTo(-1);
    expect(box.max.y).toBeCloseTo(1);
    expect(box.min.z).toBeCloseTo(-1);
    expect(box.max.z).toBeCloseTo(1);
  });

  it('skips meshes flagged userData.__vfx', () => {
    const root = new THREE.Object3D();
    const realGeometry = new THREE.BoxGeometry(2, 2, 2);
    const realMesh = new THREE.Mesh(realGeometry, new THREE.MeshBasicMaterial());
    root.add(realMesh);

    const vfxGeometry = new THREE.BoxGeometry(200, 200, 200);
    const vfxMesh = new THREE.Mesh(vfxGeometry, new THREE.MeshBasicMaterial());
    vfxMesh.userData.__vfx = true;
    root.add(vfxMesh);

    const box = localBounds(root);
    // If the flagged mesh were included the bounds would be +-100; instead
    // they must stay pinned to the unflagged 2x2x2 box.
    expect(box.min.x).toBeCloseTo(-1);
    expect(box.max.x).toBeCloseTo(1);
  });
});

describe('surfacePoints', () => {
  it('returns the requested count of points lying on the mesh triangles with y >= yMin', () => {
    const root = new THREE.Object3D();
    const geometry = new THREE.BoxGeometry(4, 4, 4); // spans -2..2 on every axis
    const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial());
    root.add(mesh);

    // yMin sits at (below) the mesh's own minimum, so every sampled point on
    // every triangle clears it and the full requested count comes back.
    const yMin = -2;
    const pts = surfacePoints(root, 50, yMin);
    expect(pts.length).toBe(50);
    for (const p of pts) {
      expect(p.y).toBeGreaterThanOrEqual(yMin);
      // Points must stay within the box's overall extent (with slack for
      // floating point) since they lie on its actual triangles.
      expect(p.x).toBeGreaterThanOrEqual(-2.0001);
      expect(p.x).toBeLessThanOrEqual(2.0001);
      expect(p.z).toBeGreaterThanOrEqual(-2.0001);
      expect(p.z).toBeLessThanOrEqual(2.0001);
    }
  });

  it('returns an empty array when no triangle clears yMin', () => {
    const root = new THREE.Object3D();
    const geometry = new THREE.BoxGeometry(4, 4, 4); // spans -2..2 on every axis
    const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial());
    root.add(mesh);

    const pts = surfacePoints(root, 50, 100);
    expect(pts).toEqual([]);
  });
});
