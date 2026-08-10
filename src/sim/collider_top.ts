import type { Collider } from './colliders';

/**
 * The standable surface height of a collider at a point: `moveTopY` for flat
 * tops, the pitched surface for sloped ones (never above `moveTopY`, never
 * below the eaves). Infinity for full-height colliders, which have no top.
 */
export function colliderTopAt(c: Collider, x: number, z: number): number {
  const top = c.moveTopY;
  if (top === undefined) return Infinity;
  const s = c.topSlope;
  if (!s) return top;
  let run: number;
  if (s.kind === 'cone' || c.type === 'circle') {
    run = Math.hypot(x - c.x, z - c.z);
  } else {
    const cos = Math.cos(-c.rot);
    const sin = Math.sin(-c.rot);
    const lx = (x - c.x) * cos + (z - c.z) * sin;
    const lz = -(x - c.x) * sin + (z - c.z) * cos;
    // The surface falls across the axis PERPENDICULAR to the ridge line.
    run = s.axis === 'z' ? Math.abs(lx) : Math.abs(lz);
  }
  return Math.max(s.eaveY, top - run * s.pitch);
}
