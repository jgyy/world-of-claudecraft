// The Rift Forge window's pure view-core: the player's bags and worn slots in,
// one row per Riftbound band out, with every affordance already decided
// (next upgrade cost and whether it is affordable, the enchant cost, which
// owned gems could fill an open socket). DOM-free and host-agnostic: the
// same snapshot shape comes from the offline Sim and the online mirror, so
// the painter never re-derives a cost the sim already owns
// (src/sim/rift/progression.ts riftUpgradeCost / RIFT_ENCHANT_COST).
//
// Only BAGGED bands are forgeable: the sim resolves a forge target through
// the inventory (riftInventorySlot), so a worn band is listed with its state
// but flagged `worn`, and the painter renders the unequip hint instead of
// the buttons. Listing it at all keeps the window honest about what the
// player owns when they walk up wearing the ring they came to upgrade.

import {
  RIFT_ESSENCE_ITEM_ID,
  RIFT_GEM_IDS,
  type RiftGemId,
} from '../../../sim/content/rift/items';
import type { PlayerEquipmentInstances } from '../../../sim/entity';
import {
  RIFT_ENCHANT_COST,
  RIFT_ENCHANT_STATS,
  riftUpgradeCost,
} from '../../../sim/rift/progression';
import type { EquipSlot, InvSlot, ItemInstancePayload, RiftTier } from '../../../sim/types';

export interface RiftForgeInput {
  inventory: readonly InvSlot[];
  /** Worn slot -> item id (IWorld.equipment). */
  equipment: Partial<Record<EquipSlot, string>>;
  /** Worn slot -> per-copy payload (IWorld.equipmentInstances). */
  equipmentInstances: PlayerEquipmentInstances;
}

export type RiftForgeRingSource =
  | { kind: 'bag'; slotIndex: number }
  | { kind: 'worn'; slot: EquipSlot };

export interface RiftForgeRingRow {
  itemId: string;
  source: RiftForgeRingSource;
  instance: ItemInstancePayload;
  tier: RiftTier;
  upgradeLevel: number;
  maxUpgradeLevel: number;
  /** Essence the next upgrade costs; null at the ladder's top. */
  nextUpgradeCost: number | null;
  canUpgrade: boolean;
  enchant: { stat: string; value: number } | null;
  enchantCost: number;
  canEnchant: boolean;
  gems: readonly RiftGemId[];
  gemSlots: number;
  /** Owned gem ids that could fill an open socket (empty when full or none owned). */
  socketable: readonly RiftGemId[];
  /** Worn bands are shown, never forged (unequip first). */
  worn: boolean;
}

export interface RiftForgeView {
  rings: RiftForgeRingRow[];
  essence: number;
  gems: { id: RiftGemId; count: number }[];
  enchantStats: readonly string[];
}

function countOf(inventory: readonly InvSlot[], itemId: string): number {
  let n = 0;
  for (const s of inventory) if (s.itemId === itemId) n += s.count;
  return n;
}

function row(
  itemId: string,
  source: RiftForgeRingSource,
  instance: ItemInstancePayload,
  essence: number,
  owned: readonly RiftGemId[],
): RiftForgeRingRow | null {
  const rift = instance.rift;
  if (!rift) return null;
  const worn = source.kind === 'worn';
  const atMax = rift.upgradeLevel >= rift.maxUpgradeLevel;
  const nextUpgradeCost = atMax ? null : riftUpgradeCost(rift.upgradeLevel);
  const open = rift.gemSlots - rift.gems.length;
  return {
    itemId,
    source,
    instance,
    tier: rift.tier,
    upgradeLevel: rift.upgradeLevel,
    maxUpgradeLevel: rift.maxUpgradeLevel,
    nextUpgradeCost,
    canUpgrade: !worn && nextUpgradeCost !== null && essence >= nextUpgradeCost,
    enchant: rift.enchant ? { stat: rift.enchant.stat, value: rift.enchant.value } : null,
    enchantCost: RIFT_ENCHANT_COST,
    canEnchant: !worn && essence >= RIFT_ENCHANT_COST,
    gems: rift.gems.filter((g): g is RiftGemId => (RIFT_GEM_IDS as readonly string[]).includes(g)),
    gemSlots: rift.gemSlots,
    socketable: !worn && open > 0 ? owned : [],
    worn,
  };
}

export function buildRiftForgeView(input: RiftForgeInput): RiftForgeView {
  const essence = countOf(input.inventory, RIFT_ESSENCE_ITEM_ID);
  const gems = RIFT_GEM_IDS.map((id) => ({ id, count: countOf(input.inventory, id) }));
  const owned = gems.filter((g) => g.count > 0).map((g) => g.id);
  const rings: RiftForgeRingRow[] = [];
  input.inventory.forEach((slot, slotIndex) => {
    if (!slot.instance?.rift) return;
    const r = row(slot.itemId, { kind: 'bag', slotIndex }, slot.instance, essence, owned);
    if (r) rings.push(r);
  });
  for (const [slot, instance] of Object.entries(input.equipmentInstances)) {
    const itemId = input.equipment[slot as EquipSlot];
    if (!instance?.rift || !itemId) continue;
    const r = row(itemId, { kind: 'worn', slot: slot as EquipSlot }, instance, essence, owned);
    if (r) rings.push(r);
  }
  return { rings, essence, gems, enchantStats: RIFT_ENCHANT_STATS };
}
