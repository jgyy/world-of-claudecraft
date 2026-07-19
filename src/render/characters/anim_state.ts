/** Renderer-derived animation inputs (same facts the old pose machine used). */
export interface AnimState {
  /** horizontal speed, world units/sec */
  speed: number;
  moving: boolean;
  /** run-vs-walk gait, hysteresis-picked in locomotion.ts (never a raw
   *  speed-threshold compare: that flips on every noisy frame under load) */
  running: boolean;
  airborne: boolean;
  /** moving against facing (players backpedaling) */
  backwards: boolean;
  /** use reversed forward locomotion instead of an authored walkBack clip */
  reverseBackpedal?: boolean;
  dead: boolean;
  casting: boolean;
  /** Channeling a self-centered whirl such as Bladestorm. This wins over the
   *  generic cast and locomotion poses. */
  spinning?: boolean;
  swimming: boolean;
  sitting: boolean;
  /** a hard-CC lockout (stun/incapacitate, see sim/combat/cc.ts isStunned) is
   *  active: freezes casts, movement, and melee, so the pose must read as
   *  dazed rather than idle. Excludes every active form swap (polymorph
   *  sheep, druid bear/cat/travel): the model change already reads as fully
   *  incapacitated (or, for travel form, as a mount), and none of those rigs
   *  has a bespoke `stunned` clip, so this pose would fall back to looping a
   *  hit-react flinch for the whole form duration instead. */
  stunned: boolean;
}

export type BaseState =
  | 'idle'
  | 'walk'
  | 'walkBack'
  | 'run'
  | 'cast'
  | 'spin'
  | 'swim'
  | 'sit'
  | 'jump'
  | 'stunned';

const DEFAULT_WALK_REF = 2.2;
const DEFAULT_RUN_REF = 7;

/**
 * Whether the dazed (`AnimState.stunned`) pose should apply, given a raw
 * hard-CC lockout (`isStunned(e)` from sim/combat/cc.ts) and whether ANY form
 * swap (polymorph sheep, druid bear/cat/travel) is currently the active
 * visual.
 *
 * Excludes every form swap, not just polymorph: the sheep, bear, and cat
 * (druid Cat/Wolf Form, shaman Shadewolf/ghost wolf) rigs all fall back to
 * the same single hit-react clip as their `stunned` pose (none of them has
 * a bespoke `stunned` clip authored), so looping it for the whole form
 * duration would read as a broken flinch loop rather than the model swap
 * that already communicates "incapacitated" on its own. Every other hard CC
 * (stun/stasis/incapacitate) while NOT shape-shifted still gets the pose.
 */
export function dazedPoseActive(hardCC: boolean, formSwapActive: boolean, dead: boolean): boolean {
  return hardCC && !formSwapActive && !dead;
}

export function desiredBaseState(s: AnimState, hasWalkBackClip: boolean): BaseState {
  // Airborne is physics (falling/knockback) and outranks stun: you fall either
  // way. Stun then preempts spin/swim/cast/sit/move, all voluntary actions a
  // hard CC lockout freezes (the server already breaks a channel the instant
  // isStunned flips true), so the pose must not keep reading as a normal
  // spin/cast/swim/sit loop while the player can't act. swim keeps its
  // pre-existing precedence over spin (a self-centered channel like
  // Bladestorm while swimming still reads as swim): stunned is the only
  // state newly inserted ahead of both. Airborne now also runs ahead of swim
  // (it did not before this change), but that reorder is inert: the renderer
  // only ever sets `airborne` with a `!swimming` guard (renderer.ts), so the
  // two conditions are never simultaneously true and their relative order
  // cannot be observed.
  if (s.airborne) return 'jump';
  if (s.stunned) return 'stunned';
  if (s.swimming) return 'swim';
  if (s.spinning) return 'spin';
  if (s.casting) return 'cast';
  if (s.sitting) return 'sit';
  if (s.moving) {
    if (s.backwards && hasWalkBackClip && !s.reverseBackpedal) return 'walkBack';
    return s.running ? 'run' : 'walk';
  }
  return 'idle';
}

export function locomotionTimeScale(
  baseState: BaseState,
  s: Pick<AnimState, 'speed' | 'backwards' | 'reverseBackpedal'>,
  walkRef = DEFAULT_WALK_REF,
  runRef = DEFAULT_RUN_REF,
): number | null {
  let timeScale: number;
  if (baseState === 'walk' || baseState === 'walkBack') {
    timeScale = clamp(s.speed / walkRef, 0.6, 1.8);
  } else if (baseState === 'run') {
    timeScale = clamp(s.speed / runRef, 0.6, 1.6);
  } else {
    return null;
  }
  return s.reverseBackpedal && s.backwards && baseState !== 'walkBack' ? -timeScale : timeScale;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

/** The vertical extent (scale.y) for an entity's click/pick proxy. The proxy is a
 *  unit cylinder scaled to (radius*2, standHeight, radius*2) and rooted at the feet.
 *  A living entity uses its full standing height; a dead (lying) one collapses to a
 *  low, ground-hugging profile (roughly its own body width tall) so a near-eye click
 *  behind or above the flat corpse no longer intersects an invisible upright column
 *  (issue 1486), while the ground-level footprint stays clickable for looting. */
export function pickProxyHeight(standHeight: number, radius: number, dead: boolean): number {
  if (!dead) return standHeight;
  return Math.min(standHeight, radius * 2);
}
