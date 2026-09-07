// Party gates: the mage Grand Portal and the warlock Hellgate.
// STUB: bodies are filled in the party-gate implementation commit; the
// coordinator, effect dispatch and interaction paths are already wired.

import type { Entity } from './types';
import type { SimContext } from './sim_context';

export function summonGrandPortal(
  _ctx: SimContext,
  _caster: Entity,
  _destination: string,
  _duration: number,
): Entity | null {
  return null;
}
export function summonHellgate(_ctx: SimContext, _caster: Entity, _duration: number): Entity | null {
  return null;
}
export function interactPartyGate(_ctx: SimContext, _object: Entity, _actorId: number): boolean {
  return false;
}
export function rememberPartyGateEligibility(
  _ctx: SimContext,
  _party: { members: readonly number[] },
): void {}
export function updatePartyGates(_ctx: SimContext): void {}
