// The Honing card's listeners (the thin DOM half of honing_sheet_view.ts):
// the two picks write back into the character window's HoningPick and ask for
// a repaint; the Hone button sends the one IWorld command. Nothing here
// decides an outcome: the sim owns every gate, the cost, and the roll, and
// the answer comes back as notice lines plus the text-free `honed` event the
// Hud turns into a sheet repaint.
import { isHoningStat } from '../sim/progression/honing_policy';
import { isEquipSlot } from '../sim/types';
import type { IWorld } from '../world_api';
import type { HoningPick } from './honing_sheet_view';

export interface HoningCardHost {
  world(): IWorld;
  pick: HoningPick;
  /** Repaint the sheet after a pick changed (the selects live in innerHTML). */
  repaint(): void;
  /** UI click feedback for the button (audio.click in the live Hud). */
  click(): void;
}

export function wireHoningCard(root: ParentNode, host: HoningCardHost): void {
  const slotSelect = root.querySelector<HTMLSelectElement>('[data-honing="slot"]');
  slotSelect?.addEventListener('change', () => {
    if (isEquipSlot(slotSelect.value)) host.pick.slot = slotSelect.value;
    host.repaint();
  });
  const statSelect = root.querySelector<HTMLSelectElement>('[data-honing="stat"]');
  statSelect?.addEventListener('change', () => {
    if (isHoningStat(statSelect.value)) host.pick.stat = statSelect.value;
    host.repaint();
  });
  root.querySelector<HTMLButtonElement>('[data-act="hone"]')?.addEventListener('click', () => {
    const slot =
      host.pick.slot ?? (isEquipSlot(slotSelect?.value ?? '') ? slotSelect?.value : undefined);
    if (!slot || !isEquipSlot(slot)) return;
    host.click();
    host.world().honeItem(slot, host.pick.stat);
  });
}
