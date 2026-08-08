// Rift boss lethal death zone visual: a pulsing red danger ring drawn on the
// terrain at the zone's (x, z) position while the boss casts. The cast bar is
// the primary telegraph; this ring makes the exact danger radius visible so
// players can step out before the detonation. The ring fades on detonation.
//
// Fairness note: this is an actionable cue (a player reacts to it), so it MUST
// draw at every graphics tier and NEVER be hidden by the FPS governor. The
// ring is a triangulated annulus (a filled mesh) with WORLD-UNIT thickness
// rather than a 1px THREE.LineLoop: browsers clamp LineBasicMaterial's
// gl_LineWidth to 1 regardless of the requested value, which on a high-DPI
// screen over busy rift terrain made the ring easy to lose entirely (issue
// #2917). A mesh's apparent screen thickness scales with world-space size
// like everything else in the scene, so it stays visible at any zoom or DPI.
// The rim is also sampled PER VERTEX against the live ground height (see
// rift_ring_geometry_core.ts), so a rim crossing a raised dais or sanctum
// platform follows the surface instead of clipping under it.

import * as THREE from 'three';
import type { RiftBossDeathZoneView } from '../world_api/dungeons';
import { buildAnnulusGeometryData, DEFAULT_RING_THICKNESS } from './rift_ring_geometry_core';

const SEGMENTS = 32;
const BASE_COLOR = 0xff2200;
const BASE_OPACITY = 0.85;
const PULSE_SPEED = 4.0; // full pulse cycle per second

/** One live death zone visual (a terrain-draped red danger ring mesh). */
interface ZoneVisual {
  mesh: THREE.Mesh;
  mat: THREE.MeshBasicMaterial;
  x: number;
  z: number;
  radius: number;
  /** 0..1 phase clock for the pulse animation, driven by update(dt). */
  phase: number;
}

/** Manages rift boss lethal death zone visuals. Add to the renderer alongside
 * other ground-ring systems (ringOfFrostVisuals, etc.). */
export class RiftDeathZoneVisuals {
  private readonly zones = new Map<string, ZoneVisual>();

  constructor(
    private readonly scene: THREE.Scene,
    private readonly groundY: (x: number, z: number) => number,
  ) {}

  /** Called each frame with the current zone list from IWorld.riftBossDeathZones().
   * Zones are keyed by position + radius (short-lived, so a simple position key
   * is sufficient; two coincident zones on the same tick are collapsed, which is
   * fine for gameplay). */
  sync(zones: readonly RiftBossDeathZoneView[]): void {
    const seen = new Set<string>();
    for (const z of zones) {
      const key = `${z.x.toFixed(1)}:${z.z.toFixed(1)}:${z.radius.toFixed(1)}`;
      seen.add(key);
      if (!this.zones.has(key)) {
        this.create(key, z);
      }
    }
    for (const [key, visual] of this.zones) {
      if (!seen.has(key)) {
        this.scene.remove(visual.mesh);
        visual.mat.dispose();
        visual.mesh.geometry.dispose();
        this.zones.delete(key);
      }
    }
  }

  /** Called each frame with the elapsed frame time in seconds. */
  update(dt: number): void {
    for (const visual of this.zones.values()) {
      visual.phase = (visual.phase + dt * PULSE_SPEED) % (Math.PI * 2);
      // Pulse between full opacity and ~40% so the ring reads clearly but is not
      // static (the motion draws the eye to the danger zone).
      const alpha = BASE_OPACITY * (0.4 + 0.6 * (0.5 + 0.5 * Math.sin(visual.phase)));
      visual.mat.opacity = alpha;
    }
  }

  private create(key: string, zone: RiftBossDeathZoneView): void {
    // Sample the ground height at every rim vertex (both the raised dais and
    // the rift platform lift are baked into the groundY callback the renderer
    // passes in), not once at the zone center, so the ring follows a platform
    // edge instead of dipping under it.
    const { positions, indices } = buildAnnulusGeometryData(
      zone.x,
      zone.z,
      zone.radius,
      DEFAULT_RING_THICKNESS,
      SEGMENTS,
      this.groundY,
    );
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setIndex(new THREE.BufferAttribute(indices, 1));
    const mat = new THREE.MeshBasicMaterial({
      color: BASE_COLOR,
      transparent: true,
      opacity: BASE_OPACITY,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.renderOrder = 10; // above terrain, below entities
    // Actionable telegraph: never let the frustum-culling fast path drop it
    // (the ring can span past the camera-relative bounding box at close
    // range while the boss is still tanked on its edge).
    mesh.frustumCulled = false;
    this.scene.add(mesh);
    this.zones.set(key, { mesh, mat, x: zone.x, z: zone.z, radius: zone.radius, phase: 0 });
  }
}
