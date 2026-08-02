// Issue #1803: a mastery/talent damage/heal percent (global meleeDmgPct/
// spellDmgPct/healPct/dotDmgPct/hotHealPct/absorbPct, or a per-ability dmgPct
// like Frost's +25%) must scale the WHOLE hit (authored base plus the runtime
// weapon/AP/SP rider), not just the authored base. Before the fix, scaleEffect
// (src/sim/content/classes.ts) baked the percent into an ability's base min/
// max/total at precompute time, and the SP/AP/weapon rider was added afterward
// at the damage/heal site (spell_scaling.ts riders, meleeSwing) with no
// multiplier applied at all, so the advertised percentage under-delivered and
// the shortfall grew with gear (more SP/AP meant a larger un-multiplied share
// of the hit).
//
// These tests exercise the fix two ways:
//  - a pure math check (directDamage) proving the resolved rider now scales by
//    the same multiplier as the base, matching the "Frost ability-scoped
//    mastery" example from the issue body;
//  - real Sim end-to-end casts for DoT, HoT, and absorb (all rng-free: none of
//    these effect kinds roll a crit or a hit-table on application, only a
//    deterministic snapshot), proving classes.ts's precompute bake and
//    effect_dispatch.ts's runtime rider now agree end to end.
import { describe, expect, it } from 'vitest';
import { abilitiesKnownAt } from '../src/sim/content/classes';
import {
  accumulateTalentEffect,
  emptyModifiers,
  type TalentModifiers,
} from '../src/sim/content/talents';
import { MOBS } from '../src/sim/data';
import { createMob } from '../src/sim/entity';
import { Sim } from '../src/sim/sim';
import { directHitBonus } from '../src/sim/spell_scaling';
import { resolveTalentHitMult } from '../src/sim/talent_hit_mult';
import type { AbilityEffect, Entity } from '../src/sim/types';

function directDamageEffect(effects: AbilityEffect[]) {
  const found = effects.find((e) => e.type === 'directDamage');
  if (found?.type !== 'directDamage') throw new Error('missing directDamage effect');
  return found;
}

function metaOf(sim: Sim, pid = sim.playerId) {
  const meta = sim.meta(pid);
  if (!meta) throw new Error('missing player meta');
  return meta;
}

// Installs a synthetic TalentModifiers on a fresh Sim's single player, driving
// BOTH the precompute bake (meta.known, via abilitiesKnownAt, same as a real
// respec) and the runtime rider (meta.talentMods, read by ctx.playerMods in
// effect_dispatch.ts) from the SAME object, exactly like a real talent spend.
function installMods(sim: Sim, mods: TalentModifiers): void {
  const meta = metaOf(sim);
  meta.talentMods = mods;
  meta.known = abilitiesKnownAt(meta.cls, 20, mods) as typeof meta.known;
}

function addTargetDummy(sim: Sim, id: number): Entity {
  const target = createMob(id, MOBS.forest_wolf, 20, {
    x: sim.player.pos.x,
    y: sim.player.pos.y,
    z: sim.player.pos.z + 3,
  });
  target.hostile = true;
  target.maxHp = target.hp = 1_000_000;
  (sim as unknown as { addEntity(e: Entity): void }).addEntity(target);
  sim.targetEntity(target.id);
  sim.player.facing = Math.atan2(target.pos.x - sim.player.pos.x, target.pos.z - sim.player.pos.z);
  return target;
}

