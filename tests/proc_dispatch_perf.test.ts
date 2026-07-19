import { describe, expect, it } from 'vitest';
import { runWeaponProcs } from '../src/sim/combat/equip_procs';
import { applySetProcs } from '../src/sim/combat/set_procs';
import { aggregateSetBonuses, SET_DEATHLORD } from '../src/sim/content/item_sets';
import { MOBS } from '../src/sim/data';
import { createMob } from '../src/sim/entity';
import { Sim } from '../src/sim/sim';
import type { Entity } from '../src/sim/types';

// Regression coverage for the proc-trigger systems (combat/equip_procs.ts
// runWeaponProcs, combat/set_procs.ts applySetProcs): every equipped-weapon
// legendary proc roll and every worn set-bonus proc roll, the fan-out that fires
// on each melee swing/cast for a fully-decked-out raid. Neither is
// tick-phase-lapped on its own (both are nested inside meleeSwing/applyHeal/
// casting-lifecycle call sites), so this file drives them DIRECTLY through the
// real SimContext (`sim.ctx`), the same seam runWeaponProcs/applySetProcs are
// unit-tested against elsewhere, at raid scale with every player carrying a full
// legendary weapon AND a complete 4-piece set (the worst-case proc-roll load: two
// separate roll passes per swing, on top of the effects a landed proc fires).

const WORLD_SEED = 20066;
const CLUSTER = { x: -30, z: 30 };

type AnySim = Sim & Record<string, any>;

// Every player wields the Thronebane legendary (a 'weaponHit' chain-arc proc) and
// wears a full Deathlord 4-piece (a 'weaponCrit' bleed proc): the "every hit rolls
// two procs" loadout a min-maxed raid represents.
function buildProcRaid(count: number): { sim: AnySim; players: Entity[]; boss: Entity } {
  const sim = new Sim({ seed: WORLD_SEED, playerClass: 'warrior', noPlayer: true }) as AnySim;
  const players: Entity[] = [];
  const deathlordProcs = aggregateSetBonuses(new Map([[SET_DEATHLORD, 4]])).procs;
  for (let i = 0; i < count; i++) {
    const pid = sim.addPlayer('warrior', `Geared${i}`);
    const p = sim.entities.get(pid);
    if (!p) continue;
    p.pos.x = CLUSTER.x + (i % 20) * 0.4;
    p.pos.z = CLUSTER.z + Math.floor(i / 20) * 0.4;
    p.prevPos = { ...p.pos };
    p.mainhandItemId = 'kingsbane_last_oath';
    p.setProcs = deathlordProcs;
    p.procReadyAt = {};
    players.push(p);
  }

  const template = MOBS.forest_wolf;
  const boss = createMob(sim.nextId++, template, template.maxLevel, { ...CLUSTER, y: 0 });
  boss.maxHp = 500_000_000;
  boss.hp = boss.maxHp;
  sim.addEntity(boss);

  return { sim, players, boss };
}

// One "swing wave" = every geared player lands one weapon hit and one weapon
// crit against the shared boss target, rolling both proc systems for every
// player in the same instant (the shape of a raid's simultaneous swing timers
// lining up mid-fight).
function swingWave(sim: AnySim, players: Entity[], boss: Entity): void {
  for (const p of players) {
    runWeaponProcs(sim.ctx, p, boss, 'weaponHit');
    applySetProcs(sim.ctx, p, boss, 'weaponCrit');
  }
}

function measureWaveMedian(count: number): number {
  const { sim, players, boss } = buildProcRaid(count);
  for (let i = 0; i < 10; i++) swingWave(sim, players, boss);

  const MEASURE = 60;
  const samples: number[] = [];
  for (let i = 0; i < MEASURE; i++) {
    const t0 = performance.now();
    swingWave(sim, players, boss);
    samples.push(performance.now() - t0);
  }
  samples.sort((a, b) => a - b);
  return samples[Math.floor(samples.length / 2)];
}

describe('runWeaponProcs/applySetProcs high-load regression budget', () => {
  it('bounds a fully-geared raid swing wave at a fixed population', () => {
    const PLAYERS = 200;
    const median = measureWaveMedian(PLAYERS);

    console.log(`[proc dispatch perf] players=${PLAYERS} median=${median.toFixed(2)}ms`);

    // Generous by design (see mob_update_perf.test.ts / aura_tick_perf.test.ts):
    // 25ms leaves ample headroom for slow/contended CI hardware under one 20 Hz
    // tick (50ms) while still catching a sustained order-of-magnitude regression.
    expect(median).toBeLessThan(25);
  }, 60_000);

  it('doubling the geared population does not more than roughly double the wave cost', () => {
    const SMALL = 100;
    const LARGE = SMALL * 2;

    const smallMedian = measureWaveMedian(SMALL);
    const largeMedian = measureWaveMedian(LARGE);

    console.log(
      `[proc dispatch perf] scaling small=${SMALL}(${smallMedian.toFixed(2)}ms) ` +
        `large=${LARGE}(${largeMedian.toFixed(2)}ms) ratio=${(largeMedian / Math.max(smallMedian, 0.001)).toFixed(2)}x`,
    );

    expect(largeMedian).toBeLessThan(Math.max(smallMedian * 3.5, 5));
  }, 60_000);

  it('actually fires real procs across the raid, not a vacuous no-proc scenario', () => {
    const PLAYERS = 300;
    const { sim, players, boss } = buildProcRaid(PLAYERS);

    // Loadout shape sanity FIRST: every player really carries the legendary +
    // full set (not an empty or partially-built loadout). Checked before any
    // wave runs, since a landed proc's aura can trigger a stat recalc that
    // re-mirrors Entity.mainhandItemId off meta.equipment (untouched here, so
    // it would read back the default weapon after the fact even though the
    // proc roll itself used the legendary correctly on every prior wave).
    for (const p of players) {
      expect(p.mainhandItemId).toBe('kingsbane_last_oath');
      expect(p.setProcs.length).toBeGreaterThan(0);
    }

    // At PLAYERS=300 with a 0.1 weaponHit chance and a 0.1 weaponCrit-set chance,
    // even a single wave should land dozens of procs; run several waves so the
    // count is robust against roll variance while staying deterministic (the
    // fixed WORLD_SEED rng stream).
    let auraGains = 0;
    for (let i = 0; i < 10; i++) {
      sim.drainEvents();
      swingWave(sim, players, boss);
      for (const ev of sim.drainEvents()) {
        if (ev.type === 'aura' && ev.gained) auraGains++;
      }
    }

    console.log(`[proc dispatch perf] shape players=${PLAYERS} auraGainEvents=${auraGains}`);

    expect(auraGains).toBeGreaterThan(0);
  }, 60_000);
});
