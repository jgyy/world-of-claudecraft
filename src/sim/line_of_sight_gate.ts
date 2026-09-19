// The combat line-of-sight gate, extracted from the coordinator (root
// Modularity ratchet). Two verbs, both rng-free (the pure per-ability rule,
// abilityNeedsLineOfSight, lives in ability_line_of_sight.ts):
//   hasLineOfSight: the delve-aware sight check every ranged auto-attack, AoE
//     pulse and LOS-gated cast runs (the delve-run lookups are skipped away
//     from the delve band, see the comment inside).
//   lineOfSightBlocked: the two above composed, the shape the casting
//     lifecycle consumes through SimContext.
// The coordinator keeps thin same-named delegates because SimContext binds
// them and the on-cast AoE path calls them on `this`.

import { abilityNeedsLineOfSight } from './ability_line_of_sight';
import { isDelvePos } from './data';
import { entityLineOfSightClear } from './line_of_sight_elevation';
import type { SimContext } from './sim_context';
import type { AbilityDef, Entity } from './types';

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
