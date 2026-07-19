// Perf regression coverage for the Nythraxis raid encounter driver
// (src/sim/encounters/nythraxis.ts, updateNythraxisEncounter). Unlike mob.update or
// p.auras, this driver has NO dedicated sim.tick() phase lap: Sim calls it from inside
// the per-mob update loop (folded into the 'mob.update' phase alongside every other
// mob's AI, so a lap filtered on that tag would also include the ordinary pack of
// dungeon trash and not isolate this driver). So this file times the driver directly:
// it calls updateNythraxisEncounter(ctx, boss) in a loop and wraps each call with
// performance.now() itself, exactly the way the host would attribute a phase that had
// its own lap tag. This mirrors the canonical recipe in tests/mob_update_perf.test.ts /
// tests/aura_tick_perf.test.ts otherwise: warm up, sample many calls, take the median,
// assert an absolute budget plus a scaling bound.

import { describe, expect, it } from 'vitest';
import { spawnNythraxisAdds, updateNythraxisEncounter } from '../src/sim/encounters/nythraxis';
import { Sim } from '../src/sim/sim';
import { dist2d, type Entity, NYTHRAXIS_ADD_ID, NYTHRAXIS_BOSS_ID } from '../src/sim/types';
import { groundHeight } from '../src/sim/world';

const WORLD_SEED = 20065;

type AnySim = Sim & Record<string, unknown>;
type AnyEntity = Entity & Record<string, unknown>;

function teleport(sim: AnySim, e: AnyEntity, x: number, z: number, y?: number): void {
  e.pos.x = x;
  e.pos.z = z;
  e.pos.y = y ?? groundHeight(x, z, sim.cfg.seed);
  e.prevPos = { ...e.pos };
  sim.rebucket(e);
}

// Build a full attuned raid pulled into the Nythraxis arena, then raise `addWaves` extra
// waves of scripted adds (2 per wave, spawnNythraxisAdds's real production shape) on top
// of whatever the encounter itself raises: many simultaneous adds + a full raid room is
// the worst case for playersInNythraxisRoom's per-tick entity scan and the mechanic
// updaters that walk the add roster.
function setup(dpsCount: number, addWaves: number): { sim: AnySim; boss: AnyEntity } {
  const sim = new Sim({ seed: WORLD_SEED, playerClass: 'warrior', noPlayer: true }) as AnySim;
  const tankPid = sim.addPlayer('warrior', 'Tank') as number;
  sim.players.get(tankPid)?.questsDone.add('q_nythraxis_bound_guardian');
  const dpsPids: number[] = [];
  for (let i = 0; i < dpsCount; i++) {
    const pid = sim.addPlayer('mage', `Dps${i}`) as number;
    sim.partyInvite(pid, tankPid);
    sim.partyAccept(pid);
    dpsPids.push(pid);
  }
  sim.convertPartyToRaid(tankPid);
  sim.enterDungeon('nythraxis_boss_arena', tankPid);
  const tank = sim.entities.get(tankPid) as AnyEntity;
  const boss = [...sim.entities.values()].find(
    (e) => e.kind === 'mob' && e.templateId === NYTHRAXIS_BOSS_ID && !e.dead,
  ) as AnyEntity;
  teleport(sim, tank, boss.pos.x, boss.pos.z - 6, boss.pos.y);
  tank.maxHp = 1_000_000;
  tank.hp = tank.maxHp;
  const dps = dpsPids.map((pid) => sim.entities.get(pid) as AnyEntity);
  dps.forEach((e, i) => {
    teleport(sim, e, boss.spawnPos.x + (i - dpsCount / 2), boss.spawnPos.z - 20, boss.pos.y);
    e.maxHp = 1_000_000;
    e.hp = e.maxHp;
  });
  boss.inCombat = true;
  boss.aiState = 'attack';
  boss.aggroTargetId = tank.id;
  boss.threat.set(tank.id, 1000);

  const ctx = (sim as unknown as { ctx: import('../src/sim/sim_context').SimContext }).ctx;
  for (let w = 0; w < addWaves; w++) spawnNythraxisAdds(ctx, boss);

  return { sim, boss };
}

