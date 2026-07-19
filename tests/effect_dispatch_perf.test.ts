import { describe, expect, it } from 'vitest';
import { MOBS } from '../src/sim/data';
import { createMob } from '../src/sim/entity';
import { Sim } from '../src/sim/sim';
import type { Entity, SimEvent } from '../src/sim/types';

// Regression coverage for the per-effect dispatch switch (combat/effect_dispatch.ts
// runEffects): the fan-out that turns a resolved ability's effects[] into damage,
// dot/hot auras, threat, and stat recalcs. runEffects fires the instant an INSTANT
// cast resolves (castAbilityImpl calls it synchronously, not via a dedicated
// sim.tick() lap), so this file times sim.castAbility(...) directly across a raid
// of simultaneously-casting players, mirroring the direct-call recipe used for
// dealDamage/applyHeal. The scenario mixes effect TYPES on purpose (a direct-damage
// nuke and a hot/heal), the shape a raid actually casts in the same GCD window.

const WORLD_SEED = 20065;
const CLUSTER = { x: 20, z: -20 };

type AnySim = Sim & Record<string, any>;

// Half the raid are shaman nuking a shared mob target (direct damage effect);
// half are priests renewing a shared friendly target (hot/heal effect). Every
// caster is reset to full resource and its cooldowns cleared before each pulse so
// a fixed population casts EVERY pulse (the worst-case dispatch load), rather than
// most of the raid sitting on cooldown after the first wave.
function buildCastingRaid(count: number): {
  sim: AnySim;
  nukers: Entity[];
  healers: Entity[];
  mobTarget: Entity;
  healTarget: Entity;
} {
  const sim = new Sim({ seed: WORLD_SEED, playerClass: 'shaman', noPlayer: true }) as AnySim;
  const nukers: Entity[] = [];
  const healers: Entity[] = [];
  const half = Math.floor(count / 2);
  for (let i = 0; i < half; i++) {
    const pid = sim.addPlayer('shaman', `Nuker${i}`);
    sim.setPlayerLevel(18, pid);
    const p = sim.entities.get(pid);
    if (!p) continue;
    p.pos.x = CLUSTER.x + (i % 20) * 0.4;
    p.pos.z = CLUSTER.z + Math.floor(i / 20) * 0.4;
    p.prevPos = { ...p.pos };
    nukers.push(p);
  }
  for (let i = 0; i < count - half; i++) {
    const pid = sim.addPlayer('priest', `Healer${i}`);
    sim.setPlayerLevel(18, pid);
    const p = sim.entities.get(pid);
    if (!p) continue;
    p.pos.x = CLUSTER.x + 10 + (i % 20) * 0.4;
    p.pos.z = CLUSTER.z + Math.floor(i / 20) * 0.4;
    p.prevPos = { ...p.pos };
    healers.push(p);
  }

  const template = MOBS.forest_wolf;
  const mobTarget = createMob(sim.nextId++, template, template.maxLevel, {
    x: CLUSTER.x,
    y: 0,
    z: CLUSTER.z,
  });
  mobTarget.maxHp = 50_000_000;
  mobTarget.hp = mobTarget.maxHp;
  sim.addEntity(mobTarget);

  const healPid = sim.addPlayer('warrior', 'DummyTank');
  const healTarget = sim.entities.get(healPid);
  if (!healTarget) throw new Error('missing heal target');
  healTarget.pos.x = CLUSTER.x + 10;
  healTarget.pos.z = CLUSTER.z;
  healTarget.maxHp = 50_000_000;
  healTarget.hp = healTarget.maxHp;

  return { sim, nukers, healers, mobTarget, healTarget };
}

// One "pulse" = every nuker casts an instant direct-damage nuke at the shared mob
// target and every healer casts an instant hot at the shared heal target, all in
// the same simulated instant (the shape of a raid's alpha strike / heal-check).
function castPulse(
  sim: AnySim,
  nukers: Entity[],
  healers: Entity[],
  mobTarget: Entity,
  healTarget: Entity,
): void {
  sim.targetEntity(mobTarget.id, undefined);
  for (const n of nukers) {
    n.cooldowns.clear();
    n.resource = n.maxResource;
    sim.targetEntity(mobTarget.id, n.id);
    sim.castAbility('earth_shock', n.id);
  }
  for (const h of healers) {
    h.cooldowns.clear();
    h.resource = h.maxResource;
    sim.targetEntity(healTarget.id, h.id);
    sim.castAbility('renew', h.id);
  }
}