describe('mastery/talent damage percent scales the whole hit, not just the base (#1803)', () => {
  it('a directDamage ability with an ability-scoped +25% (the Frost mastery shape) scales base AND the Spell Power rider by the same 1.25', () => {
    const dmgPct = 0.25;
    const baseline = emptyModifiers();
    const boosted = emptyModifiers();
    accumulateTalentEffect(boosted, { ability: [{ ability: 'frostbolt', dmgPct }] });

    const baseAbility = abilitiesKnownAt('mage', 20, baseline).find(
      (a) => a.def.id === 'frostbolt',
    );
    const boostedAbility = abilitiesKnownAt('mage', 20, boosted).find(
      (a) => a.def.id === 'frostbolt',
    );
    if (!baseAbility || !boostedAbility) throw new Error('missing frostbolt');
    const baseEff = directDamageEffect(baseAbility.effects);
    const boostedEff = directDamageEffect(boostedAbility.effects);

    // The authored base already scaled before this fix (unchanged behavior).
    expect(boostedEff.min).toBe(Math.round(baseEff.min * (1 + dmgPct)));

    // Large relative to the authored base, so an un-multiplied rider would
    // visibly under-deliver the advertised 25% (the exact shortfall #1803
    // reports growing with gear).
    const spellPower = 900;
    const castTime = boostedAbility.castTime;
    const { dmgMult } = resolveTalentHitMult(boostedAbility.def, boosted);
    expect(dmgMult).toBeCloseTo(1 + dmgPct, 10);

    const baselineRider = directHitBonus(spellPower, baseAbility.def, castTime);
    const fixedRider = directHitBonus(spellPower, boostedAbility.def, castTime, false, dmgMult);
    const unfixedRider = directHitBonus(spellPower, boostedAbility.def, castTime); // mult defaults to 1

    const baselineHit = baseEff.min + baselineRider;
    const fixedHit = boostedEff.min + fixedRider;
    const unfixedHit = boostedEff.min + unfixedRider;

    // The fix: the whole hit (base + SP) now carries the advertised 25%.
    expect(fixedHit / baselineHit).toBeCloseTo(1 + dmgPct, 2);
    // The bug this reproduces: leaving the rider unscaled falls short of 1.25
    // once SP is a meaningful share of the hit.
    expect(unfixedHit / baselineHit).toBeLessThan(1 + dmgPct);
  });

  it('a DoT (Corruption) with a +40% ability-scoped talent applies the full 40% to base + Spell Power together, at both low and high Spell Power', () => {
    const dmgPct = 0.4;
    const boosted = emptyModifiers();
    accumulateTalentEffect(boosted, { ability: [{ ability: 'corruption', dmgPct }] });
    const baseline = emptyModifiers();

    const tickValue = (mods: TalentModifiers, spellPower: number): number => {
      const sim = new Sim({ seed: 11, playerClass: 'warlock', autoEquip: true });
      sim.setPlayerLevel(20);
      installMods(sim, mods);
      sim.player.spellPower = spellPower;
      sim.player.resource = sim.player.maxResource;
      const target = addTargetDummy(sim, 9301);
      sim.castAbility('corruption');
      // 2s cast time; no rng draw applies a DoT snapshot, so this is deterministic.
      for (let i = 0; i < 20 * 3; i++) sim.tick();
      const dot = target.auras.find((a) => a.kind === 'dot' && a.id === 'corruption');
      if (!dot) throw new Error('corruption did not land');
      return dot.value;
    };

    for (const spellPower of [0, 1200]) {
      const baseTick = tickValue(baseline, spellPower);
      const boostedTick = tickValue(boosted, spellPower);
      expect(boostedTick / baseTick).toBeCloseTo(1 + dmgPct, 1);
    }
  });

  it('a HoT (Renew) with a +50% ability-scoped talent applies the full 50% to base + Spell Power together', () => {
    const dmgPct = 0.5;
    const boosted = emptyModifiers();
    accumulateTalentEffect(boosted, { ability: [{ ability: 'renew', dmgPct }] });
    const baseline = emptyModifiers();

    const tickValue = (mods: TalentModifiers, spellPower: number): number => {
      const sim = new Sim({ seed: 21, playerClass: 'priest', autoEquip: true });
      sim.setPlayerLevel(20);
      installMods(sim, mods);
      sim.player.spellPower = spellPower;
      sim.player.resource = sim.player.maxResource;
      sim.targetEntity(sim.player.id); // Renew is friendly-targeted; heal self
      sim.castAbility('renew');
      for (let i = 0; i < 20; i++) sim.tick(); // instant cast, resolves within a tick
      const hot = sim.player.auras.find((a) => a.kind === 'hot' && a.id === 'renew');
      if (!hot) throw new Error('renew did not land');
      return hot.value;
    };

    for (const spellPower of [0, 1200]) {
      const baseTick = tickValue(baseline, spellPower);
      const boostedTick = tickValue(boosted, spellPower);
      expect(boostedTick / baseTick).toBeCloseTo(1 + dmgPct, 1);
    }
  });

  it('an absorb shield (Frostveil) with a +25% ability-scoped talent applies the full 25% to base + Spell Power together', () => {
    const dmgPct = 0.25;
    const boosted = emptyModifiers();
    accumulateTalentEffect(boosted, { ability: [{ ability: 'ice_barrier', dmgPct }] });
    const baseline = emptyModifiers();

    const shieldValue = (mods: TalentModifiers, spellPower: number): number => {
      const modsWithSpec: TalentModifiers = { ...mods, spec: 'frost' }; // ice_barrier is frost-spec-gated
      const sim = new Sim({ seed: 31, playerClass: 'mage', autoEquip: true });
      sim.setPlayerLevel(20);
      installMods(sim, modsWithSpec);
      sim.player.spellPower = spellPower;
      sim.player.resource = sim.player.maxResource;
      sim.castAbility('ice_barrier'); // requiresTarget: false, instant
      for (let i = 0; i < 20; i++) sim.tick();
      const shield = sim.player.auras.find((a) => a.kind === 'absorb' && a.id === 'ice_barrier');
      if (!shield) throw new Error('ice_barrier did not land');
      return shield.value;
    };

    for (const spellPower of [0, 1200]) {
      const baseShield = shieldValue(baseline, spellPower);
      const boostedShield = shieldValue(boosted, spellPower);
      expect(boostedShield / baseShield).toBeCloseTo(1 + dmgPct, 1);
    }
  });
});
