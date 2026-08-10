// Focused unit test for the extracted module src/sim/combat/chain_heal.ts, calling
// runChainHeal directly against a minimal Sim/Entity fixture (the real Sim's ctx IS
// a SimContext) with a synthetic chainHeal effect, so hop SELECTION and per-hop
// falloff are pinned independent of ability resolution / talent-scaling machinery.
// The existing end-to-end tests/chain_heal.test.ts (which drives the same logic
// through the full castAbility -> runEffects path) is left unchanged and still
// covers the ability-integration surface; this file proves the effect_dispatch.ts
// extraction moved the logic verbatim.

import { describe, expect, it } from 'vitest';
import { runChainHeal } from '../src/sim/combat/chain_heal';
import { MOBS } from '../src/sim/data';
import { createMob } from '../src/sim/entity';
import { Sim } from '../src/sim/sim';
import type { AbilityEffect, Entity, SimEvent } from '../src/sim/types';
import { groundHeight } from '../src/sim/world';

const CHAIN_HEAL_EFFECT: Extract<AbilityEffect, { type: 'chainHeal' }> = {
  type: 'chainHeal',
  min: 100,
  max: 100,
  jumps: 2,
  falloff: 0.5,
  radius: 15,
};

function place(sim: Sim, e: Entity, x: number, z: number): void {
  e.pos = { x, y: groundHeight(x, z, sim.cfg.seed), z };
  e.prevPos = { ...e.pos };
  (sim as unknown as { rebucket(entity: Entity): void }).rebucket(e);
}

// A minimal fixture: a caster and three allies strung out in a line (near within
// jump range of the caster's cast target, mid within one jump of near, far well
// past every jump), each hurt to a distinct hp fraction. spellPower is zeroed on
// every entity so the base heal roll is exactly eff.min/eff.max (no spell-power
// rider to account for): this suite is about hop selection and falloff, the
// spell-power math itself is covered by tests/spell_scaling.test.ts.
function makeFixture() {
  const sim = new Sim({ seed: 11, playerClass: 'shaman', noPlayer: true });
  const casterId = sim.addPlayer('shaman', 'Caster');
  const nearId = sim.addPlayer('warrior', 'Near');
  const midId = sim.addPlayer('priest', 'Mid');
  const farId = sim.addPlayer('mage', 'Far');
  const caster = sim.entities.get(casterId);
  const near = sim.entities.get(nearId);
  const mid = sim.entities.get(midId);
  const far = sim.entities.get(farId);
  if (!caster || !near || !mid || !far) throw new Error('missing fixture entity');
  for (const e of [caster, near, mid, far]) e.spellPower = 0;
  place(sim, caster, 0, 0);
  place(sim, near, 4, 0);
  place(sim, mid, 12, 0);
  place(sim, far, 60, 0);
  for (const e of [caster, near, mid, far]) e.maxHp = 10_000;
  near.hp = 5_000; // 50%
  mid.hp = 3_000; // 30%
  far.hp = 2_000; // 20%, but well out of jump range of every hop
  caster.hp = caster.maxHp;
  return { sim, caster, near, mid, far };
}

type BeamEv = Extract<SimEvent, { type: 'spellfx' }>;

function beams(events: SimEvent[]): BeamEv[] {
  return events.filter((e): e is BeamEv => e.type === 'spellfx' && e.fx === 'chainHeal');
}

describe('runChainHeal (extracted module)', () => {
  it('arcs caster-target -> most injured ally in range -> next, one beam per hop, no repeats', () => {
    const { sim, caster, near, mid, far } = makeFixture();
    runChainHeal(
      sim.ctx,
      caster,
      near,
      CHAIN_HEAL_EFFECT,
      'chain_heal',
      'Chain Heal',
      'nature',
      0,
      1,
    );
    const hops = beams(sim.drainEvents());
    expect(hops.map((b) => [b.sourceId, b.targetId])).toEqual([
      [caster.id, near.id],
      [near.id, mid.id],
      [mid.id, caster.id],
    ]);
    expect(hops.every((b) => b.school === 'nature' && b.ability === 'chain_heal')).toBe(true);
    expect(far.hp).toBe(2_000); // never touched: out of jump range from every hop
  });

  it('applies eff.falloff ** i to ONE shared base roll per hop (exact with eff.min === eff.max)', () => {
    const { sim, caster, near, mid } = makeFixture();
    runChainHeal(
      sim.ctx,
      caster,
      near,
      CHAIN_HEAL_EFFECT,
      'chain_heal',
      'Chain Heal',
      'nature',
      0,
      1,
    );
    // hop 0 (near): base * 0.5**0 = 100.
    expect(near.hp).toBe(5_100);
    // hop 1 (mid): base * 0.5**1 = 50.
    expect(mid.hp).toBe(3_050);
    // hop 2: the caster is the only remaining ally in range of mid's position, but
    // it is already at full hp, so its base * 0.5**2 = 25 hop is a pure overheal
    // (applyHeal clamps at maxHp).
    expect(caster.hp).toBe(caster.maxHp);
  });

  it('never selects a hostile mob even when it is the nearest, lowest-hp entity in range', () => {
    const { sim, caster, near } = makeFixture();
    const mob = createMob(9800, MOBS.training_dummy, 1, {
      x: near.pos.x + 2,
      y: near.pos.y,
      z: near.pos.z,
    });
    mob.hostile = true;
    mob.maxHp = 1000;
    mob.hp = 1; // far more "injured" than any ally: would win the pick if eligible
    (sim as unknown as { addEntity(e: Entity): void }).addEntity(mob);
    runChainHeal(
      sim.ctx,
      caster,
      near,
      CHAIN_HEAL_EFFECT,
      'chain_heal',
      'Chain Heal',
      'nature',
      0,
      1,
    );
    expect(mob.hp).toBe(1); // never healed, never joins the chain
  });

  it('is deterministic: same seed and inputs replay to the identical chain and hp deltas', () => {
    const run = () => {
      const { sim, caster, near, mid } = makeFixture();
      runChainHeal(
        sim.ctx,
        caster,
        near,
        CHAIN_HEAL_EFFECT,
        'chain_heal',
        'Chain Heal',
        'nature',
        0,
        1,
      );
      const hops = beams(sim.drainEvents()).map((b) => [b.sourceId, b.targetId]);
      return { hops, nearHp: near.hp, midHp: mid.hp, casterHp: caster.hp };
    };
    expect(run()).toEqual(run());
  });
});
