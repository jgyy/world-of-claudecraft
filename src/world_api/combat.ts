import type { ResolvedAbility } from '../sim/sim';

export interface IWorldCombat {
  known: ResolvedAbility[];
  castAbility(abilityId: string): void;
  castAbilityBySlot(slot: number): void;
  // Voluntarily cancel one of the local player's own helpful auras (right-click a
  // buff). No-op if the id names a debuff or an aura the player does not carry.
  cancelAura(auraId: string): void;
  startAutoAttack(): void;
  stopAutoAttack(): void;
  releaseSpirit(): void;
  // Push the local auto-face-on-cast preference into the world (offline: sets it on
  // the primary player; online: sends it to the server, re-sent on reconnect).
  setAutoFaceOnCast(enabled: boolean): void;
}
