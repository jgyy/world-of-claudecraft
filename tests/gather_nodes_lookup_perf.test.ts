import { describe, expect, it } from 'vitest';
import { NODE_COLOR, NODE_GEOMETRY_KEYS, NODE_Y_OFFSET } from '../src/render/gather_nodes_lookup';
import type { GatherNodeType } from '../src/sim/data';

// Regression coverage gap: tests/gather_nodes.test.ts pins content COVERAGE
// (every node type has a color/geometry entry) but says nothing about the
// per-node LOOKUP cost as the number of placed gather nodes grows. props.ts
// resolves color/y-offset/geometry-key per gather node instance when building
// the world's node views, so a zone dense with ore/wood/herb nodes is exactly
// the per-frame-adjacent, per-instance decision that could regress if the
// lookup ever stopped being a flat table read (e.g. degraded into a linear
// scan or a per-lookup allocation). This mirrors the sim-side perf recipe
// (tests/mob_update_perf.test.ts, tests/aura_tick_perf.test.ts): warm up,
// sample the median of many repeated calls, assert an absolute budget plus a
// doubling-population scaling check.

const TYPES: readonly GatherNodeType[] = ['ore', 'wood', 'herb'];

interface PlacedNode {
  type: GatherNodeType;
}

// Build `count` placed gather-node instances cycling through every known
// node type, mirroring a zone dense with all three resource types.
function buildNodes(count: number): PlacedNode[] {
  const nodes: PlacedNode[] = [];
  for (let i = 0; i < count; i++) {
    nodes.push({ type: TYPES[i % TYPES.length] });
  }
  return nodes;
}

// Simulate resolving the render-visual for every placed node instance: the
// per-node color/y-offset/geometry-key lookup props.ts performs when building
// node views.
function runLookupPass(nodes: PlacedNode[]): {
  colorSum: number;
  offsetSum: number;
  geometryHits: number;
} {
  let colorSum = 0;
  let offsetSum = 0;
  let geometryHits = 0;
  for (const node of nodes) {
    colorSum += NODE_COLOR[node.type];
    offsetSum += NODE_Y_OFFSET[node.type];
    if (NODE_GEOMETRY_KEYS.includes(node.type)) geometryHits++;
  }
  return { colorSum, offsetSum, geometryHits };
}

function measureMedianMs(
  count: number,
  samples: number,
): { medianMs: number; last: { colorSum: number; offsetSum: number; geometryHits: number } } {
  const nodes = buildNodes(count);

  let last = { colorSum: 0, offsetSum: 0, geometryHits: 0 };
  for (let i = 0; i < 10; i++) last = runLookupPass(nodes);

  const times: number[] = [];
  for (let i = 0; i < samples; i++) {
    const start = performance.now();
    last = runLookupPass(nodes);
    times.push(performance.now() - start);
  }
  times.sort((a, b) => a - b);
  return { medianMs: times[Math.floor(times.length / 2)], last };
}

describe('gather_nodes_lookup per-instance lookup cost', () => {
  it('bounds the per-instance visual-lookup cost across many placed gather nodes', () => {
    const NODES = 5000;
    const { medianMs } = measureMedianMs(NODES, 50);

    console.log(`[gather_nodes_lookup perf] nodes=${NODES} median=${medianMs.toFixed(3)}ms`);

    // Generous by design: each lookup is a flat object/array read, so a
    // healthy median for 5000 node instances is well under 1ms; 8ms leaves
    // ample headroom for slow/contended CI hardware while still catching an
    // order-of-magnitude regression (e.g. the lookup degrading into a linear
    // scan or per-call allocation).
    expect(medianMs).toBeLessThan(8);
  }, 30_000);

  it('doubling the placed-node count does not more than roughly double the lookup cost', () => {
    const SMALL = 2500;
    const LARGE = SMALL * 2;

    const small = measureMedianMs(SMALL, 50);
    const large = measureMedianMs(LARGE, 50);

    console.log(
      `[gather_nodes_lookup perf] scaling small=${SMALL}(${small.medianMs.toFixed(3)}ms) ` +
        `large=${LARGE}(${large.medianMs.toFixed(3)}ms) ` +
        `ratio=${(large.medianMs / Math.max(small.medianMs, 0.001)).toFixed(2)}x`,
    );

    // Generous linear headroom, same rationale as aura_tick_perf.test.ts.
    expect(large.medianMs).toBeLessThan(Math.max(small.medianMs * 3.5, 2));
  }, 30_000);

  it('actually resolved every placed node to a real, non-trivial visual', () => {
    const NODES = 5000;
    const { last } = measureMedianMs(NODES, 5);

    // Shape sanity: every one of the 5000 placed nodes resolved to a
    // registered geometry key, and the accumulated color/offset sums are
    // genuinely non-zero (proving real lookups happened, not a no-op loop).
    expect(last.geometryHits).toBe(NODES);
    expect(last.colorSum).toBeGreaterThan(0);
    expect(last.offsetSum).toBeGreaterThan(0);
  });
});
