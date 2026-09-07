// The counter-service dispatch arms of the WS command switch (server/game.ts
// dispatchMessage): the Maker's Bond unbind, the Soul Key release, the Heroic
// Quartermaster's marks purchase and tier upgrade, and the Crucible sigil
// redemption. Extracted as one sibling (the vault_wire.ts precedent) so the
// coordinator keeps only the case labels the command-schema scan pins
// (tests/command_schema.test.ts) while the bodies live behind a seam a
// Vitest can drive directly.
//
// Every arm is server-authoritative in the SAME way: the wire carries intent
// only (an item id and, for the copy-targeting arms, a bag slot index), the
// sim resolver re-validates everything (eligibility, the named copy, range,
// balance, allowance), and the outcome reaches the client as a pid-scoped
// text-free result event that is a HEAVY_SELF_EVENTS member, so the
// stamped, swapped, or debited copies re-diff the self inv/purse mirrors on
// the next snapshot. Nothing here decides an outcome.

import type { Sim } from '../src/sim/sim';

export type CounterServiceCommandName =
  | 'unbind_item'
  | 'soul_key_unbind'
  | 'heroic_buy'
  | 'heroic_upgrade'
  | 'crucible_buy';

export type CounterServiceSim = Pick<
  Sim,
  'unbindItem' | 'useSoulKey' | 'buyHeroicVendorItem' | 'heroicUpgradeItem' | 'buyCrucibleVendorItem'
>;

/** The named bag slot a copy-targeting command carries, or undefined for the
 *  id-only arity. Integers only: anything else reads as "no slot named", and
 *  the sim re-resolves the index against its own inventory either way. */
export function wireSlotIndex(value: unknown): number | undefined {
  return Number.isInteger(value) ? Number(value) : undefined;
}

export function dispatchCounterServiceCommand(
  sim: CounterServiceSim,
  cmd: CounterServiceCommandName,
  msg: Record<string, unknown>,
  pid: number,
): void {
  switch (cmd) {
    case 'unbind_item':
      // Maker's Bond unbind service (Professions 2.0): eligibility, bound-
      // ness, station range, and the fee re-validate in
      // src/sim/professions/commission.ts; answers with unbindResult.
      if (typeof msg.item === 'string') sim.unbindItem(msg.item, pid);
      break;
    case 'soul_key_unbind':
      // Soul Key release (src/sim/soul_key.ts): eligibility, the named copy,
      // the key, and the weekly allowance re-validate there; answers with
      // soulKeyResult.
      if (typeof msg.item === 'string') sim.useSoulKey(msg.item, pid, wireSlotIndex(msg.slot));
      break;
    case 'heroic_buy':
      // Range, stock, marks balance, and bag space re-validate in
      // src/sim/instances/heroic_vendor.ts; answers with the vendor event.
      if (typeof msg.itemId === 'string') sim.buyHeroicVendorItem(msg.itemId, pid);
      break;
    case 'heroic_upgrade':
      // Eligibility, the named copy, range, and marks re-validate in
      // src/sim/instances/heroic_upgrade.ts; answers with heroicUpgradeResult.
      if (typeof msg.item === 'string')
        sim.heroicUpgradeItem(msg.item, pid, wireSlotIndex(msg.slot));
      break;
    case 'crucible_buy':
      // Range, stock, class, sigil balance, and bag space re-validate in
      // src/sim/instances/crucible_vendor.ts; answers with the vendor event.
      if (typeof msg.itemId === 'string') sim.buyCrucibleVendorItem(msg.itemId, pid);
      break;
  }
}
