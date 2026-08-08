import { describe, expect, it } from 'vitest';
import {
  buildAnnulusGeometryData,
  buildAnnulusRingVertices,
  DEFAULT_RING_THICKNESS,
  triangulateAnnulusStrip,
} from '../src/render/rift_ring_geometry_core';

describe('rift_ring_geometry_core (issue #2917: visible telegraph rings)', () => {
  it('gives the annulus a world-unit thickness on flat ground, not a 1px line', () => {
    const flat = () => 0;
    const verts = buildAnnulusRingVertices(0, 0, 10, DEFAULT_RING_THICKNESS, 32, flat);
    // Each segment emits an inner then an outer vertex; the radial gap between
    // them must equal the requested thickness (a real mesh width, not a line).
    for (let i = 0; i <= 32; i++) {
      const inner = verts[i * 2];
      const outer = verts[i * 2 + 1];
      const innerR = Math.hypot(inner.x, inner.z);
      const outerR = Math.hypot(outer.x, outer.z);
      expect(outerR - innerR).toBeCloseTo(DEFAULT_RING_THICKNESS, 4);
    }
  });

  it('samples ground height PER VERTEX so the rim follows a platform edge', () => {
    // A step function: everything with x >= 0 sits on a raised platform.
    const stepGround = (x: number) => (x >= 0 ? 3 : 0);
    const verts = buildAnnulusRingVertices(0, 0, 10, DEFAULT_RING_THICKNESS, 64, stepGround);
    const heights = new Set(verts.map((v) => Math.round(v.y * 100) / 100));
    // Both the platform height (3 + lift) and the ground height (0 + lift)
    // must appear among the rim vertices: a center-only sample would produce
    // only ONE height for the whole ring and half the rim would clip.
    expect(heights.size).toBeGreaterThanOrEqual(2);
    expect(Array.from(heights)).toContain(3.08);
    expect(Array.from(heights)).toContain(0.08);
  });

  it('lifts every vertex above the sampled ground to avoid z-fighting', () => {
    const groundAt = (x: number, z: number) => x * 0.1 + z * 0.2;
    const verts = buildAnnulusRingVertices(5, -3, 8, 0.5, 24, groundAt, 0.08);
    for (const v of verts) {
      expect(v.y).toBeCloseTo(groundAt(v.x, v.z) + 0.08, 6);
    }
  });

  it('triangulates a closed strip: two triangles per segment, valid indices', () => {
    const segments = 24;
    const indices = triangulateAnnulusStrip(segments);
    expect(indices.length).toBe(segments * 6);
    const maxIndex = (segments + 1) * 2 - 1;
    for (const idx of indices) {
      expect(idx).toBeGreaterThanOrEqual(0);
      expect(idx).toBeLessThanOrEqual(maxIndex);
    }
  });

  it('buildAnnulusGeometryData returns flat typed arrays sized for the vertex count', () => {
    const segments = 32;
    const { positions, indices } = buildAnnulusGeometryData(
      0,
      0,
      10,
      DEFAULT_RING_THICKNESS,
      segments,
      () => 0,
    );
    const vertexCount = (segments + 1) * 2;
    expect(positions.length).toBe(vertexCount * 3);
    expect(indices.length).toBe(segments * 6);
  });
});
