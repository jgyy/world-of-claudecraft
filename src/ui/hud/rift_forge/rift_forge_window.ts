// The Rift Forge window: the Riftwright's service (upgrade / enchant / socket
// a Riftbound band) as a thin cold painter over rift_forge_view.ts. Opened by
// the sim's riftForge interaction event, never a menu button: the forge lives
// in the world (the guild board / bank shape), and the sim refuses every forge
// command away from the NPC (src/sim/rift/forge_gate.ts), so the window only
// ever shows what the player can actually do from where they stand.
//
// Every action crosses the IWorld seam and AWAITS its outcome: the offline Sim
// answers with the RiftForgeResult itself, the online mirror with the
// commandOutcome ack (false when the realm closed the forge or the sim
// refused). The window re-renders on every outcome and on every
// riftForgeResult event the Hud forwards (onResult), turning the structured
// reason into its localized status line; a refusal is never silent.
//
// Cold painter contract (src/ui/CLAUDE.md): no layout reads, no driver of its
// own; the row list rebuilds whole on render and rewires its buttons.

import type { RiftGemId } from '../../../sim/content/rift/items';
import { ITEMS } from '../../../sim/data';
import type { ItemDef, ItemInstancePayload, SimEvent } from '../../../sim/types';
import type { IWorld } from '../../../world_api';
import { markDialogRoot } from '../../dialog_root';
import { npcGreeting } from '../../entity_display_labels';
import { itemDisplayName } from '../../entity_i18n';
import { esc } from '../../esc';
import { formatNumber, type TranslationKey, t } from '../../i18n';
import { iconDataUrl } from '../../icons';
import { itemStatName } from '../../item_instance_tooltip';
import { itemNameColor } from '../../item_name_color';
import { svgIcon } from '../../ui_icons';
import { buildRiftForgeView, type RiftForgeRingRow } from './rift_forge_view';

export interface RiftForgeWindowDeps {
  root(): HTMLElement;
  world(): IWorld;
  closeOthers(): void;
  captureFocus(): HTMLElement | null;
  restoreFocus(target: HTMLElement | null): void;
  onVisibilityChange?(): void;
  /** The shared item tooltip (the PainterHostPresentation pair), so a band's
   *  hover shows the same rift lines the bags show. */
  itemTooltip(item: ItemDef, instance?: ItemInstancePayload): string;
  attachTooltip(el: HTMLElement, html: () => string): void;
}

type ForgeResultEvent = Extract<SimEvent, { type: 'riftForgeResult' }>;
type ForgeReason = NonNullable<ForgeResultEvent['reason']>;

const REASON_KEYS: Record<ForgeReason, TranslationKey> = {
  not_found: 'hudChrome.riftForge.reason.notFound',
  not_rift_gear: 'hudChrome.riftForge.reason.notRiftGear',
  max_upgrade: 'hudChrome.riftForge.reason.maxUpgrade',
  insufficient_essence: 'hudChrome.riftForge.reason.insufficientEssence',
  invalid_stat: 'hudChrome.riftForge.reason.invalidStat',
  invalid_gem: 'hudChrome.riftForge.reason.invalidGem',
  sockets_full: 'hudChrome.riftForge.reason.socketsFull',
  dead: 'hudChrome.riftForge.reason.dead',
  too_far: 'hudChrome.riftForge.reason.tooFar',
};

const ACTION_DONE_KEYS: Record<ForgeResultEvent['action'], TranslationKey> = {
  upgrade: 'hudChrome.riftForge.done.upgrade',
  enchant: 'hudChrome.riftForge.done.enchant',
  socket: 'hudChrome.riftForge.done.socket',
};

const n = (value: number) => formatNumber(value, { maximumFractionDigits: 0 });

/** The Riftwright (content/farshore.ts): the greeting the window quotes. */
const RIFT_FORGE_NPC_ID = 'riftwright_maelis';
/** How long a click may hold the row controls waiting for its result event. */
const BUSY_BACKSTOP_MS = 6000;

