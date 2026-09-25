// What pressing "Attack" (the fixed action-bar slot, and any key/pad binding
// routed to it) should do with the player's CURRENT target, selected via Tab
// or a click-pick, rather than the cursor position Attack Move already reads
// (see handleAttackMove/attackMoveTick in main.ts). Feature request: Tab an
// enemy, press Attack, and the character walks itself into melee range before
// swinging instead of silently arming a swing that never lands until the
// player manually closes the distance first.
//
// Pure decision core, DOM/sim-free like click_move.ts: the caller resolves
// whether the current target is a valid, live, attackable enemy and whether
// auto-attack is already running, and this only says which of the three
// existing actions to take. The actual chase reuses the Attack Move
// click-to-move pipeline (main.ts), and the actual "invalid target" report
// reuses startAutoAttack's own validation, so this module owns no player-facing
// text and no sim mutation.

export type AttackCurrentTargetAction =
  | { kind: 'toggle-off' } // already auto-attacking: press again to disengage
  | { kind: 'invalid' } // no usable target: defer to startAutoAttack's own error
  | { kind: 'chase' }; // walk to melee range, then auto-attack on arrival

export function planAttackCurrentTarget(
  autoAttacking: boolean,
  hasValidTarget: boolean,
): AttackCurrentTargetAction {
  if (autoAttacking) return { kind: 'toggle-off' };
  if (!hasValidTarget) return { kind: 'invalid' };
  return { kind: 'chase' };
}

interface Point2 {
  x: number;
  z: number;
}

/** The current target, already validated (live, hostile/attackable) by the caller. */
export interface AttackCurrentTargetEntity {
  id: number;
  pos: Point2;
}

export interface AttackCurrentTargetActions {
  stopAutoAttack(): void;
  startAutoAttack(): void;
  chaseToMelee(targetId: number, pos: Point2): void;
}

/**
 * Applies the plan above: `target` is already the caller's validated current
 * target (or null), so this module never resolves hostility/pvp rules itself,
 * and `actions.chaseToMelee` is the caller's click-to-move sink (main.ts's
 * Attack Move pipeline), so this module stays free of Input/renderer concerns.
 */
export function driveAttackCurrentTarget(
  autoAttacking: boolean,
  target: AttackCurrentTargetEntity | null,
  actions: AttackCurrentTargetActions,
): void {
  const plan = planAttackCurrentTarget(autoAttacking, target !== null);
  if (plan.kind === 'toggle-off') {
    actions.stopAutoAttack();
  } else if (plan.kind === 'invalid' || !target) {
    actions.startAutoAttack(); // reports "Invalid attack target."
  } else {
    actions.chaseToMelee(target.id, target.pos);
  }
}
