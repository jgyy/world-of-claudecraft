// FPS-facing allocation-stability budget for the pooled particle cloud in
// src/render/vfx.ts (the Vfx class): one THREE.Points cloud backed by fixed-size
// Float32Array attribute buffers (CAPACITY = 4096 particles), written through a ring
// buffer (`head`) in spawn(). A pool that silently starts allocating a new object per
// particle instead of reusing its preallocated slots is a classic GC-pause-causes-
// frame-drop bug: this mirrors tests/hud_perf_budget.test.ts's ARM 2 allocation section
// (assertAllocationStable from tests/util/alloc_probe.ts) and its FCT_POOL_CAP bounded-
// pool idiom, applied to the render-side VFX pool instead of the HUD DOM pool.
//
// Vfx has no jsdom/WebGL dependency of its own logic, but its constructor does touch
// `document.createElement('canvas')` once to build its sprite atlas texture. There is no
// real <canvas> 2D context in this repo's plain-Node Vitest run (no jsdom, and jsdom has
// no canvas 2D backend without the optional `canvas` native package), so this file stubs
// the minimal canvas-like surface the atlas builder touches (fillRect/drawImage/
// createRadialGradient), the same hand-rolled-fake-object idiom tests/focus_manager.test.ts
// and tests/hud_perf_budget.test.ts's fakeEl() use for the DOM side.
function fakeCanvasContext() {
  return {
    fillStyle: '',
    fillRect(): void {},
    drawImage(): void {},
    createRadialGradient(): { addColorStop(): void } {
      return { addColorStop(): void {} };
    },
  };
}
(globalThis as unknown as { document: unknown }).document = {
  createElement(tag: string): unknown {
    if (tag === 'canvas') {
      return { width: 0, height: 0, getContext: () => fakeCanvasContext() };
    }
    return {};
  },
};

import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { Vfx } from '../src/render/vfx';
import { assertAllocationStable } from './util/alloc_probe';

// Mirrors the private CAPACITY constant in src/render/vfx.ts (the pool's fixed ring-
// buffer size). Not exported by the source (pool internals are deliberately private),
// so it is pinned here as a golden constant: a deliberate future capacity change updates
// both this pin and the source in the same change.
const VFX_POOL_CAPACITY = 4096;

// Reach into the pool's private backing arrays the same way tests/mob_update_perf.test.ts
// reaches into Sim's private cfg to install a lap timer: a documented, narrow escape
// hatch onto internals the public API deliberately does not expose, used only to observe
// the allocation/pool-cap invariant, never to mutate behavior.
function poolArrays(vfx: Vfx): { life: Float32Array; pos: Float32Array } {
  return vfx as unknown as { life: Float32Array; pos: Float32Array };
}

function buildVfx(): Vfx {
  const scene = new THREE.Scene();
  return new Vfx(scene, () => null);
}

describe('vfx pooled-particle allocation + pool-cap budget', () => {
  it('keeps the live particle count bounded at the pool cap under a burst that tries to exceed it', () => {
    const vfx = buildVfx();
    // A burst far larger than the pool capacity (many simultaneous casts landing in one
    // frame): burst() spawns `count` particles via the ring buffer, wrapping around
    // CAPACITY repeatedly rather than growing the backing store.
    const OVERSIZED_BURST = VFX_POOL_CAPACITY * 3;
    vfx.burst(new THREE.Vector3(0, 0, 0), 'fire', OVERSIZED_BURST, 1);

    const { life, pos } = poolArrays(vfx);
    // The backing arrays never grow past their constructed size, regardless of burst size.
    expect(life.length).toBe(VFX_POOL_CAPACITY);
    expect(pos.length).toBe(VFX_POOL_CAPACITY * 3);

    let alive = 0;
    for (let i = 0; i < life.length; i++) if (life[i] > 0) alive++;
    // Every slot got touched by the oversized burst (it wraps around CAPACITY at least
    // once), so the live count saturates at exactly the cap, never the requested count.
    expect(alive).toBeLessThanOrEqual(VFX_POOL_CAPACITY);
    expect(alive).toBe(VFX_POOL_CAPACITY);
    expect(alive).toBeLessThan(OVERSIZED_BURST);
  });

  it('reuses the same backing buffers across repeated bursts once warmed up (no per-emit growth)', () => {
    const vfx = buildVfx();
    // Warm up once, then prove the pool's container identity is stable across many more
    // bursts: a regression that swapped the ring buffer for a per-emit allocation (e.g. a
    // growing array of particle objects) would reallocate the container here.
    vfx.burst(new THREE.Vector3(0, 0, 0), 'frost', 32, 1);
    expect(() => {
      assertAllocationStable(() => poolArrays(vfx).pos, 60, 'vfx particle pos buffer');
      assertAllocationStable(() => poolArrays(vfx).life, 60, 'vfx particle life buffer');
    }).not.toThrow();

    // Driving many more bursts must not grow the buffers either (the ring buffer
    // recycles slots in place; steady-state emission allocates nothing new).
    for (let i = 0; i < 50; i++) {
      vfx.burst(new THREE.Vector3(i, 0, 0), 'arcane', 16, 1);
    }
    const { life, pos } = poolArrays(vfx);
    expect(life.length).toBe(VFX_POOL_CAPACITY);
    expect(pos.length).toBe(VFX_POOL_CAPACITY * 3);
  });

  it('shape sanity: the oversized burst really would have exceeded the cap without wraparound', () => {
    const vfx = buildVfx();
    const OVERSIZED_BURST = VFX_POOL_CAPACITY * 3;
    // Sanity-check the scenario itself: the requested burst count is meaningfully larger
    // than the pool cap, so a hypothetical unbounded pool would have grown past it.
    expect(OVERSIZED_BURST).toBeGreaterThan(VFX_POOL_CAPACITY);
    vfx.burst(new THREE.Vector3(0, 0, 0), 'holy', OVERSIZED_BURST, 1);
    const { life } = poolArrays(vfx);
    // Confirm the burst really drove writes (non-vacuous): at least one slot is alive.
    let anyAlive = false;
    for (let i = 0; i < life.length; i++) if (life[i] > 0) anyAlive = true;
    expect(anyAlive).toBe(true);
  });
});