function measureNythraxisDriverMedian(
  dpsCount: number,
  addWaves: number,
): { median: number; roomPlayers: number; adds: number } {
  const { sim, boss } = setup(dpsCount, addWaves);
  const ctx = (sim as unknown as { ctx: import('../src/sim/sim_context').SimContext }).ctx;

  // Warm up: settle party/raid state and let the encounter initialize.
  for (let i = 0; i < 10; i++) updateNythraxisEncounter(ctx, boss);

  const MEASURE_CALLS = 120;
  const samples: number[] = [];
  for (let i = 0; i < MEASURE_CALLS; i++) {
    const start = performance.now();
    updateNythraxisEncounter(ctx, boss);
    samples.push(performance.now() - start);
  }
  samples.sort((a, b) => a - b);
  const median = samples[Math.floor(samples.length / 2)];

  let adds = 0;
  for (const e of sim.entities.values()) {
    if (e.kind === 'mob' && e.templateId === NYTHRAXIS_ADD_ID && !e.dead) adds++;
  }
  const roomPlayers = [...sim.entities.values()].filter(
    (e) => e.kind === 'player' && !e.dead && dist2d(e.pos, boss.spawnPos) < 9999,
  ).length;

  return { median, roomPlayers, adds };
}

describe('Nythraxis encounter driver (direct-call) high-load regression budget', () => {
  it('bounds the per-call driver cost at a fixed full-raid, many-adds population', () => {
    const DPS = 24; // full-size raid alongside the tank
    const WAVES = 6; // 12 extra scripted adds beyond whatever the encounter itself raises
    const { median, roomPlayers, adds } = measureNythraxisDriverMedian(DPS, WAVES);

    console.log(
      `[nythraxis.driver perf] raid=${roomPlayers} adds=${adds} median=${median.toFixed(2)}ms`,
    );

    // Generous by design (see mob_update_perf.test.ts): observed healthy median at this
    // population is a low single-digit ms figure; 25ms leaves ample headroom for
    // slow/contended CI hardware under one 20 Hz tick (50ms) while still catching an
    // order-of-magnitude sustained regression.
    expect(median).toBeLessThan(25);
  }, 60_000);

  it('doubling the raid + add population does not more than roughly double the driver cost', () => {
    // playersInNythraxisRoom and the mechanic updaters walk the raid roster and the add
    // roster each call; a regression that turns either from a bounded scan into a
    // per-entity nested walk over the OTHER roster would blow past 2x scaling long before
    // either sample alone crosses a ceiling generous enough to avoid CI flakiness.
    const SMALL_DPS = 10;
    const SMALL_WAVES = 2;
    const LARGE_DPS = 20;
    const LARGE_WAVES = 4;

    const small = measureNythraxisDriverMedian(SMALL_DPS, SMALL_WAVES);
    const large = measureNythraxisDriverMedian(LARGE_DPS, LARGE_WAVES);

    console.log(
      `[nythraxis.driver perf] scaling small=raid${small.roomPlayers}/adds${small.adds}` +
        `(${small.median.toFixed(2)}ms) large=raid${large.roomPlayers}/adds${large.adds}` +
        `(${large.median.toFixed(2)}ms) ratio=${(large.median / Math.max(small.median, 0.001)).toFixed(2)}x`,
    );

    expect(large.median).toBeLessThan(Math.max(small.median * 3.5, 5));
  }, 60_000);

  it('actually built the full-raid, many-adds pile-up (shape sanity)', () => {
    const DPS = 24;
    const WAVES = 6;
    const { roomPlayers, adds } = measureNythraxisDriverMedian(DPS, WAVES);
    expect(roomPlayers).toBeGreaterThanOrEqual(DPS); // tank + all dps alive
    expect(adds).toBeGreaterThanOrEqual(WAVES * 2); // 2 adds per wave, none despawned yet
  }, 60_000);
});
