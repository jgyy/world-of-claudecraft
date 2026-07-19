import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
  isProjectedNameplateAnchorVisible,
  nameplateScreenTransform,
} from '../src/render/nameplate_projection';

// Perf-budget coverage for the render-side hot path: nameplate_projection.ts's
// isProjectedNameplateAnchorVisible + nameplateScreenTransform run once PER
// VISIBLE ENTITY, PER FRAME (the painter projects every candidate nameplate
// anchor through the camera before deciding whether to draw it).
// tests/nameplate_projection.test.ts pins the projection DECISIONS; this file
// pins the COST at scale (many entities projected per frame), the actual
// FPS-relevant question the sim-side perf suite does not cover.

function camera(): THREE.PerspectiveCamera {
  const cam = new THREE.PerspectiveCamera(60, 16 / 9, 0.1, 1000);
  cam.position.set(0, 2, 10);
  cam.lookAt(0, 2, 0);
  cam.updateMatrixWorld();
  return cam;
}

// Worst case: many world positions spread in front of, beside, and behind the
// camera, forcing a real matrix-transform + comparison for every entity rather
// than a trivially short-circuited case.
function buildWorldPositions(count: number): THREE.Vector3[] {
  const positions: THREE.Vector3[] = [];
  for (let i = 0; i < count; i++) {
    const ang = (i / count) * Math.PI * 2;
    const r = 2 + (i % 30);
    positions.push(new THREE.Vector3(Math.sin(ang) * r, 2, Math.cos(ang) * r));
  }
  return positions;
}

function measureProjectionMedianMs(count: number): number {
  const cam = camera();
  const positions = buildWorldPositions(count);
  // The painter reuses one scratch Vector3 across all entities each frame
  // (the cameraSpace out-param idiom this suite follows elsewhere).
  const scratch = new THREE.Vector3();

  const runOnce = (): number => {
    let visibleCount = 0;
    for (let i = 0; i < positions.length; i++) {
      if (isProjectedNameplateAnchorVisible(cam, positions[i], scratch)) {
        visibleCount++;
        nameplateScreenTransform(i * 0.1, i * 0.2);
      }
    }
    return visibleCount;
  };

  for (let i = 0; i < 10; i++) runOnce();

  const SAMPLES = 60;
  const samples: number[] = [];
  for (let i = 0; i < SAMPLES; i++) {
    const t0 = performance.now();
    runOnce();
    samples.push(performance.now() - t0);
  }
  samples.sort((a, b) => a - b);
  return samples[Math.floor(samples.length / 2)];
}

describe('nameplate_projection perf: per-entity screen projection cost', () => {
  it('bounds the per-frame cost of projecting a crowd of nameplate anchors', () => {
    const COUNT = 300;
    const median = measureProjectionMedianMs(COUNT);

    console.log(`[nameplate_projection perf] entities=${COUNT} median=${median.toFixed(3)}ms`);

    // Generous by design (see mob_update_perf.test.ts): observed healthy median
    // for 300 matrix-transform + string-format calls is a small fraction of a
    // ms; 5ms leaves ample headroom for slow/contended CI hardware while still
    // catching an order-of-magnitude regression well inside a 16.6ms frame.
    expect(median).toBeLessThan(5);
  }, 30_000);

  it('doubling the crowd does not more than roughly double the projection cost', () => {
    const SMALL = 200;
    const LARGE = SMALL * 2;

    const smallMedian = measureProjectionMedianMs(SMALL);
    const largeMedian = measureProjectionMedianMs(LARGE);

    console.log(
      `[nameplate_projection perf] scaling small=${SMALL}(${smallMedian.toFixed(3)}ms) ` +
        `large=${LARGE}(${largeMedian.toFixed(3)}ms) ` +
        `ratio=${(largeMedian / Math.max(smallMedian, 0.001)).toFixed(2)}x`,
    );

    // Per-entity work doubling should land near 2x; bound set generously
    // (3.5x) to absorb noise at these small absolute ms magnitudes while still
    // failing hard on an accidental O(n^2) regression.
    expect(largeMedian).toBeLessThan(Math.max(smallMedian * 3.5, 0.5));
  }, 30_000);

  it('actually built a worst-case mixed in-front/behind-camera crowd (shape sanity)', () => {
    const cam = camera();
    const positions = buildWorldPositions(300);
    expect(positions.length).toBe(300);
    const scratch = new THREE.Vector3();
    let visible = 0;
    let hidden = 0;
    for (const pos of positions) {
      if (isProjectedNameplateAnchorVisible(cam, pos, scratch)) visible++;
      else hidden++;
    }
    // The ring of positions really spans both sides of the camera, so both
    // visible and hidden buckets are non-empty (a non-vacuous worst case).
    expect(visible).toBeGreaterThan(0);
    expect(hidden).toBeGreaterThan(0);
    expect(nameplateScreenTransform(1.005, 2.005)).toBe(
      'translate3d(1.00px, 2.00px, 0) translate(-50%, -100%)',
    );
  });
});
