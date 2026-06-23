import { describe, expect, it } from 'vitest';
import type { Entity } from '../src/sim/types';
import {
  isFriendlyPet,
  isOwnedPetHostile,
  isVisionCreature,
} from '../src/sim/creature_reaction';

// Minimal Entity stub: these predicates only read kind/ownerId/hostile, so we
// fill just those and cast, rather than constructing a full runtime entity.
function ent(partial: Partial<Entity>): Entity {
  return { kind: 'mob', ownerId: null, hostile: true, ...partial } as Entity;
}

describe('isVisionCreature', () => {
  it('is true for the non-combat lore "vision_" encounters', () => {
    expect(isVisionCreature('vision_aldren_warrior')).toBe(true);
    expect(isVisionCreature('vision_malric_mage')).toBe(true);
    expect(isVisionCreature('vision_deathstalker_voss')).toBe(true);
  });

  it('is false for ordinary hostile mobs and for non-vision raid adds', () => {
    expect(isVisionCreature('wolf')).toBe(false);
    expect(isVisionCreature('nythraxis_skeleton_warrior')).toBe(false);
    expect(isVisionCreature('')).toBe(false);
    // the prefix must anchor at the start, not match mid-string
    expect(isVisionCreature('elder_vision_keeper')).toBe(false);
  });

  it('is pure and deterministic for the same id', () => {
    expect(isVisionCreature('vision_aldren_warrior')).toEqual(
      isVisionCreature('vision_aldren_warrior'),
    );
  });
});

describe('isOwnedPetHostile', () => {
  const owner = ent({ id: 1, kind: 'player' } as Partial<Entity>);
  const entities = new Map<number, Entity>([[1, owner]]);

  it('mirrors a player owner reaction (friendly owner => not hostile)', () => {
    const pet = ent({ id: 2, ownerId: 1, hostile: false });
    expect(isOwnedPetHostile(pet, entities, () => false)).toBe(false);
    expect(isOwnedPetHostile(pet, entities, () => true)).toBe(true);
  });

  it('falls back to the pet own hostile flag when owner is missing', () => {
    const wild = ent({ id: 3, ownerId: null, hostile: true });
    expect(isOwnedPetHostile(wild, entities, () => false)).toBe(true);
  });
});

describe('isFriendlyPet', () => {
  const owner = ent({ id: 1, kind: 'player' } as Partial<Entity>);
  const entities = new Map<number, Entity>([[1, owner]]);

  it('is true only for an owned mob that is not hostile to the viewer', () => {
    const friendly = ent({ id: 2, kind: 'mob', ownerId: 1, hostile: false });
    expect(isFriendlyPet(friendly, entities, () => false)).toBe(true);
  });

  it('is false for a wild, owner-less mob', () => {
    const wild = ent({ id: 3, kind: 'mob', ownerId: null, hostile: true });
    expect(isFriendlyPet(wild, entities, () => false)).toBe(false);
  });
});
