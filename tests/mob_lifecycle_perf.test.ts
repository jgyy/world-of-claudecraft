// Perf/regression budget for mob/lifecycle.ts (respawnMob + frenzyPackmates) at a
// large simultaneous-death/respawn population. Mirrors the measurement recipe in
// tests/mob_update_perf.test.ts and tests/aura_tick_perf.test.ts: warm up, sample many
// iterations, take the MEDIAN (rejects one-off GC/scheduling spikes from co-running
// Vitest workers), assert a generous absolute budget plus a scaling check.
//
// respawnMob/frenzyPackmates are SimContext-seam functions (mob/lifecycle.ts), not
// wired to a named sim.tick() perfLap phase, so this file calls them directly in a
// loop against a real Sim's ctx, exactly like tests/mob_lifecycle.test.ts does.
import { describe, expect, it } from 'vitest';
import { MOBS } from '../src/sim/data';
import { createMob } from '../src/sim/entity';
import { frenzyPackmates, respawnMob } from '../src/sim/mob/lifecycle';
import { Sim } from '../src/sim/sim';
import type { Entity } from '../src/sim/types';

const WORLD_SEED = 20063;

// biome-ignore lint/suspicious/noExplicitAny: mirrors the (sim as any).ctx idiom used throughout tests/mob_lifecycle.test.ts to reach the SimContext seam.
const ctxOf = (sim: Sim): any => (sim as any).ctx;

// Build a dense pack of forest_wolf mobs (a packFrenzy-carrying family): killing and
// respawning them all simultaneously exercises both the respawn reset path and the
// frenzyPackmates neighbor scan against a full same-template crowd every death.
function buildPack(count: number): { sim: Sim; mobs: Entity[] } {
  const sim = new Sim({ seed: WORLD_SEED, playerClass: 'warrior', noPlayer: true });
  const template = MOBS.forest_wolf;
  const mobs: Entity[] = [];
  const CLUSTER = { x: 0, z: 60 };
  for (let i = 0; i < count; i++) {
    const ang = (i / count) * Math.PI * 2;
    const r = 2 + (i % 11);
    const pos = sim.groundPos(CLUSTER.x + Math.sin(ang) * r, CLUSTER.z + Math.cos(ang) * r);
    const mob = createMob(sim.nextId++, template, template.maxLevel, pos);
    mob.facing = ang;
    mob.prevFacing = ang;
    mob.spawnPos = { ...pos };
    mob.hostile = true;
    sim.addEntity(mob);
    mobs.push(mob);
  }
  sim.grid.refresh(sim.entities.values());
  return { sim, mobs };
}

// Kills every mob in the pack (marks dead, without going through handleDeath), then
// runs frenzyPackmates for each death followed by respawnMob for each corpse. Returns
// the elapsed ms for that whole cascade.
function measureCascade(count: number): number {
  const { sim, mobs } = buildPack(count);
  const ctx = ctxOf(sim);
  for (const m of mobs) m.dead = true;
  const start = performance.now();
  for (const m of mobs) frenzyPackmates(ctx, m);
  for (const m of mobs) {
    m.dead = true; // respawnMob does not itself require `dead`, but mirrors the real call site
    respawnMob(ctx, m);
  }
  return performance.now() - start;
}

function measureCascadeMedian(count: number, samples: number): number {
  const times: number[] = [];
  // Warm up once (separate Sim/pack, discarded) so JIT warms before sampling.
  measureCascade(count);
  for (let i = 0; i < samples; i++) times.push(measureCascade(count));
  times.sort((a, b) => a - b);
  return times[Math.floor(times.length / 2)];
}

describe('mob lifecycle (respawnMob + frenzyPackmates) high-load regression budget', () => {
  it('bounds the full-pack simultaneous death/respawn cascade cost at a fixed population', () => {
    const COUNT = 300;
    const median = measureCascadeMedian(COUNT, 40);

    console.log(`[mob.lifecycle perf] pack=${COUNT} median=${median.toFixed(2)}ms`);

    // Generous by design (see mob_update_perf.test.ts): observed healthy median for a
    // 300-mob simultaneous wipe/respawn cascade is a low single-digit ms figure; 40ms
    // leaves ample headroom for slow/contended CI hardware while still catching a
    // sustained order-of-magnitude regression.
    expect(median).toBeLessThan(40);
  }, 60_000);

  it('doubling the pack size does not more than roughly double the cascade cost', () => {
    const SMALL = 150;
    const LARGE = SMALL * 2;

    const smallMedian = measureCascadeMedian(SMALL, 30);
    const largeMedian = measureCascadeMedian(LARGE, 30);

    console.log(
      `[mob.lifecycle perf] scaling small=${SMALL}(${smallMedian.toFixed(2)}ms) ` +
        `large=${LARGE}(${largeMedian.toFixed(2)}ms) ` +
        `ratio=${(largeMedian / Math.max(smallMedian, 0.001)).toFixed(2)}x`,
    );

    // A doubled pack doing genuinely linear-per-mob work should land near 2x; the bound
    // is set generously above that (3.5x) to absorb noise at small absolute ms
    // magnitudes while still failing hard on an O(n^2) regression (e.g. frenzyPackmates
    // losing its radius-scoped grid query and scanning every mob per death).
    expect(largeMedian).toBeLessThan(Math.max(smallMedian * 3.5, 5));
  }, 60_000);

  it('actually built and processed the full simultaneous-death pack (shape sanity)', () => {
    const COUNT = 300;
    const { sim, mobs } = buildPack(COUNT);
    const ctx = ctxOf(sim);
    expect(mobs.length).toBe(COUNT);

    for (const m of mobs) m.dead = true;
    let frenzied = 0;
    for (const m of mobs) {
      frenzyPackmates(ctx, m);
    }
    for (const m of sim.entities.values()) {
      if (m.kind === 'mob' && m.auras.some((a) => a.id === 'pack_frenzy')) frenzied++;
    }
    // Every surviving-at-the-time packmate within radius should have picked up the
    // frenzy buff at least once during the cascade: proves the worst-case shape (a
    // dense same-template pack, not a scattered or empty one) was really built.
    expect(frenzied).toBeGreaterThan(0);

    let respawned = 0;
    for (const m of mobs) {
      respawnMob(ctx, m);
      if (!m.dead && m.hp === m.maxHp) respawned++;
    }
    expect(respawned).toBe(COUNT);
  });
});
