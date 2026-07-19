// FPS-facing perf budget for delveInteractableVisible (src/render/delve_interactable_visibility_core.ts):
// the per-interactable visibility decision the renderer walks every frame across every
// tracked delve prop (chests, levers, consumed variants that must stay readable). It is a
// tiny pure function, but a per-frame walk over hundreds of interactables still has a real
// aggregate cost, so this pins a budget + linear-scaling check the same way
// tests/mob_update_perf.test.ts and tests/aura_tick_perf.test.ts do: warm up, sample many
// calls, sort, gate on the median.
import { describe, expect, it } from 'vitest';
import { delveInteractableVisible } from '../src/render/delve_interactable_visibility_core';

interface Interactable {
  templateId: string | null;
  lootable: boolean;
}

// A dense delve room's worth of interactables: a mix of stateful delve_* props (some
// consumed, some not) and generic lootable/non-lootable props, so every branch of the
// decision runs across the sweep.
function buildInteractables(n: number): Interactable[] {
  const items: Interactable[] = [];
  for (let i = 0; i < n; i++) {
    const bucket = i % 4;
    if (bucket === 0) items.push({ templateId: `delve_chest_${i}`, lootable: false });
    else if (bucket === 1) items.push({ templateId: `delve_lever_${i}`, lootable: true });
    else if (bucket === 2) items.push({ templateId: `prop_rock_${i}`, lootable: false });
    else items.push({ templateId: null, lootable: true });
  }
  return items;
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

describe('delve_interactable_visibility perf budget', () => {
  it('bounds the visibility sweep over a large interactable set', () => {
    const N = 5000;
    const items = buildInteractables(N);
    const median = timeMedian(() => {
      let visible = 0;
      for (const it of items) {
        if (delveInteractableVisible(it.templateId, it.lootable)) visible++;
      }
      return visible;
    });
    // Generous by design: 5000 trivial boolean decisions should cost a fraction of a
    // ms; 10ms leaves ample headroom for slow/contended CI hardware while still
    // catching an order-of-magnitude regression.
    expect(median).toBeLessThan(10);
  });

  it('scales the visibility sweep roughly linearly with interactable count', () => {
    const SMALL = 1000;
    const LARGE = 2000;
    const smallItems = buildInteractables(SMALL);
    const largeItems = buildInteractables(LARGE);
    const sweep = (items: Interactable[]) => () => {
      for (const it of items) delveInteractableVisible(it.templateId, it.lootable);
    };
    const smallMedian = timeMedian(sweep(smallItems));
    const largeMedian = timeMedian(sweep(largeItems));
    const floor = Math.max(smallMedian, 0.001);
    expect(largeMedian / floor).toBeLessThanOrEqual(3.5 * (LARGE / SMALL));
  });

  it('shape sanity: the sweep exercises every visibility branch', () => {
    const items = buildInteractables(400);
    let delveVisible = 0;
    let lootableVisible = 0;
    let hidden = 0;
    for (const it of items) {
      const visible = delveInteractableVisible(it.templateId, it.lootable);
      if (!visible) {
        hidden++;
        continue;
      }
      if (it.templateId?.startsWith('delve_')) delveVisible++;
      else lootableVisible++;
    }
    expect(delveVisible).toBeGreaterThan(0);
    expect(lootableVisible).toBeGreaterThan(0);
    expect(hidden).toBeGreaterThan(0);
  });
});
