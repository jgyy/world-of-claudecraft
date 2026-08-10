// Shaman Chain Heal: heal the target, then arc hop by hop to nearby allies. The
// hop choice is DETERMINISTIC (most injured by hp fraction, then nearest, then
// lowest id), so the only rng draws are the one base roll plus each applyHeal's
// crit, and the same world state always builds the same chain. Selection and the
// per-hop spellfx arc adopted from Blaine1705's #1434.
//
// `src/sim`-pure: no DOM/Three/render/ui/game/net imports, no Math.random/Date.now;
// the base heal roll is the only rng draw here, via the shared ctx.rng stream.

import type { SimContext } from '../sim_context';
import { directHealBonus } from '../spell_scaling';
import type { AbilityDef, AbilityEffect, Entity } from '../types';

export function runChainHeal(
  ctx: SimContext,
  caster: Entity,
  target: Entity | null,
  eff: Extract<AbilityEffect, { type: 'chainHeal' }>,
  abilityId: string,
  abilityName: string,
  abilitySchool: AbilityDef['school'],
  castTime: number,
  talentHealMult: number,
): void {
  const first = target ?? caster;
  const baseAmount =
    ctx.rng.range(eff.min, eff.max) +
    directHealBonus(caster.spellPower, castTime, false, talentHealMult);
  const chain: Entity[] = [first];
  while (chain.length <= eff.jumps) {
    const from = chain[chain.length - 1];
    let best: Entity | null = null;
    let bestFrac = Infinity;
    let bestD2 = Infinity;
    // The main grid holds every entity (players AND player-owned pets AND
    // mobs); isFriendlyTo filters to healable allies, so one scan suffices.
    // The pick is a deterministic min (hp fraction, then distance, then id),
    // so it is independent of grid iteration order (no rng here).
    ctx.grid.forEachInRadius(from.pos.x, from.pos.z, eff.radius, (e, d2) => {
      if (e.dead || chain.includes(e)) return;
      // Allies only: players and player-owned pets (what a friendly-target
      // heal may hit), never a hostile or an NPC bystander.
      if (e.id !== caster.id && !ctx.isFriendlyTo(caster, e)) return;
      // hp/maxHp are integers, so equal fractions compute the identical float:
      // an EXACT ladder (frac, then distance, then id) is transitive and thus
      // order-independent, no epsilon window needed.
      const frac = e.maxHp > 0 ? e.hp / e.maxHp : 1;
      const better =
        best === null ||
        frac < bestFrac ||
        (frac === bestFrac && (d2 < bestD2 || (d2 === bestD2 && e.id < best.id)));
      if (better) {
        best = e;
        bestFrac = frac;
        bestD2 = d2;
      }
    });
    if (best === null) break;
    chain.push(best);
  }
  for (let i = 0; i < chain.length; i++) {
    // The green healing arc: caster to the first target, then previous hop to
    // the next (a dedicated fx so it reads as a healing cord, not a nuke beam).
    ctx.emit({
      type: 'spellfx',
      sourceId: i === 0 ? caster.id : chain[i - 1].id,
      targetId: chain[i].id,
      school: abilitySchool,
      fx: 'chainHeal',
      ability: abilityId,
    });
    const hopAmount = Math.max(1, Math.round(baseAmount * eff.falloff ** i));
    ctx.applyHeal(caster, chain[i], hopAmount, abilityName, abilityId);
  }
}
