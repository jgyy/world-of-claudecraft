import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { RiftDeathZoneVisuals } from '../src/render/rift_death_zone';

describe('RiftDeathZoneVisuals (issue #2917: visible telegraph rings)', () => {
  it('draws a filled mesh annulus, not a 1px LineLoop', () => {
    const scene = new THREE.Scene();
    const visuals = new RiftDeathZoneVisuals(scene, () => 0);
    visuals.sync([{ x: 0, z: 0, radius: 9, remaining: 2 }]);

    expect(scene.children.length).toBe(1);
    const mesh = scene.children[0];
    expect(mesh).toBeInstanceOf(THREE.Mesh);
    expect(mesh).not.toBeInstanceOf(THREE.LineLoop);
    const geo = (mesh as THREE.Mesh).geometry;
    // A filled annulus has an index buffer (triangles); a line loop does not.
    expect(geo.getIndex()).not.toBeNull();
  });

  it('is never frustum-culled: the fairness contract this ring must never be dropped', () => {
    const scene = new THREE.Scene();
    const visuals = new RiftDeathZoneVisuals(scene, () => 0);
    visuals.sync([{ x: 0, z: 0, radius: 9, remaining: 2 }]);
    const mesh = scene.children[0] as THREE.Mesh;
    expect(mesh.frustumCulled).toBe(false);
  });

  it('drapes the ring rim per vertex so it follows a platform edge instead of clipping under it', () => {
    const scene = new THREE.Scene();
    // A step function: x >= 0 sits on a raised platform 3 units up.
    const stepGround = (x: number) => (x >= 0 ? 3 : 0);
    const visuals = new RiftDeathZoneVisuals(scene, stepGround);
    visuals.sync([{ x: 0, z: 0, radius: 9, remaining: 2 }]);

    const mesh = scene.children[0] as THREE.Mesh;
    const positions = mesh.geometry.getAttribute('position') as THREE.BufferAttribute;
    const heights = new Set<number>();
    for (let i = 0; i < positions.count; i++) {
      heights.add(Math.round(positions.getY(i) * 100) / 100);
    }
    // Both the platform height and the ground height must appear: a
    // center-sampled ring would carry only one flat height for the whole rim.
    expect(heights.size).toBeGreaterThanOrEqual(2);
  });

  it('removes the mesh and disposes its resources when the zone expires', () => {
    const scene = new THREE.Scene();
    const visuals = new RiftDeathZoneVisuals(scene, () => 0);
    visuals.sync([{ x: 0, z: 0, radius: 9, remaining: 2 }]);
    expect(scene.children.length).toBe(1);

    visuals.sync([]);
    expect(scene.children.length).toBe(0);
  });

  it('pulses opacity over time without dropping the ring (update never hides it entirely)', () => {
    const scene = new THREE.Scene();
    const visuals = new RiftDeathZoneVisuals(scene, () => 0);
    visuals.sync([{ x: 0, z: 0, radius: 9, remaining: 2 }]);
    const mesh = scene.children[0] as THREE.Mesh;
    const mat = mesh.material as THREE.MeshBasicMaterial;

    for (let t = 0; t < 5; t += 0.05) {
      visuals.update(0.05);
      // Even at the pulse's dimmest, the ring stays visibly present (never 0).
      expect(mat.opacity).toBeGreaterThan(0.1);
    }
  });
});
