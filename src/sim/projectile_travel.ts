// Projectile travel timing: defer a projectile's damage until it visually lands.
//
// The sim was hitscan: a ranged cast / shot / pet bolt emitted its `fx:'projectile'`
// visual AND resolved its damage in the SAME 20 Hz tick, while the renderer
// (src/render/vfx.ts) flew the bolt at PROJECTILE_SPEED yd/s toward the target. The
// damage number therefore popped before the bolt arrived. This leaf re-times that:
// the call site emits the visual now and schedules the WHOLE resolution (hit roll,
// crit/damage rng draws, dealDamage / runEffects) to run when the bolt reaches the
// target, one or more ticks later. Because every rng draw is deferred to the landing
// tick, a projectile whose caster or target dies or despawns mid-flight FIZZLES: it
// draws nothing and deals nothing (drainPendingProjectiles' alive guard).
//
// `src/sim`-pure: the travel math (projectileTravelTime + constants) is a pure
// function of numbers a Vitest drives directly; scheduleProjectile/drain take the
// SimContext seam by TYPE only (no DOM/Three/Math.random/Date.now), so the
// architecture guard (tests/architecture.test.ts) stays green.

import type { SimContext } from './sim_context';
import { dist2d, type Entity } from './types';

// Yards per second. Matches the homing projectile speed in src/render/vfx.ts so the
// damage lands in step with the bolt the player actually sees. Keep the two in sync.
export const PROJECTILE_SPEED = 26;

// A bolt never spends more than this in flight, so a max-range shot (~40 yd) still
// resolves promptly rather than letting an extreme distance stall its damage.
export const PROJECTILE_MAX_TRAVEL = 2;

/** Seconds a projectile spends in flight covering `dist` yards at `speed` yd/s,
 *  clamped to PROJECTILE_MAX_TRAVEL. Pure: same inputs give the same output, so a
 *  scheduled landing tick is deterministic. A non-positive distance or speed lands
 *  immediately (0), which the prologue drain still defers by at least one tick. */
export function projectileTravelTime(dist: number, speed: number = PROJECTILE_SPEED): number {
  if (!(dist > 0) || !(speed > 0)) return 0;
  return Math.min(dist / speed, PROJECTILE_MAX_TRAVEL);
}

// A projectile in flight: re-resolved by id at the landing tick so a stale Entity ref
// can never be hit. `resolve` runs only when both ends are still alive (see the drain).
export type PendingProjectile = {
  at: number; // sim time (seconds) the bolt reaches its target
  sourceId: number;
  targetId: number;
  resolve: (source: Entity, target: Entity) => void;
};

/** Queue a projectile launched now from `source` at `target`; `resolve` runs at the
 *  landing tick with the still-live source and target. The caller emits the
 *  `fx:'projectile'` visual itself (the renderer needs it immediately at launch). */
export function scheduleProjectile(
  ctx: SimContext,
  source: Entity,
  target: Entity,
  resolve: (source: Entity, target: Entity) => void,
): void {
  const at = ctx.time + projectileTravelTime(dist2d(source.pos, target.pos));
  ctx.pendingProjectiles.push({ at, sourceId: source.id, targetId: target.id, resolve });
}

/** Resolve every projectile whose flight has elapsed, in launch order (reordering IS
 *  drift). A bolt fizzles (resolves to nothing) when its caster or target has died or
 *  despawned mid-flight, so no damage, threat, or kill credit lands on a corpse. */
export function drainPendingProjectiles(ctx: SimContext): void {
  if (ctx.pendingProjectiles.length === 0) return;
  const pending: PendingProjectile[] = [];
  for (const proj of ctx.pendingProjectiles) {
    if (proj.at <= ctx.time) {
      const source = ctx.entities.get(proj.sourceId);
      const target = ctx.entities.get(proj.targetId);
      if (source && !source.dead && target && !target.dead) proj.resolve(source, target);
    } else pending.push(proj);
  }
  ctx.pendingProjectiles = pending;
}
