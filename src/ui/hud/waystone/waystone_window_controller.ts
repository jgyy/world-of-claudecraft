// The waystone window: the destination list a keeper offers. A DOM adapter on
// the DelveBoardController pattern: it owns #waystone-window, the focus trap
// and the waystoneTeleport command; the rows come from the pure waystone_view
// core. Cold painter: it repaints only on open, on a purse or bag change and on
// close.

import { WAYSTONE_TICKET_ITEM_ID, waystoneByNpcId } from '../../../sim/content/waystones';
import type { IWorld } from '../../../world_api';
import { markDialogRoot } from '../../dialog_root';
import { esc } from '../../esc';
import type { FocusTrapHandle } from '../../focus_manager';
import { focusKeyAttr } from '../../focus_restore';
import { formatMoney as formatLocalizedMoney, formatNumber, t } from '../../i18n';
import { svgIcon } from '../../ui_icons';
import { buildWaystoneView } from './waystone_view';

export interface WaystoneWindowControllerDeps {
  element: HTMLElement;
  world(): IWorld;
  openFocusTrap(): FocusTrapHandle;
  closeOtherWindows(selector: string): void;
  hideTooltip(): void;
  /** The purse-styled money markup (Hud.moneyHtml). */
  money(copper: number): string;
  /** Localized NPC name for a content key (entity_display_labels.npcDisplayName). */
  npcName(templateId: string): string;
}

/** Tickets in the bags, the same count the sim spends from. */
export function ticketCount(world: Pick<IWorld, 'inventory'>): number {
  let n = 0;
  for (const slot of world.inventory) if (slot.itemId === WAYSTONE_TICKET_ITEM_ID) n += slot.count;
  return n;
}

export class WaystoneWindowController {
  private npcId: number | null = null;
  private stoneId: string | null = null;
  private trap: FocusTrapHandle | null = null;

  constructor(private readonly deps: WaystoneWindowControllerDeps) {}

  get isOpen(): boolean {
    return this.npcId !== null;
  }

  /** The keeper entity the window is open at (the walk-away close reads it). */
  get openNpcId(): number | null {
    return this.npcId;
  }

  /** Open at the keeper `npcId` serving `stoneId` (the 'waystone' SimEvent). */
  open(npcId: number, stoneId: string): void {
    if (this.deps.element.style.display !== 'block') this.trap = this.deps.openFocusTrap();
    this.npcId = npcId;
    this.stoneId = stoneId;
    this.deps.closeOtherWindows('#waystone-window');
    this.deps.element.style.display = 'block';
    this.render(true);
  }

  /** The gossip route: resolve the stone from the NPC's content key, then open. */
  openAtNpc(npcId: number): void {
    const npc = this.deps.world().entities.get(npcId);
    if (npc?.kind !== 'npc') return;
    const stone = waystoneByNpcId(npc.templateId);
    if (stone) this.open(npcId, stone.id);
  }

  render(focus = false): void {
    const { element } = this.deps;
    if (this.npcId === null || this.stoneId === null) {
      element.style.display = 'none';
      return;
    }
    const world = this.deps.world();
    const npc = world.entities.get(this.npcId);
    if (npc?.kind !== 'npc') {
      this.close();
      return;
    }
    const title = t('hudChrome.waystone.title');
    const view = buildWaystoneView(
      this.stoneId,
      world.waystonesAttuned,
      world.copper,
      ticketCount(world),
      world.player.guildTier,
    );
    const tickets = formatNumber(view.tickets, { maximumFractionDigits: 0 });
    const discount = formatNumber(view.discountPct, { maximumFractionDigits: 0 });
    const notes =
      `<div class="waystone-notes quest-muted">` +
      `<span class="waystone-tickets">${esc(t('hudChrome.waystone.tickets', { count: tickets }))}</span>` +
      (view.discountPct > 0
        ? `<span class="waystone-discount">${esc(t('hudChrome.waystone.guildDiscount', { pct: discount }))}</span>`
        : '') +
      `</div>`;
    const list = view.rows.length
      ? `<div class="waystone-list" role="list">${view.rows
          .map((row) => {
            const distance = formatNumber(Math.round(row.distanceYd), { maximumFractionDigits: 0 });
            const price = row.ticket
              ? `<span class="waystone-ticket-price">${esc(t('hudChrome.waystone.ticketPrice'))}</span>`
              : this.deps.money(row.feeCopper);
            const priceAria = row.ticket
              ? t('hudChrome.waystone.ticketPrice')
              : t('hudChrome.waystone.fee', { fee: formatLocalizedMoney(row.feeCopper) });
            const aria = t('hudChrome.waystone.rowAria', {
              town: row.town,
              distance,
              price: priceAria,
            });
            return (
              `<button type="button" class="vendor-item waystone-row${row.affordable ? '' : ' unaffordable'}" role="listitem"` +
              ` data-waystone="${esc(row.stoneId)}" ${focusKeyAttr(`stone:${row.stoneId}`)} aria-label="${esc(aria)}"${row.affordable ? '' : ' disabled'}>` +
              `<span class="vi-name">${esc(row.town)}</span>` +
              `<span class="waystone-distance">${esc(t('hudChrome.waystone.distance', { distance }))}</span>` +
              `<span class="vi-price">${price}</span></button>`
            );
          })
          .join('')}</div>`
      : `<div class="waystone-empty quest-muted">${esc(t('hudChrome.waystone.empty'))}</div>`;
    // A standalone focus-trapped window: announce it as a labeled dialog.
    markDialogRoot(element, { label: title });
    element.innerHTML =
      `<div class="panel-title"><span>${esc(this.deps.npcName(npc.templateId))}</span>` +
      `<button type="button" class="x-btn" data-close ${focusKeyAttr('close')} aria-label="${esc(t('hudChrome.waystone.close'))}">${svgIcon('close')}</button></div>` +
      `<div class="waystone-subtitle">${esc(title)}</div>${notes}${list}`;
    element.querySelectorAll<HTMLButtonElement>('[data-waystone]').forEach((button) => {
      button.addEventListener('click', () => {
        if (button.disabled) return;
        const stoneId = button.dataset.waystone ?? '';
        this.deps.world().waystoneTeleport(stoneId);
        this.close();
      });
    });
    element.querySelector('[data-close]')?.addEventListener('click', () => this.close());
    if (focus) this.trap?.focusFirst('.waystone-row:not([disabled])');
  }

  close(restoreFocus = true): void {
    this.deps.element.style.display = 'none';
    this.npcId = null;
    this.stoneId = null;
    this.deps.hideTooltip();
    this.trap?.release(restoreFocus);
    this.trap = null;
  }
}
