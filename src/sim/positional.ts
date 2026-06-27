// Positional combat predicates: the single, canonical home for "am I facing my
// target" (front arc) and "am I behind my target" (rear arc) checks.
//
// SECURITY INVARIANT (why this module exists):
// An entity's `facing` is CLIENT-SUPPLIED for players (see server/game.ts, where
// `e.facing = frame.facing`). It is therefore FORGEABLE: a cheat client can report
// any orientation, decoupled from where it is actually moving or looking. (Mob
// facing is server-computed via `angleTo`, so it is trustworthy.)
//
// Consequently these predicates MUST only ever gate BONUSES or extra requirements
// on top of the real server gates, never decide whether an entity is hittable at
// all. The authoritative, non-forgeable gates are RANGE and TARGET VALIDITY
// (distance + a live, hostile, line-of-sight target), both derived from
// server-tracked positions. A future "hittable only from behind" mechanic must NOT
// gate hittability on `isBehindTarget`; it stays a damage/effect modifier, with
// range + target validity remaining the hard gates. Routing every positional check
// through here keeps that rule auditable in one place.
//
// Both predicates canonicalize the angle difference through `normAngle`, so they
// return the correct result for ANY finite `facing` (including the large
// accumulated yaw the keyboard-turn path sends, which is bounded but not
// normalized at ingestion). `src/sim`-pure: imports only sibling sim math.

import { angleTo, normAngle, type Vec3 } from './types';

// True when `to` lies within `arc` radians of where `facing` points from `from`.
// Mirrors the front-arc gate: the caster must be facing (roughly toward) the
// target. Boundary is inclusive (exactly `arc` away still counts as facing).
export function withinMeleeArc(facing: number, from: Vec3, to: Vec3, arc: number): boolean {
  return Math.abs(normAngle(angleTo(from, to) - facing)) <= arc;
}

// True when `attackerPos` sits in the rear arc of a target oriented along
// `targetFacing` (more than 90 degrees off the target's facing). Mirrors the
// backstab/ambush "must be behind your target" gate. Boundary (exactly to the
// side, 90 degrees) counts as NOT behind, matching the original `< Math.PI / 2`
// rejection.
export function isBehindTarget(targetFacing: number, targetPos: Vec3, attackerPos: Vec3): boolean {
  return Math.abs(normAngle(angleTo(targetPos, attackerPos) - targetFacing)) >= Math.PI / 2;
}
