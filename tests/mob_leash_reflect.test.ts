// Regression: passive/reflected/periodic damage must NOT refresh a mob's leash
// anchor — only a direct attack (auto-attack or direct spell) may walk the tether.
//
// Repro: a Shaman with Lightning Shield (modelled as a `thorns` aura) is meleed by
// a mob. The reflect deals damage back to the mob via dealDamage(player, mob, ...).
// Before the fix that reflect refreshed the mob's leashAnchor every swing, so the
// mob could be dragged unlimited distance from home and never evade. The mob should
// instead leash (evade) once dragged past LEASH_DISTANCE, since reflect damage is
// not a direct attack.

import { describe, expect, it } from 'vitest';
import { MOBS } from '../src/sim/data';
import { createMob } from '../src/sim/entity';
import { Sim } from '../src/sim/sim';
import { LEASH_DISTANCE } from '../src/sim/types';
import { terrainHeight } from '../src/sim/world';

const makeSim = () => new Sim({ seed: 42, playerClass: 'shaman', autoEquip: true });

function aggroedMob(sim: Sim): any {
  const seed = (sim as any).cfg.seed;
  const pos = { x: 200, y: terrainHeight(200, 200, seed), z: 200 };
  const mob = createMob(900100, MOBS.forest_wolf, 5, pos) as any;
  (sim as any).addEntity(mob);
  mob.aiState = 'chase';
  mob.aggroTargetId = sim.player.id;
  mob.inCombat = true;
  mob.leashAnchor = { ...mob.pos };
  return mob;
}

describe('mob leash: only direct damage refreshes the anchor', () => {
  it('a direct hit walks the leash anchor to the mob position', () => {
    const sim = makeSim();
    const mob = aggroedMob(sim);
    mob.pos = { x: mob.pos.x + 5, y: mob.pos.y, z: mob.pos.z };
    (sim as any).dealDamage(sim.player, mob, 10, false, 'physical', 'Lightning Bolt', 'hit');
    expect(mob.leashAnchor.x).toBeCloseTo(mob.pos.x);
    expect(mob.leashAnchor.z).toBeCloseTo(mob.pos.z);
  });

  it('reflected (indirect) damage leaves the leash anchor where it was', () => {
    const sim = makeSim();
    const mob = aggroedMob(sim);
    const anchorBefore = { ...mob.leashAnchor };
    mob.pos = { x: mob.pos.x + 5, y: mob.pos.y, z: mob.pos.z };
    // Lightning Shield reflect: player-sourced, but not a direct attack.
    (sim as any).dealDamage(
      sim.player,
      mob,
      10,
      false,
      'nature',
      'Lightning Shield',
      'hit',
      true,
      undefined,
      false, // direct = false
    );
    expect(mob.leashAnchor.x).toBeCloseTo(anchorBefore.x);
    expect(mob.leashAnchor.z).toBeCloseTo(anchorBefore.z);
  });

  it('a real mob swing into Lightning Shield does NOT walk the leash anchor', () => {
    // Drives the actual mobSwing reflect path (mob/mob_swing.ts), the route that
    // fires when a mob melees a shielded Shaman — the reported repro.
    const sim = makeSim();
    const mob = aggroedMob(sim);
    mob.maxHp = 1_000_000;
    mob.hp = mob.maxHp;
    sim.player.maxHp = 1_000_000;
    sim.player.hp = sim.player.maxHp;
    // Move the mob away from its anchor so a (buggy) refresh would be detectable:
    // anchor stays at the spawn while the mob body is 60yd off (past LEASH_DISTANCE).
    const anchorBefore = { ...mob.leashAnchor };
    mob.pos = { x: mob.pos.x + 60, y: mob.pos.y, z: mob.pos.z };
    sim.player.pos = { x: mob.pos.x + 1, y: mob.pos.y, z: mob.pos.z };
    sim.player.auras.push({
      id: 'lshield',
      name: 'Lightning Shield',
      kind: 'thorns',
      remaining: 600,
      duration: 600,
      value: 13,
      sourceId: sim.player.id,
      school: 'nature',
    });
    const hpBefore = mob.hp;
    // Swing many times; misses/dodges are fine, we only need reflects to land.
    for (let i = 0; i < 200; i++) (sim as any).mobSwing(mob, sim.player);
    expect(mob.hp).toBeLessThan(hpBefore); // reflect actually connected
    expect(mob.leashAnchor.x).toBeCloseTo(anchorBefore.x);
    expect(mob.leashAnchor.z).toBeCloseTo(anchorBefore.z);
  });
});

function dist(a: { x: number; z: number }, b: { x: number; z: number }): number {
  return Math.hypot(a.x - b.x, a.z - b.z);
}
