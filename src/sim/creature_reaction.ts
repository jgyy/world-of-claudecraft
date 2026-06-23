import type { Entity } from './types';

// One home for "how non-hostile is this creature" reasoning. These predicates
// are the abstraction behind the scattered checks that used to live inline in
// the sim tick (`isHostileTo`, the mob-AI pacify branch) and in the renderer's
// nameplate code. They are pure (read only `kind`/`ownerId`/`hostile` plus the
// caller-supplied lookups), so the same answer drives combat eligibility on the
// server and the friendly/hostile colour on the client without drifting apart.

// Non-combat lore "visions" (the Nythraxis raid memory encounters, ids prefixed
// `vision_`). They are never hostile and never valid attack targets; the sim
// keeps them parked in `idle` rather than spawning them into the aggro loop.
export function isVisionCreature(templateId: string): boolean {
  return templateId.startsWith('vision_');
}

// True when an owned pet should read as hostile to the viewer. A pet owned by a
// player mirrors that player's reaction; any other owner (or a missing owner)
// falls back to the pet's own `hostile` flag.
export function isOwnedPetHostile(
  pet: Entity,
  entities: Map<number, Entity>,
  isPlayerHostile: (p: Entity) => boolean,
): boolean {
  const owner = pet.ownerId !== null ? entities.get(pet.ownerId) : undefined;
  return owner && owner.kind === 'player' ? isPlayerHostile(owner) : pet.hostile;
}

// True when a mob is a friendly controlled pet (owned and not hostile to the
// viewer) — the case that should get a friendly nameplate instead of the
// level-difference "con" colour.
export function isFriendlyPet(
  e: Entity,
  entities: Map<number, Entity>,
  isPlayerHostile: (p: Entity) => boolean,
): boolean {
  return e.kind === 'mob' && e.ownerId !== null && !isOwnedPetHostile(e, entities, isPlayerHostile);
}