function measurePulseMedian(count: number): number {
  const { sim, nukers, healers, mobTarget, healTarget } = buildCastingRaid(count);
  for (let i = 0; i < 10; i++) castPulse(sim, nukers, healers, mobTarget, healTarget);

  const MEASURE = 50;
  const samples: number[] = [];
  for (let i = 0; i < MEASURE; i++) {
    const t0 = performance.now();
    castPulse(sim, nukers, healers, mobTarget, healTarget);
    samples.push(performance.now() - t0);
  }
  samples.sort((a, b) => a - b);
  return samples[Math.floor(samples.length / 2)];
}

describe('runEffects (ability effect dispatch) high-load regression budget', () => {
  it('bounds a mixed-effect-type simultaneous cast pulse at a fixed population', () => {
    const CASTERS = 160;
    const median = measurePulseMedian(CASTERS);

    console.log(`[runEffects perf] casters=${CASTERS} median=${median.toFixed(2)}ms`);

    // Generous by design (see mob_update_perf.test.ts / aura_tick_perf.test.ts):
    // 30ms leaves ample headroom for slow/contended CI hardware under one 20 Hz
    // tick (50ms) while still catching a sustained order-of-magnitude regression.
    expect(median).toBeLessThan(30);
  }, 60_000);

  it('doubling the caster count does not more than roughly double the pulse cost', () => {
    const SMALL = 80;
    const LARGE = SMALL * 2;

    const smallMedian = measurePulseMedian(SMALL);
    const largeMedian = measurePulseMedian(LARGE);

    console.log(
      `[runEffects perf] scaling small=${SMALL}(${smallMedian.toFixed(2)}ms) ` +
        `large=${LARGE}(${largeMedian.toFixed(2)}ms) ratio=${(largeMedian / Math.max(smallMedian, 0.001)).toFixed(2)}x`,
    );

    expect(largeMedian).toBeLessThan(Math.max(smallMedian * 3.5, 5));
  }, 60_000);

  it('dispatches real damage and heal effects every pulse (shape sanity)', () => {
    const CASTERS = 100;
    const { sim, nukers, healers, mobTarget, healTarget } = buildCastingRaid(CASTERS);

    const hpBefore = mobTarget.hp;

    sim.drainEvents();
    sim.targetEntity(mobTarget.id, undefined);
    for (const n of nukers) {
      n.cooldowns.clear();
      n.resource = n.maxResource;
      sim.targetEntity(mobTarget.id, n.id);
      sim.castAbility('earth_shock', n.id);
    }
    for (const h of healers) {
      h.cooldowns.clear();
      h.resource = h.maxResource;
      sim.targetEntity(healTarget.id, h.id);
      sim.castAbility('renew', h.id);
    }
    // Renew (a hot effect) applies its aura synchronously inside runEffects, so
    // its evidence is in the event stream from the casts above. earth_shock's
    // direct-damage effect instead resolves via a scheduled projectile
    // (combat/effect_dispatch.ts's scheduleProjectile), so a few ticks let every
    // in-flight nuke land before checking the mob took real damage.
    const castEvents = sim.drainEvents() as SimEvent[];
    const auraEvents = castEvents.filter((ev) => ev.type === 'aura' && ev.gained).length;
    let damageEvents = 0;
    for (let i = 0; i < 10; i++) {
      for (const ev of sim.tick()) if (ev.type === 'damage') damageEvents++;
    }

    console.log(
      `[runEffects perf] shape casters=${CASTERS} nukers=${nukers.length} ` +
        `healers=${healers.length} mobHpDrop=${hpBefore - mobTarget.hp} auraEvents=${auraEvents}`,
    );

    // Shape sanity: we actually built and fired a mixed-effect raid pulse, not an
    // empty or degenerate scenario. The nuke pulse dealt real damage to the mob
    // (once its scheduled projectiles land); the renew pulse applied real hot
    // auras (both nukers and healers populated).
    expect(nukers.length).toBeGreaterThan(0);
    expect(healers.length).toBeGreaterThan(0);
    expect(mobTarget.hp).toBeLessThan(hpBefore);
    expect(auraEvents).toBeGreaterThanOrEqual(healers.length);
    expect(damageEvents).toBeGreaterThan(0);
  }, 60_000);
});
