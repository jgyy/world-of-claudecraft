// Social aggro for fleeing mobs. A cowardly mob that panics at low HP calls only its
// LOCAL same-family neighbours into the fight, once, at the moment it breaks: it does
// NOT keep chaining allies across the camp as it sprints past them. Pulling every mob
// the fleer runs beside cascaded a single pull into a whole-camp wipe; a tight, local,
// one-shot rally keeps the panic to the immediate cluster (the same way an initial pull
// seeds same-family social aggro in aggroMob), while the rest of the pack stays idle.
//
// Pure entity-state mutation: it sets aiState/aggroTargetId/leashAnchor and seeds the
// hate table, and draws NO rng. That keeps the shared draw order unchanged, so the
// parity goldens are unaffected.
import { MOBS } from '../data';
import type { SimContext } from '../sim_context';
import { addThreat } from '../threat';
import type { Entity } from '../types';

// A fleeing mob rallies same-family allies within this (small, local) radius, once at
// the panic spot. Kept tight so a fleer cannot chain in the whole camp.
export const FLEE_HELP_RADIUS = 5;

// Pull every idle, same-family ally currently within FLEE_HELP_RADIUS of the fleeing
// mob onto its attacker. Called once, at the panic moment. Returns the number of allies
// newly pulled (handy for tests).
export function rallyFleeingAllies(ctx: SimContext, mob: Entity, target: Entity): number {
  const family = MOBS[mob.templateId]?.family;
  if (!family) return 0;
  let pulled = 0;
  ctx.grid.forEachInRadius(mob.pos.x, mob.pos.z, FLEE_HELP_RADIUS, (m, d2) => {
    if (
      m.kind === 'mob' &&
      m.id !== mob.id &&
      !m.dead &&
      m.hostile &&
      m.aiState === 'idle' &&
      m.ownerId === null &&
      MOBS[m.templateId]?.family === family &&
      d2 < FLEE_HELP_RADIUS * FLEE_HELP_RADIUS
    ) {
      m.aiState = 'chase';
      m.aggroTargetId = target.id;
      m.inCombat = true;
      m.leashAnchor = { ...m.pos };
      addThreat(m, target.id, 1);
      pulled++;
    }
  });
  return pulled;
}
