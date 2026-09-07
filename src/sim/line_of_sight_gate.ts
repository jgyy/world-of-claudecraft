// The combat line-of-sight gate, extracted from the coordinator (root
// Modularity ratchet). Three verbs, all rng-free:
//   abilityNeedsLineOfSight: a pure rule over the ability def (and the arena
//     exception for point-blank physical swings).
//   hasLineOfSight: the delve-aware sight check every ranged auto-attack, AoE
//     pulse and LOS-gated cast runs (the delve-run lookups are skipped away
//     from the delve band, see the comment inside).
//   lineOfSightBlocked: the two above composed, the shape the casting
//     lifecycle consumes through SimContext.
// The coordinator keeps thin same-named delegates because SimContext binds
// them and the on-cast AoE path calls them on `this`.

import { isArenaPos, isDelvePos } from './data';
import { entityLineOfSightClear } from './line_of_sight_elevation';
import type { SimContext } from './sim_context';
import { type AbilityDef, type Entity, MELEE_RANGE } from './types';

export function abilityNeedsLineOfSight(ability: AbilityDef, source?: Entity): boolean {
  if (!ability.requiresTarget) return false;
  if (ability.school !== 'physical' || ability.range > MELEE_RANGE) return true;
  // Melee/auto-attack skips line of sight everywhere else (it is always at
  // point-blank range), but the arena's thin enclosing walls sit well within
  // MELEE_RANGE: without this, a combatant pressed against a wall can swing
  // through it at an opponent on the far side. Ranked fairness requires every
  // attack to respect the same walls movement does inside the pit.
  return source !== undefined && isArenaPos(source.pos.x);
}

export function hasLineOfSight(
  ctx: Pick<SimContext, 'cfg' | 'delveRunForMob' | 'delveRunForPlayer' | 'riftCollisionToken'>,
  source: Entity,
  target: Entity,
): boolean {
  // The delve-run lookup is O(active runs x mobs per run) and allocates a
  // party key per call, and this function sits on every ranged auto-attack,
  // AoE pulse, and LOS-gated cast. Only a sight line with an endpoint inside
  // the delve band can ever consume run.modules (the collider LOS delve arm
  // keys off from.x), so every other combat sight check skips all four
  // lookups. Mirrors the movement path's isDelvePos guard.
  const inDelve = isDelvePos(source.pos.x) || isDelvePos(target.pos.x);
  const run = inDelve
    ? (ctx.delveRunForMob(source.id) ??
      ctx.delveRunForMob(target.id) ??
      ctx.delveRunForPlayer(source.id) ??
      ctx.delveRunForPlayer(target.id))
    : undefined;
  return entityLineOfSightClear(
    ctx.cfg.seed,
    source,
    target,
    0.05,
    run?.modules ?? undefined,
    ctx.riftCollisionToken,
  );
}

export function lineOfSightBlocked(
  ctx: Pick<SimContext, 'cfg' | 'delveRunForMob' | 'delveRunForPlayer' | 'riftCollisionToken'>,
  source: Entity,
  target: Entity,
  ability: AbilityDef,
): boolean {
  return abilityNeedsLineOfSight(ability, source) && !hasLineOfSight(ctx, source, target);
}
