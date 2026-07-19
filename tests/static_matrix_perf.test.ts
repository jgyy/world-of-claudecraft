// FPS-facing perf budget for freezeStaticMatrices (src/render/static_matrix.ts): the
// one-time subtree freeze that stops Three r165's per-frame matrixAutoUpdate churn for
// never-moving prop/terrain nodes. It runs on scene build (not per frame), but its own
// cost still scales with subtree size, so this pins a budget + linear-scaling check the
// same way tests/mob_update_perf.test.ts pins the mob-update phase: warm up, sample many
// calls, sort, gate on the median.
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { freezeStaticMatrices } from '../src/render/static_matrix';

// A wide+shallow static prop tree: a root with `n` leaf children, each with a small
// local transform, the shape of a batch of streamed static props/terrain tiles.
function buildStaticTree(n: number): THREE.Object3D {
  const root = new THREE.Group();
  for (let i = 0; i < n; i++) {
    const child = new THREE.Object3D();
    child.position.set(i * 0.1, 0, (i % 7) * 0.3);
    child.rotation.y = (i % 12) * 0.1;
    root.add(child);
  }
  return root;
}

function medianOf(samples: number[]): number {
  const sorted = [...samples].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

const SAMPLES = 40;
const WARMUP = 5;

function timeMedian(build: () => THREE.Object3D): number {
  for (let i = 0; i < WARMUP; i++) freezeStaticMatrices(build());
  const samples: number[] = [];
  for (let i = 0; i < SAMPLES; i++) {
    const root = build();
    const t0 = performance.now();
    freezeStaticMatrices(root);
    samples.push(performance.now() - t0);
  }
  return medianOf(samples);
}

describe('static_matrix perf budget', () => {
  it('bounds freezeStaticMatrices cost over a large static subtree', () => {
    const N = 2000;
    const median = timeMedian(() => buildStaticTree(N));
    // Generous by design: freezing 2000 nodes is a one-time scene-build cost, not
    // per-frame; a 50ms budget leaves ample headroom for slow/contended CI hardware
    // while still catching an order-of-magnitude regression.
    expect(median).toBeLessThan(50);
  });

  it('scales freezeStaticMatrices roughly linearly with instance count', () => {
    const SMALL = 500;
    const LARGE = 1000;
    const smallMedian = timeMedian(() => buildStaticTree(SMALL));
    const largeMedian = timeMedian(() => buildStaticTree(LARGE));
    const floor = Math.max(smallMedian, 0.001);
    expect(largeMedian / floor).toBeLessThanOrEqual(3.5 * (LARGE / SMALL));
  });

  it('shape sanity: the freeze actually visits and pins every node in the subtree', () => {
    const N = 300;
    const root = buildStaticTree(N);
    let count = 0;
    root.traverse(() => {
      count++;
    });
    // root + N children.
    expect(count).toBe(N + 1);
    freezeStaticMatrices(root);
    let stillAutoUpdating = 0;
    root.traverse((o) => {
      if (o.matrixAutoUpdate) stillAutoUpdating++;
    });
    expect(stillAutoUpdating).toBe(0);
  });
});
