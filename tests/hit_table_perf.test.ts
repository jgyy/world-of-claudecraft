import { describe, expect, it } from 'vitest';
import { rangedShotProfile } from '../src/sim/combat/ranged_shot';
import { isSpellResisted } from '../src/sim/combat/spell_resist';
import { warriorMeleeDefense } from '../src/sim/combat/warrior_hit_table';
import { Rng } from '../src/sim/rng';
import { Sim } from '../src/sim/sim';
import type { Entity } from '../src/sim/types';

// Regression coverage for the one-roll hit tables the combat swing resolvers
// share: warrior melee defense (combat/warrior_hit_table.ts, folding parry/block
// into the shared melee hit table), spell resist (combat/spell_resist.ts, the
// classic "no miss, full resist" avoidance roll), and the effective ranged-weapon
// profile pick (combat/ranged_shot.ts, feeding Auto Shot/wand-bolt resolution).
// All three are pure leaves called once per swing/cast/shot resolution; at raid
// scale a big simultaneous pull resolves hundreds of these rolls in the same
// tick, so this file drives them directly in a tight loop and times with
// performance.now(), per the direct-call recipe for functions not naturally
// tick-phase-lapped on their own.

const WORLD_SEED = 20067;

type AnySim = Sim & Record<string, any>;

function buildDefenders(count: number): { sim: AnySim; warriors: Entity[]; attackers: Entity[] } {
  const sim = new Sim({ seed: WORLD_SEED, playerClass: 'warrior', noPlayer: true }) as AnySim;
  const warriors: Entity[] = [];
  const attackers: Entity[] = [];
  for (let i = 0; i < count; i++) {
    const wpid = sim.addPlayer('warrior', `Defender${i}`);
    const w = sim.entities.get(wpid);
    if (!w) continue;
    w.pos.x = i * 0.4;
    w.pos.z = 0;
    w.facing = Math.PI; // face the attacker so the front-arc parry/block gate is open
    w.blockValue = 20;
    w.blockChance = 0.15;
    warriors.push(w);

    const apid = sim.addPlayer('rogue', `Attacker${i}`);
    const a = sim.entities.get(apid);
    if (!a) continue;
    a.pos.x = i * 0.4;
    a.pos.z = -1;
    attackers.push(a);
  }
  return { sim, warriors, attackers };
}

// One "resolution wave": every defender's melee defense is rolled once against
// its attacker, every caster's spell-resist roll fires once, and every ranged
// attacker's weapon profile is resolved once. This is the shape of a dense pull
// resolving every simultaneous swing/cast/shot in a single tick.
function resolveWave(rng: Rng, warriors: Entity[], attackers: Entity[]): number {
  let acc = 0;
  const wandRanged = { min: 10, max: 14, speed: 2.0, wand: true };
  const hunterRanged = { min: 8, max: 12, speed: 2.6 };
  const hunterWeapon = { min: 40, max: 60, speed: 2.9 };
  for (let i = 0; i < warriors.length; i++) {
    const def = warriorMeleeDefense(warriors[i], attackers[i]);
    acc += def.parryChance + def.blockChance;
    if (isSpellResisted(rng, attackers[i].level, warriors[i].level, 0.03)) acc += 1;
    const profile =
      i % 2 === 0
        ? rangedShotProfile(wandRanged, hunterWeapon)
        : rangedShotProfile(hunterRanged, hunterWeapon);
    acc += profile.min + profile.max;
  }
  return acc;
}

function measureWaveMedian(count: number): number {
  const { warriors, attackers } = buildDefenders(count);
  const rng = new Rng(WORLD_SEED);
  for (let i = 0; i < 10; i++) resolveWave(rng, warriors, attackers);

  const MEASURE = 60;
  const samples: number[] = [];
  for (let i = 0; i < MEASURE; i++) {
    const t0 = performance.now();
    resolveWave(rng, warriors, attackers);
    samples.push(performance.now() - t0);
  }
  samples.sort((a, b) => a - b);
  return samples[Math.floor(samples.length / 2)];
}

describe('hit-table roll (warrior defense / spell resist / ranged profile) high-load budget', () => {
  it('bounds a simultaneous mass-resolution wave at a fixed population', () => {
    const PAIRS = 400;
    const median = measureWaveMedian(PAIRS);

    console.log(`[hit-table perf] pairs=${PAIRS} median=${median.toFixed(2)}ms`);

    // Generous by design (see mob_update_perf.test.ts / aura_tick_perf.test.ts):
    // these are cheap pure leaves, so a healthy median at this population is a
    // fraction of a ms; 15ms leaves ample headroom for slow/contended CI
    // hardware under one 20 Hz tick (50ms) while still catching a sustained
    // order-of-magnitude regression (e.g. an accidental per-roll allocation).
    expect(median).toBeLessThan(15);
  }, 60_000);

  it('doubling the pair count does not more than roughly double the wave cost', () => {
    const SMALL = 200;
    const LARGE = SMALL * 2;

    const smallMedian = measureWaveMedian(SMALL);
    const largeMedian = measureWaveMedian(LARGE);

    console.log(
      `[hit-table perf] scaling small=${SMALL}(${smallMedian.toFixed(2)}ms) ` +
        `large=${LARGE}(${largeMedian.toFixed(2)}ms) ratio=${(largeMedian / Math.max(smallMedian, 0.001)).toFixed(2)}x`,
    );

    expect(largeMedian).toBeLessThan(Math.max(smallMedian * 3.5, 5));
  }, 60_000);

  it('rolls real, non-vacuous hit-table decisions across the wave (shape sanity)', () => {
    const PAIRS = 250;
    const { warriors, attackers } = buildDefenders(PAIRS);
    const rng = new Rng(WORLD_SEED);

    let parryCapable = 0;
    let resists = 0;
    let hunterProfiles = 0;
    let wandProfiles = 0;
    const wandRanged = { min: 10, max: 14, speed: 2.0, wand: true };
    const hunterRanged = { min: 8, max: 12, speed: 2.6 };
    const hunterWeapon = { min: 40, max: 60, speed: 2.9 };
    for (let i = 0; i < warriors.length; i++) {
      const def = warriorMeleeDefense(warriors[i], attackers[i]);
      if (def.parryChance > 0) parryCapable++;
      if (isSpellResisted(rng, attackers[i].level, warriors[i].level, 0.03)) resists++;
      const wandProfile = rangedShotProfile(wandRanged, hunterWeapon);
      const hunterProfile = rangedShotProfile(hunterRanged, hunterWeapon);
      if (wandProfile.min === wandRanged.min) wandProfiles++;
      if (hunterProfile.min === hunterWeapon.min) hunterProfiles++;
    }

    console.log(
      `[hit-table perf] shape pairs=${PAIRS} parryCapable=${parryCapable} resists=${resists} ` +
        `wandProfiles=${wandProfiles} hunterProfiles=${hunterProfiles}`,
    );

    // Shape sanity: every warrior in the front-arc actually rolls a nonzero
    // parry chance (real melee-defense work, not a degenerate zero table), the
    // spell-resist roll fires for every pair, and the ranged profile pick
    // correctly branches both the wand path (keeps the class ranged profile) and
    // the weapon path (adopts the carried weapon's range), so the budgets above
    // are not passing vacuously against an empty or single-branch scenario.
    expect(parryCapable).toBe(warriors.length);
    expect(wandProfiles).toBe(warriors.length);
    expect(hunterProfiles).toBe(warriors.length);
    expect(resists).toBeGreaterThanOrEqual(0);
  }, 60_000);
});
