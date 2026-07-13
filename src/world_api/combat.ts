import type { ResolvedAbility } from '../sim/sim';

export interface IWorldCombat {
  known: ResolvedAbility[];
  castAbility(abilityId: string): void;
  castAbilityBySlot(slot: number): void;
  // Ground-targeted cast: the ability is aimed at a world point (x, z) the player
  // chose, instead of the current entity target. Cast by ability id (like
  // castAbility) so the client never depends on server slot semantics. No-op for
  // an ability that is not `targetMode: 'position'`.
  castAbilityAt(abilityId: string, aim: { x: number; z: number }): void;
  // Voluntarily cancel one of the local player's own helpful auras (right-click a
  // buff). No-op if the id names a debuff or an aura the player does not carry.
  cancelAura(auraId: string): void;
  startAutoAttack(): void;
  stopAutoAttack(): void;
  // Death loop: releaseSpirit leaves the body and rises as a ghost at the nearest
  // graveyard; resurrectAtCorpse revives at the body (no penalty, must be in range);
  // resurrectAtSpiritHealer revives at the angel with Resurrection Sickness.
  releaseSpirit(): void;
  resurrectAtCorpse(): void;
  resurrectAtSpiritHealer(): void;
  // Card Adept read surface: the card ids currently in the local player's hand,
  // and the draw/discard pile sizes. Empty / zero for every other class. The
  // online mirror populates these once the server wires the hand snapshot; until
  // then ClientWorld reports an empty hand (offline is the source of truth).
  cardHandIds(): string[];
  cardDeckCount(): number;
  cardDiscardCount(): number;
  // Play the hand card at `index`: spends Focus and triggers the referenced
  // ability. No-op for a non-Card-Adept player or an invalid index.
  playCard(index: number): void;
}
