// Pure terrain painter for the world-map / minimap background. Kept
// host-agnostic (no DOM, no canvas) so it can be unit-tested directly and so
// the heavy per-pixel work can be time-sliced across idle callbacks by the HUD
// without forking the pixel math. It writes straight into a flat RGBA buffer
// (the same `Uint8ClampedArray` an `ImageData.data` exposes).
//
// The colours sample the SAME `terrainHeight`/`roadDistance` the renderer and
// sim use, so the map always matches the real world, do not diverge them.
import { ZONES } from '../sim/data';
import { noise2 } from '../sim/rng';
import { biomeAt, roadDistance, terrainHeight, waterBodies } from '../sim/world';

// A lake's on-map shoreline is jittered by a smooth per-angle noise (sampled
// around a small circle in noise-space, so it wraps seamlessly at 0/2π)
// instead of drawn as the sim's exact circular water-body test: a perfectly
// round lake reads as an unnatural, geometric shape on the flat map, whereas
// the real coastline gets to look organic here purely cosmetically (the
// walkable/swimmable footprint in 3D is unchanged; this only affects which
// pixels the map paints blue).
const SHORE_NOISE_RADIUS = 3; // radius in noise-space the angle samples around
const SHORE_JITTER_FRACTION = 0.22; // max +/- shoreline wobble, as a fraction of the lake's radius
const SHORE_NOISE_SEED = 9001;

function isWaterJittered(x: number, z: number): boolean {
  for (const body of waterBodies()) {
    const dx = x - body.x;
    const dz = z - body.z;
    const dist = Math.hypot(dx, dz);
    if (dist > body.radius * (1 + SHORE_JITTER_FRACTION)) continue;
    const angle = Math.atan2(dz, dx);
    const n = noise2(
      Math.cos(angle) * SHORE_NOISE_RADIUS + body.x * 0.01,
      Math.sin(angle) * SHORE_NOISE_RADIUS + body.z * 0.01,
      SHORE_NOISE_SEED,
    );
    const jitteredRadius = body.radius * (1 + (n - 0.5) * 2 * SHORE_JITTER_FRACTION);
    if (dist < jitteredRadius) return true;
  }
  return false;
}

export interface MapRegion {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

// Pixel height of a W-wide terrain canvas covering `region` (square-pixel).
export function mapCanvasHeight(W: number, region: MapRegion): number {
  return Math.round((W * (region.maxZ - region.minZ)) / (region.maxX - region.minX));
}

// Paint rows [y0, y1) of a W×H RGBA buffer for `region`. Splitting by whole
// rows is what lets the prewarm chunk the work: the only per-row state is the
// hillshade's left-neighbour height, which resets at each row's first pixel, so
// a chunked render is byte-identical to a single-pass one.
export function paintTerrainRows(
  data: Uint8ClampedArray,
  W: number,
  H: number,
  region: MapRegion,
  seed: number,
  y0: number,
  y1: number,
): void {
  const spanX = region.maxX - region.minX;
  const spanZ = region.maxZ - region.minZ;
  for (let iy = y0; iy < y1; iy++) {
    let prevH = 0; // height of the left-neighbour pixel, for free hillshade
    for (let ix = 0; ix < W; ix++) {
      // +Z up, +X LEFT: facing 0 is +Z ("north") and turning right decreases
      // facing, so the world's east is -X, and drawing +X to the right mirrored
      // the whole map east-west
      const x = region.maxX - (ix / W) * spanX;
      const z = region.maxZ - (iy / H) * spanZ;
      const h = terrainHeight(x, z, seed);
      // A declared lake's on-map footprint follows the same circular water
      // body the renderer's flat water plane covers (waterBodies(),
      // sim/world.ts), not a height threshold: the basin's smoothstep blend
      // into the surrounding rolling terrain can dip below waterLevel() again
      // near its own outer blend radius (invisible in 3D, hidden under the
      // opaque water plane), which painted a second disconnected "moat" ring
      // on the flat map when this used to gate on height instead of the
      // declared footprint. The footprint itself is jittered per angle
      // (isWaterJittered) so the shoreline reads as organic, not a perfect
      // circle.
      const isWater = isWaterJittered(x, z);
      // biomeAt (not the 1D zoneBiomeAt) so a painted feature like the
      // Sunken Road tunnel shows its own grey rock scar on the map instead of
      // the surrounding zone's green.
      const biome = biomeAt(x, z);
      let r = 58,
        g = 105,
        b = 48;
      if (biome === 'marsh') {
        r = 64;
        g = 86;
        b = 48;
      } else if (biome === 'peaks') {
        r = 92;
        g = 100;
        b = 82;
      } else if (biome === 'cave') {
        r = 108;
        g = 108;
        b = 112;
      }
      if (isWater) {
        r = 38;
        g = 84;
        b = 138;
      } else if (h > 26) {
        r = 168;
        g = 172;
        b = 178;
      } // ridge / peak rock+snow
      else if (h > 11) {
        r = 112;
        g = 110;
        b = 102;
      } else if (h > 6) {
        r = 88;
        g = 102;
        b = 62;
      }
      let nearHub = false;
      for (const zn of ZONES) {
        if (Math.hypot(x - zn.hub.x, z - zn.hub.z) < 14) {
          nearHub = true;
          break;
        }
      }
      if (nearHub) {
        r = 125;
        g = 100;
        b = 66;
      } else if (!isWater && roadDistance(x, z) < 2.4) {
        r = 138;
        g = 111;
        b = 71;
      }
      // hillshade: relief from the west-to-east slope, reusing the already-computed
      // left-neighbour height so it costs no extra terrainHeight() calls
      const left = ix === 0 ? h : prevH;
      prevH = h;
      if (!isWater) {
        const shade = Math.max(0.74, Math.min(1.28, 1 + (h - left) * 0.16));
        r = Math.min(255, r * shade);
        g = Math.min(255, g * shade);
        b = Math.min(255, b * shade);
      }
      const k = (iy * W + ix) * 4;
      data[k] = r;
      data[k + 1] = g;
      data[k + 2] = b;
      data[k + 3] = 255;
    }
  }
}
