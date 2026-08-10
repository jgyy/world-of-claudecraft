import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
  buildDelveEmbers,
  delvePortalMaterial,
  drownVeilMaterial,
  resetDelvePortalFxCaches,
} from '../src/render/delve_portal_fx';
import { GFX } from '../src/render/gfx';

describe('delvePortalMaterial cache', () => {
  it('returns the identical ShaderMaterial instance for the same dim/bright/rim triple', () => {
    const a = delvePortalMaterial(0x03000a, 0x6e0a85, 0xd90a1a);
    const b = delvePortalMaterial(0x03000a, 0x6e0a85, 0xd90a1a);
    expect(a).toBeInstanceOf(THREE.ShaderMaterial);
    expect(b).toBe(a);
  });

  it('returns a distinct instance for a different colour triple', () => {
    const defaultMat = delvePortalMaterial(0x03000a, 0x6e0a85, 0xd90a1a);
    const drownedMat = delvePortalMaterial(0x01060c, 0x0c2c3a, 0x176079);
    expect(drownedMat).not.toBe(defaultMat);
    expect(drownedMat).toBeInstanceOf(THREE.ShaderMaterial);
  });

  it('mints a fresh instance for the same triple after resetDelvePortalFxCaches', () => {
    const before = delvePortalMaterial(0x111111, 0x222222, 0x333333);
    resetDelvePortalFxCaches();
    const after = delvePortalMaterial(0x111111, 0x222222, 0x333333);
    expect(after).not.toBe(before);
  });
});

describe('drownVeilMaterial cache', () => {
  it('returns the identical cloned Material instance for the same source material', () => {
    const src = new THREE.MeshStandardMaterial({ color: 0x884422 });
    const a = drownVeilMaterial(src);
    const b = drownVeilMaterial(src);
    expect(a).not.toBe(src);
    expect(b).toBe(a);
    expect(a.customProgramCacheKey?.()).toBe('drownVeil');
    expect(typeof a.onBeforeCompile).toBe('function');
  });

  it('returns a distinct clone for a different source material', () => {
    const srcA = new THREE.MeshStandardMaterial({ color: 0x884422 });
    const srcB = new THREE.MeshStandardMaterial({ color: 0x224488 });
    const cloneA = drownVeilMaterial(srcA);
    const cloneB = drownVeilMaterial(srcB);
    expect(cloneB).not.toBe(cloneA);
  });
});

describe('buildDelveEmbers', () => {
  it('returns a Points cloud with the expected particle-count attribute sizes', () => {
    const expectedCount = GFX.standardMaterials ? 48 : 28;
    const halfW = 2.5;
    const riseY = 4;
    const pts = buildDelveEmbers(10, 1, -20, halfW, riseY);

    expect(pts).toBeInstanceOf(THREE.Points);
    const geo = pts.geometry;
    expect(geo.getAttribute('position').count).toBe(expectedCount);
    expect(geo.getAttribute('aPhase').count).toBe(expectedCount);
    expect(geo.getAttribute('aSpeed').count).toBe(expectedCount);
    expect(geo.getAttribute('aDrift').count).toBe(expectedCount);
  });

  it('sets a manual boundingSphere derived from halfW/riseY, since motion is shader-driven', () => {
    const halfW = 3;
    const riseY = 5;
    const pts = buildDelveEmbers(0, 0, 0, halfW, riseY);
    const sphere = pts.geometry.boundingSphere;

    expect(sphere).not.toBeNull();
    expect(sphere!.center.x).toBeCloseTo(0);
    expect(sphere!.center.y).toBeCloseTo(riseY / 2);
    expect(sphere!.center.z).toBeCloseTo(0);
    expect(sphere!.radius).toBeCloseTo(Math.max(halfW, riseY) + 1.5);
  });

  it('positions the returned Points object at the given world anchor', () => {
    const pts = buildDelveEmbers(12, 3.5, -7, 1, 2);
    expect(pts.position.x).toBeCloseTo(12);
    expect(pts.position.y).toBeCloseTo(3.5);
    expect(pts.position.z).toBeCloseTo(-7);
  });
});
