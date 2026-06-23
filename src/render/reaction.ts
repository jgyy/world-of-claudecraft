// How the renderer decides whether a *targetable* unit reads as hostile (red) or
// friendly to the local player, for nameplate text and the ground selection ring.
//
// The reaction predicates (owned-pet hostility, friendly-pet detection) now live
// in the host-agnostic `sim/creature_reaction` module so the renderer and the
// sim share one source of truth for "how non-hostile is this creature". They are
// re-exported here so the renderer keeps a single reaction surface to import.
export { isFriendlyPet, isOwnedPetHostile } from '../sim/creature_reaction';

// The classic level-difference ("con") color for a wild mob's nameplate, with a
// friendly-pet override so an owned pet reads as friendly green rather than a
// scary red. Kept here (pure) so the exact color thresholds are unit-tested.
export const FRIENDLY = '#9fdc7f';
export function mobNameColor(levelDiff: number, dead: boolean, friendly: boolean): string {
  if (dead) return '#999';
  if (friendly) return FRIENDLY;
  return levelDiff >= 3
    ? '#ff4444'
    : levelDiff >= 1
      ? '#ffaa33'
      : levelDiff >= -2
        ? '#ffe97a'
        : levelDiff >= -5
          ? '#7fdc4f'
          : '#9d9d9d';
}
