# Item binding: Bind on Pickup and Bind on Equip

Classic-era MMOs bind gear two ways, and World of ClaudeCraft now carries both.
The rules live in `src/sim/item_binding.ts` (pure leaf, pinned by
`tests/item_binding.test.ts`); the live paths are pinned end to end by
`tests/bind_on_equip.test.ts` and `tests/bop_party_trade.test.ts`.

## Bind on Pickup (BoP)

The def-level `ItemDef.soulbound` flag. The piece is bound to the character
from the moment it is acquired: raid tier gear, Warfare gear bought with Honor,
prize tokens. Its one escape is the party trade window
(`src/sim/loot/bop_trade_window.ts`): a soulbound copy awarded from party boss
loot stays tradeable for `BOP_PARTY_TRADE_MS` (two hours) with the characters
who were loot-eligible when it dropped, and equipping it ends the window early.

## Bind on Equip (BoE)

Derived, never hand-authored per item: `bindsOnEquip(def)` is true for every
equippable def (`weapon`, `armor`, `held_offhand`) of uncommon quality or
better that is not already `soulbound` and not a quest item. The explicit
`ItemDef.bindOnEquip` override wins in either direction for the odd exception.

A BoE piece trades, mails, lists on both markets, and stores in the guild bank
freely for as long as it has never been worn. The first time it is equipped it
binds to that character for good:

- **Worn gear carries no marker.** A worn piece is bound by the slot it sits
  in, so `PlayerMeta.equipmentInstance` stays exactly as before and every
  "plain worn copy has no payload" pin keeps holding.
- **The marker lands when the piece leaves the paperdoll.** Every unequip path
  (`unequipItem`, the same-slot swap in `equipItem`, the offhand respec bench,
  the legendary unique bench) routes through `returnEquippedItemToBags` in
  `src/sim/items.ts`, which stamps `ItemInstancePayload.soulbound = true`
  through `boundOnUnequipPayload`. The copy returns as its own instanced slot
  and can never merge into a plain tradeable stack again.
- **Every player-to-player pipe refuses the marker.** The trade predicate
  (`src/sim/social/trade.ts` `isTradeLocked`), the anonymous-pipe predicate
  (`src/sim/transfer_lock.ts` `isTransferLockedInstance`, consumed by mail,
  the World Market, the guild bank, and the bag click gates), and the $WOC
  exchange (`src/sim/exchange_eligibility.ts` `exchangeHardLock`, which reports
  the `soulbound` refusal) all read it.
- **Vendor sale stays open.** A bound copy is still the owner's to sell for
  gold, the classic rule; only transfer to another player is closed.
- **Not the Maker's Bond.** `boundTo` is the commission lock a station master
  can unbind for a fee. The soulbound marker is a separate field on purpose so
  the unbind service never peels a BoE bind: a copy carrying both reads as not
  bound to the service (`src/sim/professions/commission.ts` and the
  `unbind_view.ts` row predicate), so it is never listed and never charged.
- **Load rebuilds carry it.** The rift gear load rebuild
  (`src/sim/rift/progression.ts` `sanitizeRiftGearInstance`) reconstructs the
  payload from a fixed key list and copies the marker across, so a worn rift
  piece cannot lose its bind on relog.

## Tooltips and the bag gates

`src/ui/item_instance_tooltip.ts` `itemBindingLine` renders the one binding
line under the item-level readout: "Soulbound" for a BoP def or a copy bound
by wearing it, "Binds when equipped" for a never-worn BoE piece. The paperdoll
and the inspect window both project a worn BoE piece through
`wornTooltipInstance(instance, item)`, which adds the marker from the def so
the offline Sim and the online eqi-trimmed mirror render the same worn tooltip
without the wire carrying anything new.
`src/ui/bags_view.ts` blocks the trade, mail, and market clicks on a bound copy
in place (the `transferBlockedSoulbound` arm) and leaves the vendor click open.

## Persistence

`soulbound: true` is an additive boolean on the instance payload: JSONB-safe,
passed through by the load sanitizer (`src/sim/item_instance_load.ts`) like any
other non-string leaf, and absent on every copy minted before this rule, which
therefore stays freely tradeable until it is next worn.
