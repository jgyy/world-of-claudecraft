import { describe, expect, it } from 'vitest';
import {
  declutterNameplatesInPlace,
  type NameplateAnchor,
  type NameplateDeclutterMetrics,
} from '../src/render/nameplate_declutter';

// Perf-budget coverage for the render-side hot path: nameplate_declutter.ts runs
// EVERY frame over every visible nameplate anchor (the painter's post-projection
// declutter pass). tests/nameplate_declutter.test.ts pins its DECISIONS
// (agreement with an O(N^2) reference oracle) and its internal candidate-check
// metrics at scale; this file pins its WALL-CLOCK COST, the actual FPS-relevant
// question. The worst case for this pass is a dense cluster of overlapping
// anchors (a raid stacked on one boss, or a town crowd on the same screen spot),
// which forces the largest connected-component work.

const OVERLAP_X = 80;
const OVERLAP_Y = 18;

// Dense overlapping cluster: every anchor packed within collision range of its
// neighbours (the pathological case the spatial hash's component walk exists
// for), spread across several clumps so declutter does real cross-cell work.
function buildDenseClusters(count: number): NameplateAnchor[] {
  const anchors: NameplateAnchor[] = [];
  const perClump = 40;
  for (let i = 0; i < count; i++) {
    const clump = Math.floor(i / perClump);
    const within = i % perClump;
    anchors.push({
      id: i,
      sx: clump * 2000 + (within % 6) * (OVERLAP_X * 0.3),
      sy: (within % 4) * (OVERLAP_Y * 0.3),
    });
  }
  return anchors;
}

function measureDeclutterMedianMs(count: number): number {
  const template = buildDenseClusters(count);
  const metrics: NameplateDeclutterMetrics = { candidateChecks: 0, spatialHashResizes: 0 };

  const runOnce = (): void => {
    const anchors = template.map((a) => ({ ...a }));
    declutterNameplatesInPlace(anchors, anchors.length, metrics);
  };

  for (let i = 0; i < 10; i++) runOnce();

  const SAMPLES = 50;
  const samples: number[] = [];
  for (let i = 0; i < SAMPLES; i++) {
    const t0 = performance.now();
    runOnce();
    samples.push(performance.now() - t0);
  }
  samples.sort((a, b) => a - b);
  return samples[Math.floor(samples.length / 2)];
}

describe('nameplate_declutter perf: declutterNameplatesInPlace crowd cost', () => {
  it('bounds the per-frame cost of decluttering a dense overlapping crowd', () => {
    const COUNT = 400;
    const median = measureDeclutterMedianMs(COUNT);

    console.log(`[nameplate_declutter perf] anchors=${COUNT} median=${median.toFixed(3)}ms`);

    // Generous by design (see mob_update_perf.test.ts / aura_tick_perf.test.ts):
    // observed healthy median for a few hundred densely-clustered anchors is a
    // small fraction of a ms (the spatial hash keeps this near-linear); 8ms
    // leaves ample headroom for slow/contended CI hardware while still catching
    // an order-of-magnitude regression well inside one 16.6ms (60fps) frame.
    expect(median).toBeLessThan(8);
  }, 30_000);

  it('doubling the dense crowd does not more than roughly double the declutter cost', () => {
    const SMALL = 300;
    const LARGE = SMALL * 2;

    const smallMedian = measureDeclutterMedianMs(SMALL);
    const largeMedian = measureDeclutterMedianMs(LARGE);

    console.log(
      `[nameplate_declutter perf] scaling small=${SMALL}(${smallMedian.toFixed(3)}ms) ` +
        `large=${LARGE}(${largeMedian.toFixed(3)}ms) ` +
        `ratio=${(largeMedian / Math.max(smallMedian, 0.001)).toFixed(2)}x`,
    );

    // A near-linear spatial-hash pass doubling its input should land near 2x;
    // bound generously (3.5x) to absorb noise at these small ms magnitudes
    // while still failing hard on a regression that reintroduces the quadratic
    // full-rescan behavior the header comment says this module fixed.
    expect(largeMedian).toBeLessThan(Math.max(smallMedian * 3.5, 1));
  }, 30_000);

  it('actually built dense, overlapping clusters that trigger real stacking work', () => {
    const anchors = buildDenseClusters(400);
    expect(anchors.length).toBe(400);
    const metrics: NameplateDeclutterMetrics = { candidateChecks: 0, spatialHashResizes: 0 };
    declutterNameplatesInPlace(anchors, anchors.length, metrics);
    // Real collisions were found and resolved (some anchors moved off their
    // original sy), proving the clustering was non-vacuous.
    const original = buildDenseClusters(400);
    let moved = 0;
    for (let i = 0; i < anchors.length; i++) if (anchors[i].sy !== original[i].sy) moved++;
    expect(moved).toBeGreaterThan(0);
    expect(metrics.candidateChecks).toBeGreaterThan(0);
  });
});
