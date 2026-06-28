// Unit + integration coverage for the deferred-projectile leaf (src/sim/projectile_travel.ts)
// and the end-to-end behavior it produces: a ranged spell's damage now lands when the
// bolt arrives, not on the cast tick, and fizzles if the target dies mid-flight.

import { describe, expect, it } from 'vitest';
import {
  drainPendingProjectiles,
  PROJECTILE_MAX_TRAVEL,
  PROJECTILE_SPEED,
  projectileTravelTime,
  scheduleProjectile,
} from '../src/sim/projectile_travel';
import { Sim } from '../src/sim/sim';
import { terrainHeight } from '../src/sim/world';

describe('projectileTravelTime (pure)', () => {
  it('is distance / speed in the normal range', () => {
    expect(projectileTravelTime(26)).toBeCloseTo(1, 10);
    expect(projectileTravelTime(13)).toBeCloseTo(0.5, 10);
    expect(projectileTravelTime(52, 52)).toBeCloseTo(1, 10);
  });

  it('lands immediately for a non-positive distance or speed', () => {
    expect(projectileTravelTime(0)).toBe(0);
    expect(projectileTravelTime(-5)).toBe(0);
    expect(projectileTravelTime(10, 0)).toBe(0);
  });

  it('clamps an extreme distance to the max flight time', () => {
    expect(projectileTravelTime(10_000)).toBe(PROJECTILE_MAX_TRAVEL);
  });

  it('is deterministic: same inputs, same output', () => {
    expect(projectileTravelTime(31, PROJECTILE_SPEED)).toBe(
      projectileTravelTime(31, PROJECTILE_SPEED),
    );
  });
});

// Minimal fake SimContext for the scheduling/drain integration: only the members the
// two functions touch (time, entities, pendingProjectiles).
function fakeCtx(time: number) {
  const entities = new Map<number, any>();
  return {
    time,
    entities,
    pendingProjectiles: [] as any[],
  };
}

function ent(id: number, x: number, z: number): any {
  return { id, dead: false, pos: { x, y: 0, z } };
}

describe('scheduleProjectile + drainPendingProjectiles', () => {
  it('resolves a projectile only once its flight has elapsed', () => {
    const ctx = fakeCtx(0);
    const src = ent(1, 0, 0);
    const tgt = ent(2, 0, 26); // 26 yd => exactly 1s of flight
    ctx.entities.set(1, src);
    ctx.entities.set(2, tgt);
    let landed = 0;
    scheduleProjectile(ctx as any, src, tgt, () => {
      landed++;
    });
    expect(ctx.pendingProjectiles[0].at).toBeCloseTo(1, 10);

    ctx.time = 0.5;
    drainPendingProjectiles(ctx as any);
    expect(landed).toBe(0); // still in flight
    expect(ctx.pendingProjectiles.length).toBe(1);

    ctx.time = 1;
    drainPendingProjectiles(ctx as any);
    expect(landed).toBe(1); // arrived
    expect(ctx.pendingProjectiles.length).toBe(0);
  });

  it('fizzles a projectile whose target died mid-flight (no resolve)', () => {
    const ctx = fakeCtx(0);
    const src = ent(1, 0, 0);
    const tgt = ent(2, 0, 26);
    ctx.entities.set(1, src);
    ctx.entities.set(2, tgt);
    let landed = 0;
    scheduleProjectile(ctx as any, src, tgt, () => {
      landed++;
    });
    tgt.dead = true; // dies before impact
    ctx.time = 1;
    drainPendingProjectiles(ctx as any);
    expect(landed).toBe(0);
    expect(ctx.pendingProjectiles.length).toBe(0);
  });

  it('fizzles when the target despawned before impact', () => {
    const ctx = fakeCtx(0);
    const src = ent(1, 0, 0);
    const tgt = ent(2, 0, 26);
    ctx.entities.set(1, src);
    ctx.entities.set(2, tgt);
    let landed = 0;
    scheduleProjectile(ctx as any, src, tgt, () => {
      landed++;
    });
    ctx.entities.delete(2); // gone
    ctx.time = 1;
    drainPendingProjectiles(ctx as any);
    expect(landed).toBe(0);
  });
});

// End-to-end: drive a real Sim and assert a mage Fire Blast (an INSTANT projectile
// spell, so no cast-time pushback to muddy the timing) deals NO damage on the tick it
// is cast and SOME damage a few ticks later, when the bolt actually lands.
function place(sim: Sim, e: any, x: number, z: number) {
  e.pos.x = x;
  e.pos.z = z;
  e.pos.y = terrainHeight(x, z, sim.cfg.seed);
  e.prevPos = { ...e.pos };
}

describe('deferred projectile damage end-to-end (mage Fire Blast)', () => {
  function castBlastAndTrack(seed: number) {
    const sim = new Sim({ seed, playerClass: 'mage', autoEquip: true });
    sim.setPlayerLevel(20);
    const p = sim.player;
    p.hp = p.maxHp;
    p.resource = p.maxResource;
    let target: any = null;
    for (const e of (sim as any).entities.values()) {
      if (e.kind === 'mob' && !e.dead) {
        target = e;
        break;
      }
    }
    expect(target).toBeTruthy();
    place(sim, p, p.pos.x, p.pos.z);
    place(sim, target, p.pos.x, p.pos.z + 18); // ~18 yd => ~0.69s flight (~14 ticks)
    target.hp = target.maxHp = 100000; // a fat dummy: one bolt can't kill it
    p.facing = Math.atan2(target.pos.x - p.pos.x, target.pos.z - p.pos.z);
    sim.player.targetId = target.id;

    const startHp = target.hp;
    (sim as any).castAbility('fire_blast'); // instant: schedules the bolt this tick

    let hpOneTickLater = startHp;
    let landedAtTick = -1;
    for (let i = 0; i < 20 * 3; i++) {
      sim.tick();
      if (i === 0) hpOneTickLater = target.hp; // still in flight one tick after the cast
      if (target.hp < startHp && landedAtTick < 0) landedAtTick = i;
    }
    return { startHp, hpOneTickLater, finalHp: target.hp, landedAtTick };
  }

  it('does not apply damage the instant it is cast, but lands it a few ticks later', () => {
    const r = castBlastAndTrack(7);
    // The bolt is still in flight one tick after the cast: no damage yet.
    expect(r.hpOneTickLater).toBe(r.startHp);
    // It lands within the flight window and deals real damage.
    expect(r.finalHp).toBeLessThan(r.startHp);
    // ~18 yd at 26 yd/s is ~14 ticks of flight, not an instant (tick 0) hit.
    expect(r.landedAtTick).toBeGreaterThan(2);
  });

  it('is deterministic: same seed, same landing and damage', () => {
    const a = castBlastAndTrack(7);
    const b = castBlastAndTrack(7);
    expect(a).toEqual(b);
  });
});
