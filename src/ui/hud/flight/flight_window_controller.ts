// The flight window: the destination list a flightmaster offers. A DOM adapter
// on the DelveBoardController pattern: it owns #flight-window, the focus trap
// and the takeFlight command; the rows come from the pure flight_view core.
// Cold painter: it repaints only on open, on a purse change and on close.

import { flightNodeByNpcId } from '../../../sim/content/flight_paths';
import type { IWorld } from '../../../world_api';
import { markDialogRoot } from '../../dialog_root';
import { esc } from '../../esc';
import type { FocusTrapHandle } from '../../focus_manager';
import { formatMoney as formatLocalizedMoney, formatNumber, t } from '../../i18n';
import { svgIcon } from '../../ui_icons';
import { buildFlightView } from './flight_view';

export interface FlightWindowControllerDeps {
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

export class FlightWindowController {
  private npcId: number | null = null;
  private nodeId: string | null = null;
  private trap: FocusTrapHandle | null = null;

  constructor(private readonly deps: FlightWindowControllerDeps) {}

  get isOpen(): boolean {
    return this.npcId !== null;
  }

  /** The flightmaster entity the window is open at (the walk-away close reads it). */
  get openNpcId(): number | null {
    return this.npcId;
  }

  /** Open at the flightmaster `npcId` serving `nodeId` (the 'flightmaster' SimEvent). */
  open(npcId: number, nodeId: string): void {
    if (this.deps.element.style.display !== 'block') this.trap = this.deps.openFocusTrap();
    this.npcId = npcId;
    this.nodeId = nodeId;
    this.deps.closeOtherWindows('#flight-window');
    this.deps.element.style.display = 'block';
    this.render(true);
  }

  /** The gossip route: resolve the node from the NPC's content key, then open. */
  openAtNpc(npcId: number): void {
    const npc = this.deps.world().entities.get(npcId);
    if (npc?.kind !== 'npc') return;
    const node = flightNodeByNpcId(npc.templateId);
    if (node) this.open(npcId, node.id);
  }

  render(focus = false): void {
    const { element } = this.deps;
    if (this.npcId === null || this.nodeId === null) {
      element.style.display = 'none';
      return;
    }
    const world = this.deps.world();
    const npc = world.entities.get(this.npcId);
    if (npc?.kind !== 'npc') {
      this.close();
      return;
    }
    const title = t('hudChrome.flight.title');
    const rows = buildFlightView(this.nodeId, world.flightNodesKnown, world.copper);
    const list = rows.length
      ? `<div class="flight-list" role="list">${rows
          .map((row) => {
            const hops = formatNumber(row.hops, { maximumFractionDigits: 0 });
            const fare = this.deps.money(row.fareCopper);
            const aria = t('hudChrome.flight.rowAria', {
              town: row.town,
              hops,
              fare: t('hudChrome.flight.fare', { fare: formatLocalizedMoney(row.fareCopper) }),
            });
            return (
              `<button type="button" class="vendor-item flight-row${row.affordable ? '' : ' unaffordable'}" role="listitem"` +
              ` data-flight-node="${esc(row.nodeId)}" data-focus-key="node:${esc(row.nodeId)}" aria-label="${esc(aria)}"${row.affordable ? '' : ' disabled'}>` +
              `<span class="vi-name">${esc(row.town)}</span>` +
              `<span class="flight-hops">${esc(t('hudChrome.flight.hops', { count: hops }))}</span>` +
              `<span class="vi-price">${fare}</span></button>`
            );
          })
          .join('')}</div>`
      : `<div class="flight-empty quest-muted">${esc(t('hudChrome.flight.empty'))}</div>`;
    // A standalone focus-trapped window: announce it as a labeled dialog.
    markDialogRoot(element, { label: title });
    element.innerHTML =
      `<div class="panel-title"><span>${esc(this.deps.npcName(npc.templateId))}</span>` +
      `<button type="button" class="x-btn" data-close data-focus-key="close" aria-label="${esc(t('hudChrome.flight.close'))}">${svgIcon('close')}</button></div>` +
      `<div class="flight-subtitle">${esc(title)}</div>${list}`;
    element.querySelectorAll<HTMLButtonElement>('[data-flight-node]').forEach((button) => {
      button.addEventListener('click', () => {
        if (button.disabled) return;
        const nodeId = button.dataset.flightNode ?? '';
        this.deps.world().takeFlight(nodeId);
        this.close();
      });
    });
    element.querySelector('[data-close]')?.addEventListener('click', () => this.close());
    if (focus) this.trap?.focusFirst('.flight-row:not([disabled])');
  }

  close(restoreFocus = true): void {
    this.deps.element.style.display = 'none';
    this.npcId = null;
    this.nodeId = null;
    this.deps.hideTooltip();
    this.trap?.release(restoreFocus);
    this.trap = null;
  }
}
