// Crucible Quartermaster sigil-for-sigil trades (feature request: trade a
// duplicate slot sigil for a different slot of the same flavor, e.g. a spare
// Helm Sigil of the Anvil for a Chest Sigil of the Anvil, since a sigil is
// soulbound and a duplicate otherwise just sits in the bags). Flavor is what
// fixes a sigil's three eligible classes (IGNIVAR_SIGIL_ITEMS), so every
// trade is restricted to the SAME flavor and a DIFFERENT slot: the result is
// always redeemable by the exact classes the source sigil was, and a
// wrong-class sigil (which loot does not gate) still cannot be converted into
// one your class can use.
//
// Derived, not hand-listed (3 flavors x 5 slots x 4 targets = 60 ordered
// pairs), the same way heroic_variants.ts derives its tier from the base item
// table rather than hand-authoring each row.

import { IGNIVAR_SIGIL_ITEMS } from './ignivar_loot';

export interface SigilTradeOffer {
  fromSigilId: string;
  toSigilId: string;
}

const SIGIL_IDS: readonly string[] = Object.keys(IGNIVAR_SIGIL_ITEMS);

// Sigil ids are `sigil_<flavor>_<slot>` (ignivar_loot.ts); the flavor is the
// second underscore-separated segment (matches the SIGIL_GROUPS convention in
// tests/ignivar_loot.test.ts).
function sigilFlavor(sigilId: string): string {
  return sigilId.split('_')[1];
}

export const CRUCIBLE_SIGIL_TRADES: readonly SigilTradeOffer[] = SIGIL_IDS.flatMap((fromSigilId) =>
  SIGIL_IDS.filter(
    (toSigilId) => toSigilId !== fromSigilId && sigilFlavor(toSigilId) === sigilFlavor(fromSigilId),
  ).map((toSigilId) => ({ fromSigilId, toSigilId })),
);
