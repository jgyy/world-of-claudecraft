import { RUN_SPEED } from './types';

// A low-health, cowardly mob flees at FLEE_SPEED_MULT times its base move speed,
// but the FINAL flee speed (after any slow/speed auras) is capped at
// FLEE_MAX_SPEED so a fleeing enemy can never move faster than a player's base
// run speed. A mob that outran the player turns the chase into an annoying,
// un-winnable mechanic; instead the player can always catch it, and the only
// real risk is that the flee pulls in social aggro before the kill lands.
export const FLEE_SPEED_MULT = 1.4;
export const FLEE_MAX_SPEED = RUN_SPEED;

// baseMoveSpeed is the mob's template speed; moveSpeedMult folds its slow/speed
// auras (1 = unaffected). Folding the multiplier INSIDE the cap is the fix: the
// resulting speed the mob actually travels at is bounded by the player's base
// run speed even when the mob is hasted.
export function fleeSpeed(baseMoveSpeed: number, moveSpeedMult: number): number {
  return Math.min(baseMoveSpeed * FLEE_SPEED_MULT * moveSpeedMult, FLEE_MAX_SPEED);
}
