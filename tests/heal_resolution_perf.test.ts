import { describe, expect, it } from 'vitest';
import { Sim } from '../src/sim/sim';
import type { Entity } from '../src/sim/types';

// Regression coverage for the healing core (combat/heal.ts): applyHeal's crit
// roll, output/input multiplier stack, heal-absorb drain, and the healing-threat
// fan-out. Mirrors damage_resolution_perf.test.ts's recipe: applyHeal is not
// naturally tick-phase-lapped (it fires wherever a heal effect/HoT tick resolves,
// not on one dedicated sim.tick() phase), so this file calls it directly in a
// tight loop and times with performance.now() in the test, per the task recipe.
//
// The scenario is a healer-heavy raid shape: many healers, each firing a direct
// heal AND ticking a HoT on a damaged tank every "pulse", the concurrent-heal case
// that stresses applyHeal's per-cast cost at raid scale.

const WORLD_SEED = 20064;
const CLUSTER = { x: 0, z: -40 };

type AnySim = Sim & Record<string, any>;

// Build `healerCount` healers all topping off the SAME damaged tank, the
// worst-case concurrent-heal shape (every heal this pulse contends over one
// target's missing-hp clamp and the same threat fan-out scan).
function buildHealerRaid(healerCount: number): { sim: AnySim; healers: Entity[]; tank: Entity } {
  const sim = new Sim({ seed: WORLD_SEED, playerClass: 'priest', noPlayer: true }) as AnySim;
  const healers: Entity[] = [];
  for (let i = 0; i < healerCount; i++) {
    const pid = sim.addPlayer('priest', `Healer${i}`);
    const h = sim.entities.get(pid);
    if (!h) continue;
    h.pos.x = CLUSTER.x + (i % 20) * 0.4;
    h.pos.z = CLUSTER.z + Math.floor(i / 20) * 0.4;
    h.prevPos = { ...h.pos };
    healers.push(h);
  }
  const tankPid = sim.addPlayer('warrior', 'Tank');
  const tank = sim.entities.get(tankPid);
  if (!tank) throw new Error('missing tank');
  tank.pos.x = CLUSTER.x;
  tank.pos.z = CLUSTER.z;
  tank.prevPos = { ...tank.pos };
  // Huge maxHp so a wave of direct heals + HoT ticks never overheal-clamps the
  // sample down to a trivial branch (every heal actually applies real hp).
  tank.maxHp = 5_000_000;
  tank.hp = 1_000_000;
  return { sim, healers, tank };
}

// One "pulse" = every healer fires one direct heal and one HoT tick at the tank,
// the shape of a raid-wide healing pulse landing in the same tick.
function healPulse(sim: AnySim, healers: Entity[], tank: Entity): void {
  for (const h of healers) {
    tank.hp = Math.max(1, tank.hp - 5000); // keep real missing-hp headroom every pulse
    (sim as any).applyHeal(h, tank, 800, 'Flash Heal', 'flash_heal');
    (sim as any).applyHeal(h, tank, 150, 'Renew', 'renew', false);
  }
}

function measurePulseMedian(healerCount: number): number {
  const { sim, healers, tank } = buildHealerRaid(healerCount);
  for (let i = 0; i < 10; i++) healPulse(sim, healers, tank);

  const MEASURE = 60;
  const samples: number[] = [];
  for (let i = 0; i < MEASURE; i++) {
    const t0 = performance.now();
    healPulse(sim, healers, tank);
    samples.push(performance.now() - t0);
  }
  samples.sort((a, b) => a - b);
  return samples[Math.floor(samples.length / 2)];
}

describe('applyHeal high-load regression budget', () => {
  it('bounds a raid-wide concurrent-heal pulse at a fixed healer count', () => {
    const HEALERS = 200;
    const median = measurePulseMedian(HEALERS);

    console.log(`[applyHeal perf] healers=${HEALERS} median=${median.toFixed(2)}ms`);

    // Generous by design (see mob_update_perf.test.ts / aura_tick_perf.test.ts):
    // 25ms leaves ample headroom for slow/contended CI hardware under one 20 Hz
    // tick (50ms) while still catching a sustained order-of-magnitude regression.
    expect(median).toBeLessThan(25);
  }, 60_000);

  it('doubling the healer count does not more than roughly double the pulse cost', () => {
    const SMALL = 100;
    const LARGE = SMALL * 2;

    const smallMedian = measurePulseMedian(SMALL);
    const largeMedian = measurePulseMedian(LARGE);

    console.log(
      `[applyHeal perf] scaling small=${SMALL}(${smallMedian.toFixed(2)}ms) ` +
        `large=${LARGE}(${largeMedian.toFixed(2)}ms) ratio=${(largeMedian / Math.max(smallMedian, 0.001)).toFixed(2)}x`,
    );

    expect(largeMedian).toBeLessThan(Math.max(smallMedian * 3.5, 5));
  }, 60_000);

  it('applies real, non-vacuous healing every pulse (shape sanity)', () => {
    const HEALERS = 120;
    const { sim, healers, tank } = buildHealerRaid(HEALERS);

    const before = tank.hp;
    tank.hp = Math.max(1, tank.hp - 5000);
    const droppedHp = tank.hp;
    let totalHealed = 0;
    for (const h of healers) {
      totalHealed += (sim as any).applyHeal(h, tank, 800, 'Flash Heal', 'flash_heal');
      totalHealed += (sim as any).applyHeal(h, tank, 150, 'Renew', 'renew', false);
    }

    console.log(
      `[applyHeal perf] shape healers=${HEALERS} droppedHp=${droppedHp} ` +
        `afterHp=${tank.hp} totalHealed=${totalHealed}`,
    );

    // Real work happened: the tank's hp actually rose from the pulse, and every
    // heal call reported a positive effective amount (not overheal-clamped to 0),
    // so the budgets above are not passing against a no-op scenario.
    expect(tank.hp).toBeGreaterThan(droppedHp);
    expect(totalHealed).toBeGreaterThan(0);
    expect(tank.hp).toBeLessThanOrEqual(tank.maxHp);
    expect(before).toBeGreaterThan(0);
  }, 60_000);
});