export class RiftForgeWindow {
  private openerFocus: HTMLElement | null = null;
  /** The last outcome's localized status line (null = nothing to say). */
  private status: { text: string; error: boolean } | null = null;
  /** Serializes an in-flight action so a double click cannot spend twice.
   *  Held from the click until the riftForgeResult event lands (online the
   *  ack arrives a broadcast BEFORE the mutated bags do, so releasing on the
   *  ack alone would re-enable a button over stale rows), with a timer
   *  backstop for an event that never comes. */
  private busy = false;
  private busyTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly deps: RiftForgeWindowDeps) {}

  get isOpen(): boolean {
    return this.deps.root().style.display === 'flex';
  }

  open(): void {
    if (this.isOpen) {
      this.render();
      return;
    }
    this.openerFocus = this.deps.captureFocus();
    this.deps.closeOthers();
    this.status = null;
    this.deps.root().style.display = 'flex';
    this.deps.onVisibilityChange?.();
    this.render();
    (this.deps.root().querySelector('[data-close]') as HTMLElement | null)?.focus();
  }

  close(): void {
    const el = this.deps.root();
    this.releaseBusy();
    if (el.style.display !== 'flex') {
      this.openerFocus = null;
      return;
    }
    el.style.display = 'none';
    this.deps.restoreFocus(this.openerFocus);
    this.openerFocus = null;
    this.deps.onVisibilityChange?.();
  }

  /** Re-localize after an in-game language switch (the Hud fan-out). */
  relocalize(): void {
    this.status = null;
    if (this.isOpen) this.render();
  }

  /** A riftForgeResult event for this player: the sim's structured verdict
   *  becomes the status line, and the rows re-read the mutated payload. */
  onResult(ev: ForgeResultEvent): void {
    this.releaseBusy();
    if (!this.isOpen) return;
    const item = ITEMS[ev.itemId];
    const name = item ? itemDisplayName(item) : ev.itemId;
    const reasonKey = ev.reason ? REASON_KEYS[ev.reason] : 'hudChrome.riftForge.refused';
    this.status = ev.ok
      ? { text: t(ACTION_DONE_KEYS[ev.action], { name }), error: false }
      : { text: t(reasonKey), error: true };
    this.render();
  }

  private releaseBusy(): void {
    this.busy = false;
    if (this.busyTimer !== null) clearTimeout(this.busyTimer);
    this.busyTimer = null;
  }

  render(): void {
    const el = this.deps.root();
    const world = this.deps.world();
    markDialogRoot(el, { labelledBy: 'rift-forge-title' });
    const view = buildRiftForgeView({
      inventory: world.inventory,
      equipment: world.equipment,
      equipmentInstances: world.equipmentInstances,
    });
    const gems = view.gems
      .map(
        (g) =>
          `<span class="rf-currency">${this.iconHtml(ITEMS[g.id])}${esc(
            t('hudChrome.riftForge.currency', { name: this.itemName(g.id), count: n(g.count) }),
          )}</span>`,
      )
      .join('');
    const essence = `<span class="rf-currency">${this.iconHtml(ITEMS.rift_essence)}${esc(
      t('hudChrome.riftForge.currency', {
        name: this.itemName('rift_essence'),
        count: n(view.essence),
      }),
    )}</span>`;
    const rows =
      view.rings.length === 0
        ? `<div class="lb-empty">${esc(t('hudChrome.riftForge.empty'))}</div>`
        : view.rings.map((r, i) => this.rowHtml(r, i, view.enchantStats)).join('');
    const status = this.status
      ? `<div class="rf-status${this.status.error ? ' rf-status-error' : ''}" role="${this.status.error ? 'alert' : 'status'}">${esc(this.status.text)}</div>`
      : '<div class="rf-status" role="status"></div>';
    // The Riftwright's own greeting: the interact path opens this window
    // instead of the gossip dialog, so the line is spoken here.
    const greeting = `<div class="rf-greeting">${esc(
      npcGreeting(RIFT_FORGE_NPC_ID, world.cfg.playerClass, world.player.name),
    )}</div>`;
    el.innerHTML =
      `<div class="panel-title"><span id="rift-forge-title">${esc(t('hudChrome.riftForge.title'))} ` +
      `<span class="lb-subtitle">${esc(t('hudChrome.riftForge.subtitle'))}</span></span>` +
      `<button type="button" class="x-btn" data-close aria-label="${esc(t('hudChrome.leaderboard.close'))}">${svgIcon('close')}</button></div>` +
      greeting +
      `<div class="rf-wallet">${essence}${gems}</div>` +
      `<div class="rf-body window-fill" role="region" aria-labelledby="rift-forge-title">${rows}</div>` +
      status;
    el.querySelector('[data-close]')?.addEventListener('click', () => this.close());
    this.wire(el, view.rings);
  }

  // ---------------------------------------------------------------------

  private itemName(itemId: string): string {
    const item = ITEMS[itemId];
    return item ? itemDisplayName(item) : itemId;
  }

  private iconHtml(item: ItemDef | undefined): string {
    if (!item) return '';
    return `<img class="rf-icon" src="${iconDataUrl('item', item.id)}" alt="" />`;
  }

  private rowHtml(r: RiftForgeRingRow, index: number, enchantStats: readonly string[]): string {
    const item = ITEMS[r.itemId];
    const name = item ? itemDisplayName(item) : r.itemId;
    const color = item ? ` style="color:${itemNameColor(item)}"` : '';
    const tier = esc(t('hudChrome.itemTooltip.riftTier', { tier: r.tier }));
    const enchantNow = r.enchant
      ? esc(
          t('hudChrome.riftForge.enchantCurrent', {
            value: n(r.enchant.value),
            stat: itemStatName(r.enchant.stat),
          }),
        )
      : esc(t('hudChrome.riftForge.enchantNone'));
    const gemsNow = r.gems.length
      ? r.gems.map((g) => this.iconHtml(ITEMS[g])).join('')
      : esc(t('hudChrome.riftForge.socketsNone'));
    const head =
      `<div class="rf-ring-head"><span class="rf-ring-name" data-ring-tip="${index}"${color}>${this.iconHtml(item)}${esc(name)}</span>` +
      `<span class="rf-ring-tier">${tier}</span></div>`;
    if (r.worn) {
      return `<div class="rf-ring rf-ring-worn">${head}<div class="rf-hint">${esc(t('hudChrome.riftForge.wornHint'))}</div></div>`;
    }
    const upgradeLabel = esc(
      t('hudChrome.itemTooltip.riftUpgrade', {
        level: n(r.upgradeLevel),
        max: n(r.maxUpgradeLevel),
      }),
    );
    const off = (ok: boolean) => (ok && !this.busy ? '' : ' disabled');
    const upgradeBtn =
      r.nextUpgradeCost === null
        ? `<span class="rf-max">${esc(t('hudChrome.riftForge.upgradeMax'))}</span>`
        : `<button type="button" class="rf-btn" data-upgrade="${index}"${off(r.canUpgrade)}>${esc(
            t('hudChrome.riftForge.upgradeBtn', { cost: n(r.nextUpgradeCost) }),
          )}</button>`;
    const statOptions = enchantStats
      .map(
        (s) =>
          `<option value="${esc(s)}"${r.enchant?.stat === s ? ' selected' : ''}>${esc(itemStatName(s))}</option>`,
      )
      .join('');
    const enchantLine =
      `<div class="rf-line"><span class="rf-line-label">${enchantNow}</span>` +
      `<select class="rf-select" data-stat="${index}" aria-label="${esc(t('hudChrome.riftForge.statPickAria'))}">${statOptions}</select>` +
      `<button type="button" class="rf-btn" data-enchant="${index}"${off(r.canEnchant)}>${esc(
        t('hudChrome.riftForge.enchantBtn', { cost: n(r.enchantCost) }),
      )}</button></div>`;
    const socketsLabel = esc(
      t('hudChrome.itemTooltip.riftSockets', { used: n(r.gems.length), total: n(r.gemSlots) }),
    );
    const gemOptions = r.socketable
      .map((g) => `<option value="${esc(g)}">${esc(this.itemName(g))}</option>`)
      .join('');
    const socketControls =
      r.gems.length >= r.gemSlots
        ? `<span class="rf-max">${esc(t('hudChrome.riftForge.socketsFull'))}</span>`
        : r.socketable.length === 0
          ? `<span class="rf-max">${esc(t('hudChrome.riftForge.noGems'))}</span>`
          : `<select class="rf-select" data-gem="${index}" aria-label="${esc(t('hudChrome.riftForge.gemPickAria'))}">${gemOptions}</select>` +
            `<button type="button" class="rf-btn" data-socket="${index}"${off(true)}>${esc(t('hudChrome.riftForge.socketBtn'))}</button>`;
    const socketLine = `<div class="rf-line"><span class="rf-line-label">${socketsLabel} <span class="rf-gems">${gemsNow}</span></span>${socketControls}</div>`;
    const upgradeLine = `<div class="rf-line"><span class="rf-line-label">${upgradeLabel}</span>${upgradeBtn}</div>`;
    return `<div class="rf-ring">${head}${upgradeLine}${enchantLine}${socketLine}</div>`;
  }

  private wire(el: HTMLElement, rings: RiftForgeRingRow[]): void {
    const ringAt = (raw: string | undefined) => rings[Number(raw)];
    el.querySelectorAll<HTMLElement>('[data-ring-tip]').forEach((span) => {
      const r = ringAt(span.dataset.ringTip);
      const item = r ? ITEMS[r.itemId] : undefined;
      if (r && item) this.deps.attachTooltip(span, () => this.deps.itemTooltip(item, r.instance));
    });
    el.querySelectorAll<HTMLButtonElement>('[data-upgrade]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const r = ringAt(btn.dataset.upgrade);
        if (r?.source.kind === 'bag')
          void this.act(
            this.deps.world().upgradeRiftItem(r.itemId, { slotIndex: r.source.slotIndex }),
          );
      });
    });
    el.querySelectorAll<HTMLButtonElement>('[data-enchant]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const r = ringAt(btn.dataset.enchant);
        const pick = el.querySelector<HTMLSelectElement>(`[data-stat="${btn.dataset.enchant}"]`);
        if (r?.source.kind === 'bag' && pick)
          void this.act(
            this.deps
              .world()
              .enchantRiftItem(r.itemId, pick.value, { slotIndex: r.source.slotIndex }),
          );
      });
    });
    el.querySelectorAll<HTMLButtonElement>('[data-socket]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const r = ringAt(btn.dataset.socket);
        const pick = el.querySelector<HTMLSelectElement>(`[data-gem="${btn.dataset.socket}"]`);
        if (r?.source.kind === 'bag' && pick)
          void this.act(
            this.deps.world().socketRiftGem(r.itemId, pick.value as RiftGemId, {
              slotIndex: r.source.slotIndex,
            }),
          );
      });
    });
  }

  /** Await one forge outcome. A `false` ack with no event behind it (the
   *  realm closed the forge, or the ack timed out) still gets a visible line:
   *  the doc's "never pure silence" rule for this trio. A truthy outcome keeps
   *  the controls held until onResult re-reads the mutated payload. */
  private async act(outcome: ReturnType<IWorld['upgradeRiftItem']>): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    this.busyTimer = setTimeout(() => {
      this.releaseBusy();
      if (this.isOpen) this.render();
    }, BUSY_BACKSTOP_MS);
    if (this.isOpen) this.render();
    let result: Awaited<typeof outcome> | false = false;
    try {
      result = await outcome;
    } catch {
      result = false;
    }
    if (result === false) {
      this.releaseBusy();
      this.status = { text: t('hudChrome.riftForge.refused'), error: true };
    }
    if (this.isOpen) this.render();
  }
}
