// Pure vertex-generation math for a terrain-draped danger ring: an annulus
// (a thin flat ring, not a 1px line) whose rim is sampled per vertex against
// the live ground height, so the ring follows a rift platform edge instead of
// clipping under it when the rim crosses a raised dais or sanctum floor.
//
// THREE-free by design (RENDER_PURE_CORES): a plain Vitest can build the
// vertex/index arrays and assert on their shape without a WebGL context. The
// thin painter half (rift_death_zone.ts) turns these arrays into a
// THREE.BufferGeometry.

/** One vertex of the annulus mesh: world position plus the small vertical lift
 * that avoids z-fighting with the terrain underneath it. */
export interface RingVertex {
  x: number;
  y: number;
  z: number;
}

export interface AnnulusGeometryData {
  /** Flat [x0,y0,z0, x1,y1,z1, ...] vertex positions, inner and outer rim
   * vertices interleaved per segment (2 vertices per segment index). */
  positions: Float32Array;
  /** Triangle indices into `positions` (2 triangles per segment). */
  indices: Uint16Array | Uint32Array;
}

/** Minimum world-unit ring thickness so it survives high-DPI downscale and a
 * 1px LineBasicMaterial cap (browsers clamp gl_LineWidth to 1 regardless of
 * the requested value; a filled mesh has no such cap). */
export const DEFAULT_RING_THICKNESS = 0.5;

/** Builds the inner/outer rim vertices for a terrain-draped annulus centered
 * at (centerX, centerZ) with the given mean radius and thickness. `groundY`
 * is sampled ONCE PER RIM VERTEX (not once at the center), so a rim that
 * crosses a platform edge follows the surface it sits on instead of dipping
 * under it. `segments` controls the ring's smoothness (24-32 reads as round
 * at normal camera distance while staying cheap). `lift` is the small
 * vertical offset above the sampled ground to prevent z-fighting.
 */
export function buildAnnulusRingVertices(
  centerX: number,
  centerZ: number,
  radius: number,
  thickness: number,
  segments: number,
  groundY: (x: number, z: number) => number,
  lift = 0.08,
): RingVertex[] {
  const innerRadius = Math.max(0, radius - thickness / 2);
  const outerRadius = radius + thickness / 2;
  const verts: RingVertex[] = [];
  for (let i = 0; i <= segments; i++) {
    const angle = (i / segments) * Math.PI * 2;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    for (const r of [innerRadius, outerRadius]) {
      const x = centerX + cos * r;
      const z = centerZ + sin * r;
      verts.push({ x, y: groundY(x, z) + lift, z });
    }
  }
  return verts;
}

/** Triangulates the vertex strip `buildAnnulusRingVertices` produces into an
 * indexed mesh: two triangles per segment connecting the inner/outer rim. */
export function triangulateAnnulusStrip(segments: number): number[] {
  const indices: number[] = [];
  for (let i = 0; i < segments; i++) {
    const a = i * 2; // inner, this segment
    const b = i * 2 + 1; // outer, this segment
    const c = i * 2 + 2; // inner, next segment
    const d = i * 2 + 3; // outer, next segment
    indices.push(a, b, c, b, d, c);
  }
  return indices;
}

/** Convenience wrapper combining the two steps above into flat typed arrays,
 * ready to hand to a `THREE.BufferGeometry`. */
export function buildAnnulusGeometryData(
  centerX: number,
  centerZ: number,
  radius: number,
  thickness: number,
  segments: number,
  groundY: (x: number, z: number) => number,
  lift = 0.08,
): AnnulusGeometryData {
  const verts = buildAnnulusRingVertices(
    centerX,
    centerZ,
    radius,
    thickness,
    segments,
    groundY,
    lift,
  );
  const positions = new Float32Array(verts.length * 3);
  for (let i = 0; i < verts.length; i++) {
    positions[i * 3] = verts[i].x;
    positions[i * 3 + 1] = verts[i].y;
    positions[i * 3 + 2] = verts[i].z;
  }
  const rawIndices = triangulateAnnulusStrip(segments);
  const indices =
    verts.length > 65535 ? new Uint32Array(rawIndices) : new Uint16Array(rawIndices);
  return { positions, indices };
}
