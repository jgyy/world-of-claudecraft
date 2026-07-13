// Thin DOM painter for the Card Duel matchmaking window.
//
// The consumer half of the pure-core + thin-painter split (reference
// arena_window.ts, the queue-style window this one follows at a much smaller
// scale: one join/leave affordance plus the live queue size, gated to Card
// Adepts). The pure core (card_duel_window_view.ts) decides which state to
// show; this module renders it and wires the join/leave dispatch back through
// IWorld. It holds no Sim reference and reaches into Hud only through its deps.

import { audio } from '../game/audio';
import type { IWorld } from '../world_api';
import { buildCardDuelView, type CardDuelAction } from './card_duel_window_view';
import { markDialogRoot } from './dialog_root';
import { esc } from './esc';
import { formatNumber, t } from './i18n';
import { svgIcon } from './ui_icons';

export interface CardDuelWindowDeps {
  root(): HTMLElement;
  world(): IWorld;
  closeOthers(): void;
  captureFocus(): HTMLElement | null;
  restoreFocus(target: HTMLElement | null): void;
}

export class CardDuelWindow {
  private lastSig = '';
  private openerFocus: HTMLElement | null = null;

  constructor(private readonly deps: CardDuelWindowDeps) {}

  get isOpen(): boolean {
    return this.deps.root().style.display === 'block';
  }

  toggle(): void {
    if (this.isOpen) {
      this.close();
      return;
    }
    this.deps.closeOthers();
    this.openerFocus = this.deps.captureFocus();
    const root = this.deps.root();
    markDialogRoot(root, { labelledBy: 'card-duel-title' });
    root.style.display = 'block';
    this.lastSig = '';
    this.render();
    (root.querySelector('[data-close]') as HTMLElement | null)?.focus();
  }

  close(): void {
    const el = this.deps.root();
    if (el.style.display !== 'block') {
      this.openerFocus = null;
      return;
    }
    el.style.display = 'none';
    this.deps.restoreFocus(this.openerFocus);
    this.openerFocus = null;
  }

  // Re-localize the open window after an in-game language switch.
  relocalize(): void {
    if (!this.isOpen) return;
    this.lastSig = '';
    this.render();
  }

  render(): void {
    const world = this.deps.world();
    const el = this.deps.root();
    const view = buildCardDuelView({
      isCardAdept: world.cfg.playerClass === 'card_adept',
      info: world.cardDuelInfo(),
    });
    if (view.sig === this.lastSig) return;
    this.lastSig = view.sig;
    el.innerHTML = this.html(view.action);
    this.wire(el, view.action);
  }

  private wire(el: HTMLElement, action: CardDuelAction): void {
    el.querySelector('[data-close]')?.addEventListener('click', () => this.close());
    el.querySelector('[data-act="queue"]:not([disabled])')?.addEventListener('click', () => {
      this.deps.world().queueCardDuel(true);
      audio.click();
    });
    el.querySelector('[data-act="leave"]')?.addEventListener('click', () => {
      this.deps.world().queueCardDuel(false);
      audio.click();
    });
    void action;
  }

  private html(action: CardDuelAction): string {
    const title = `<div class="panel-title"><span id="card-duel-title">${esc(t('hud.cardDuel.title'))}</span><button type="button" class="x-btn" data-close aria-label="${esc(t('hud.cardDuel.close'))}">${svgIcon('close')}</button></div>`;
    let body: string;
    if (action.kind === 'not-eligible') {
      body = `<div class="cd-note">${esc(t('hud.cardDuel.notEligible'))}</div>`;
    } else if (action.kind === 'queued') {
      body =
        `<button class="btn leave" data-act="leave">${esc(t('hud.cardDuel.leaveQueue'))}</button>` +
        `<div class="cd-status">${esc(
          t('hud.cardDuel.searching', {
            count: formatNumber(action.queueSize, { maximumFractionDigits: 0 }),
          }),
        )}</div>`;
    } else {
      body =
        `<button class="btn" data-act="queue">${esc(t('hud.cardDuel.enterQueue'))}</button>` +
        `<div class="cd-note">${esc(t('hud.cardDuel.queueNote'))}</div>`;
    }
    return title + body;
  }
}
