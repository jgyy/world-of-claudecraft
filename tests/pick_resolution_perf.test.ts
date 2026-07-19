// FPS-facing perf budget for the click-picking resolution path: resolveDirectPickEntityId
// (src/render/pick_resolution.ts) and nearestSloppyPickId (src/render/sloppy_pick.ts). Both
// run once per click on the render thread, but the worst case is a dense cluster of
// candidates under the cursor (a stacked pile of corpses, or a mob pack pressed together on
// screen), where each is an O(n) scan over the candidate set. This mirrors the
// median-of-N + scaling recipe used by tests/mob_update_perf.test.ts and
// tests/aura_tick_perf.test.ts: warm up, sample many calls, sort, gate on the median (never
// the mean, so a single GC/scheduler pause on shared CI hardware cannot flake the budget).
import { describe, expect, it } from 'vitest';
import { resolveDirectPickEntityId } from '../src/render/pick_resolution';
import { nearestSloppyPickId, type SloppyPickCandidate } from '../src/render/sloppy_pick';

type TestPickEntity = {
  id: number;
  kind: 'mob' | 'object' | 'player' | 'npc';
  dead: boolean;
  lootable: boolean;
};

// A dense stacked-corpse pile: every hit id is a lootable corpse, the worst case for
// resolveDirectPickEntityId (it must filter + findIndex over every candidate to cycle).
function buildCorpsePile(n: number): {
  hitEntityIds: number[];
  entities: Map<number, TestPickEntity>;
} {
  const hitEntityIds: number[] = [];
  const entities = new Map<number, TestPickEntity>();
  for (let i = 0; i < n; i++) {
    hitEntityIds.push(i);
    entities.set(i, { id: i, kind: 'mob', dead: true, lootable: true });
  }
  return { hitEntityIds, entities };
}

// A dense screen-space cluster: many candidates whose body-to-nameplate columns all pass
// near the click point (a packed mob camp viewed from range), the worst case for
// nearestSloppyPickId's linear nearest-column scan.
function buildScreenCluster(n: number): SloppyPickCandidate[] {
  const candidates: SloppyPickCandidate[] = [];
  for (let i = 0; i < n; i++) {
    const jitter = (i % 23) * 0.4;
    candidates.push({
      id: i,
      midX: 400 + jitter,
      midY: 300 + jitter,
      topX: 400 + jitter,
      topY: 260 + jitter,
    });
  }
  return candidates;
}

function medianOf(samples: number[]): number {
  const sorted = [...samples].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

const SAMPLES = 60;
const WARMUP = 10;

function timeMedian(run: () => void): number {
  for (let i = 0; i < WARMUP; i++) run();
  const samples: number[] = [];
  for (let i = 0; i < SAMPLES; i++) {
    const t0 = performance.now();
    run();
    samples.push(performance.now() - t0);
  }
  return medianOf(samples);
}

describe('pick_resolution + sloppy_pick perf budget', () => {
  it('bounds resolveDirectPickEntityId per-call cost at a dense stacked-corpse pile', () => {
    const DENSE = 400;
    const { hitEntityIds, entities } = buildCorpsePile(DENSE);
    const median = timeMedian(() => {
      resolveDirectPickEntityId(hitEntityIds, entities, hitEntityIds[DENSE - 1]);
    });
    // Generous by design: a healthy median at this density is a fraction of a ms; 5ms
    // leaves ample headroom for slow/contended CI hardware while still catching an
    // order-of-magnitude regression (e.g. an accidental O(n^2) rewrite of the cycle logic).
    expect(median).toBeLessThan(5);
  });

  it('scales resolveDirectPickEntityId roughly linearly with candidate count', () => {
    const SMALL = 100;
    const LARGE = 200;
    const small = buildCorpsePile(SMALL);
    const large = buildCorpsePile(LARGE);
    const smallMedian = timeMedian(() =>
      resolveDirectPickEntityId(small.hitEntityIds, small.entities, small.hitEntityIds[SMALL - 1]),
    );
    const largeMedian = timeMedian(() =>
      resolveDirectPickEntityId(large.hitEntityIds, large.entities, large.hitEntityIds[LARGE - 1]),
    );
    // Doubling the candidate count should cost at most ~3.5x (comfortable headroom over
    // the expected ~2x for a linear scan; catches an accidental quadratic blowup).
    const floor = Math.max(smallMedian, 0.001);
    expect(largeMedian / floor).toBeLessThanOrEqual(3.5 * (LARGE / SMALL));
  });

  it('bounds nearestSloppyPickId per-call cost at a dense on-screen cluster', () => {
    const DENSE = 500;
    const candidates = buildScreenCluster(DENSE);
    const median = timeMedian(() => {
      nearestSloppyPickId(410, 310, candidates, 40);
    });
    expect(median).toBeLessThan(5);
  });

  it('scales nearestSloppyPickId roughly linearly with candidate count', () => {
    const SMALL = 150;
    const LARGE = 300;
    const smallCandidates = buildScreenCluster(SMALL);
    const largeCandidates = buildScreenCluster(LARGE);
    const smallMedian = timeMedian(() => nearestSloppyPickId(410, 310, smallCandidates, 40));
    const largeMedian = timeMedian(() => nearestSloppyPickId(410, 310, largeCandidates, 40));
    const floor = Math.max(smallMedian, 0.001);
    expect(largeMedian / floor).toBeLessThanOrEqual(3.5 * (LARGE / SMALL));
  });

  it('shape sanity: the pile and cluster scenarios actually exercise dense overlap', () => {
    const DENSE = 400;
    const { hitEntityIds, entities } = buildCorpsePile(DENSE);
    // Every candidate is a lootable corpse, so the cycle-through-corpses branch runs
    // (not the trivial single-hit fast path).
    let lootableCount = 0;
    for (const e of entities.values())
      if (e.kind === 'mob' && e.dead && e.lootable) lootableCount++;
    expect(lootableCount).toBe(DENSE);
    expect(resolveDirectPickEntityId(hitEntityIds, entities, hitEntityIds[0])).toBe(
      hitEntityIds[1],
    );

    const cluster = buildScreenCluster(500);
    // The cluster candidates really do overlap near the click point (within the pick
    // radius), not scattered far away.
    const hit = nearestSloppyPickId(410, 310, cluster, 40);
    expect(hit).not.toBeNull();
  });
});
