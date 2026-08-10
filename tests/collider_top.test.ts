import { describe, expect, it } from 'vitest';
import { colliderTopAt } from '../src/sim/collider_top';
import type { Collider } from '../src/sim/colliders';

describe('colliderTopAt', () => {
  it('returns Infinity for a full-height collider (no moveTopY)', () => {
    const circle: Collider = { type: 'circle', x: 0, z: 0, r: 1 };
    const obb: Collider = { type: 'obb', x: 5, z: -3, hw: 1, hd: 1, rot: 0 };
    expect(colliderTopAt(circle, 0, 0)).toBe(Infinity);
    expect(colliderTopAt(obb, 5, -3)).toBe(Infinity);
    // no topSlope on either: even a point far from the collider still reports
    // full-height, since a flat undefined top never becomes finite.
    expect(colliderTopAt(circle, 100, 100)).toBe(Infinity);
  });

  it('returns moveTopY unchanged for a flat (no topSlope) standable top', () => {
    const circle: Collider = { type: 'circle', x: 2, z: 2, r: 1, moveTopY: 1.35, standable: true };
    const obb: Collider = {
      type: 'obb',
      x: 0,
      z: 0,
      hw: 1.5,
      hd: 1.25,
      rot: 0.7,
      moveTopY: 0.4,
      standable: true,
    };
    // A flat top is the same value everywhere, near or far, on or off center.
    expect(colliderTopAt(circle, 2, 2)).toBe(1.35);
    expect(colliderTopAt(circle, 50, -50)).toBe(1.35);
    expect(colliderTopAt(obb, 0, 0)).toBe(0.4);
    expect(colliderTopAt(obb, 10, -10)).toBe(0.4);
  });

  it('samples a ridged OBB, falling perpendicular to the named axis and clamping at the eave', () => {
    const ridgeX: Collider = {
      type: 'obb',
      x: 0,
      z: 0,
      hw: 10,
      hd: 10,
      rot: 0,
      moveTopY: 5,
      standable: true,
      topSlope: { kind: 'ridge', axis: 'x', pitch: 1, eaveY: 1 },
    };
    // axis 'x': the ridge runs along local x, so the surface falls across
    // local z and is unaffected by local x alone.
    expect(colliderTopAt(ridgeX, 0, 0)).toBe(5);
    expect(colliderTopAt(ridgeX, 4, 0)).toBe(5);
    expect(colliderTopAt(ridgeX, 0, 2)).toBeCloseTo(3, 10);
    expect(colliderTopAt(ridgeX, 0, -2)).toBeCloseTo(3, 10);
    // beyond the point where top - run*pitch would dip under eaveY, the
    // surface clamps at the eave rather than continuing to fall.
    expect(colliderTopAt(ridgeX, 0, 10)).toBe(1);

    const ridgeZ: Collider = {
      ...ridgeX,
      topSlope: { kind: 'ridge', axis: 'z', pitch: 1, eaveY: 1 },
    };
    // axis 'z': ridge runs along local z, surface falls across local x instead.
    expect(colliderTopAt(ridgeZ, 0, 4)).toBe(5);
    expect(colliderTopAt(ridgeZ, 2, 0)).toBeCloseTo(3, 10);
    expect(colliderTopAt(ridgeZ, 10, 0)).toBe(1);

    // default axis (undefined) behaves the same as axis 'x'.
    const ridgeDefault: Collider = {
      ...ridgeX,
      topSlope: { kind: 'ridge', pitch: 1, eaveY: 1 },
    };
    expect(colliderTopAt(ridgeDefault, 0, 2)).toBeCloseTo(3, 10);
    expect(colliderTopAt(ridgeDefault, 4, 0)).toBe(5);
  });

  it('rotates the ridge sample into the OBB local frame before measuring run', () => {
    const rotated: Collider = {
      type: 'obb',
      x: 0,
      z: 0,
      hw: 10,
      hd: 10,
      rot: Math.PI / 2,
      moveTopY: 5,
      standable: true,
      topSlope: { kind: 'ridge', axis: 'x', pitch: 1, eaveY: 0 },
    };
    // Rotated 90 degrees, world +x now maps onto the local axis the surface
    // falls across, and world +z maps onto the ridge-line axis (no falloff).
    expect(colliderTopAt(rotated, 3, 0)).toBeCloseTo(2, 10);
    expect(colliderTopAt(rotated, 0, 3)).toBeCloseTo(5, 10);
  });

  it('cone tops and circle colliders always sample by radial distance, regardless of axis', () => {
    const cone: Collider = {
      type: 'obb',
      x: 0,
      z: 0,
      hw: 10,
      hd: 10,
      rot: 0.3,
      moveTopY: 4,
      standable: true,
      topSlope: { kind: 'cone', axis: 'z', pitch: 1, eaveY: 0.5 },
    };
    // a 'cone' top ignores the OBB's rotated local axes and uses straight
    // world-space distance from the collider's center.
    expect(colliderTopAt(cone, 3, 4)).toBe(0.5); // hypot(3,4)=5, 4-5=-1 clamps to eave 0.5
    expect(colliderTopAt(cone, 1, 0)).toBeCloseTo(3, 10);

    const circleRidge: Collider = {
      type: 'circle',
      x: 0,
      z: 0,
      r: 1,
      moveTopY: 4,
      standable: true,
      // a 'ridge' kind with an axis, but circle colliders sample radially
      // regardless: c.type === 'circle' forces the hypot branch.
      topSlope: { kind: 'ridge', axis: 'x', pitch: 1, eaveY: 0 },
    };
    expect(colliderTopAt(circleRidge, 1, 0)).toBeCloseTo(3, 10);
    expect(colliderTopAt(circleRidge, 0, 1)).toBeCloseTo(3, 10);
    expect(colliderTopAt(circleRidge, 3, 4)).toBe(0); // hypot=5, 4-5=-1 clamps to eave 0
  });

  it('is deterministic: the same collider and point always yield the same top', () => {
    const c: Collider = {
      type: 'obb',
      x: 1.5,
      z: -2.25,
      hw: 2,
      hd: 3,
      rot: 0.41,
      moveTopY: 2.6,
      standable: true,
      topSlope: { kind: 'ridge', axis: 'z', pitch: 0.7, eaveY: 1.1 },
    };
    const a = colliderTopAt(c, 0.3, 1.2);
    const b = colliderTopAt(c, 0.3, 1.2);
    expect(a).toBe(b);
    expect(a).toEqual(colliderTopAt({ ...c }, 0.3, 1.2));
  });
});
