// Thin painter for the Card Adept hand bar (#card-hand). The pure slot-state
// rules live in card_hand_view.ts; this turns that state into DOM, routing every
// write through the host's elided writers so a no-op frame costs no DOM
// mutation (the ActionBarPainter pattern: reference action_bar_painter.ts).
//
// Fixed at MAX_HAND_SIZE slots (card_hand.ts), instance-parameterized via the
// descriptor (the container plus per-slot element refs), so a second hand-style
// bar is a new descriptor, no code change. Click-to-play routes straight through
// IWorld.playCard(index): the server (or the offline Sim) is the sole authority
// on affordability/validity. An empty slot is inert (aria-disabled + CSS) and never
// fires onPlay, so an online client cannot blind-play a slot it cannot see.

import type { CardHandView } from './card_hand_view';
import type { PainterHostWriters } from './painter_host';

const CLASS_HIDDEN = 'hidden';
const CLASS_EMPTY = 'empty';
const CLASS_UNPLAYABLE = 'unplayable';
const BACKGROUND_IMAGE_PROP = 'background-image';

export interface CardHandSlotElements {
  btn: HTMLElement;
  costEl: HTMLElement;
}

export interface CardHandPaintDescriptor {
  container: HTMLElement;
  deckCountEl: HTMLElement;
  discardCountEl: HTMLElement;
  slots: readonly CardHandSlotElements[];
}

export class CardHandPainter {
  // One cached icon key per slot (the ability id backing each card), so the
  // background-image resolve + write only fires when a slot's card changes.
  private readonly lastIcon: (string | null)[];
  // Whether each slot currently holds a card. The click handler reads this so a
  // click on an empty (disabled) slot is a no-op even though the listener is bound
  // once at construction.
  private readonly filled: boolean[];

  constructor(
    private readonly writers: PainterHostWriters,
    private readonly descriptor: CardHandPaintDescriptor,
    // Returns a full `url(...)` value for a card's ability icon (mirrors the
    // action_bar_painter family, which also carries the url(...) in the closure).
    private readonly resolveBackgroundImage: (abilityId: string) => string,
    // Localized display name for a card's referenced ability, used as the button's
    // accessible name and tooltip (cards that alias one ability share a name).
    private readonly resolveName: (abilityId: string) => string,
    // Localized "empty card slot" accessible name for a slot with no card.
    private readonly emptyLabel: string,
    private readonly onPlay: (index: number) => void,
  ) {
    this.lastIcon = descriptor.slots.map(() => null);
    this.filled = descriptor.slots.map(() => false);
    descriptor.slots.forEach((s, i) => {
      s.btn.addEventListener('click', () => {
        if (this.filled[i]) this.onPlay(i);
      });
    });
  }

  paint(view: CardHandView): void {
    this.writers.toggleClass(this.descriptor.container, CLASS_HIDDEN, !view.visible);
    if (!view.visible) return;

    this.writers.setText(this.descriptor.deckCountEl, String(view.deckCount));
    this.writers.setText(this.descriptor.discardCountEl, String(view.discardCount));

    const slots = this.descriptor.slots;
    for (let i = 0; i < slots.length; i++) {
      const el = slots[i];
      const card = view.slots[i] ?? null;

      if (!card) {
        this.filled[i] = false;
        this.writers.toggleClass(el.btn, CLASS_EMPTY, true);
        this.writers.toggleClass(el.btn, CLASS_UNPLAYABLE, false);
        // aria-disabled + the CSS pointer-events:none on .empty (plus the click
        // guard above) make an empty slot inert; it also gets a real accessible
        // name so it never announces as an unnamed button (axe button-name).
        this.writers.setAttr(el.btn, 'aria-disabled', 'true');
        this.writers.setAttr(el.btn, 'aria-label', this.emptyLabel);
        this.writers.setAttr(el.btn, 'title', this.emptyLabel);
        if (this.lastIcon[i] !== null) {
          this.lastIcon[i] = null;
          this.writers.setStyleProp(el.btn, BACKGROUND_IMAGE_PROP, '');
        }
        this.writers.setText(el.costEl, '');
        continue;
      }

      this.filled[i] = true;
      this.writers.toggleClass(el.btn, CLASS_EMPTY, false);
      this.writers.toggleClass(el.btn, CLASS_UNPLAYABLE, !card.playable);
      this.writers.setText(el.costEl, String(card.cost));
      // A filled slot is a live control: name it by its card so it no longer
      // announces as a bare number.
      this.writers.setAttr(el.btn, 'aria-disabled', 'false');
      const name = this.resolveName(card.effectAbilityId);
      this.writers.setAttr(el.btn, 'aria-label', name);
      this.writers.setAttr(el.btn, 'title', name);

      if (this.lastIcon[i] !== card.effectAbilityId) {
        this.lastIcon[i] = card.effectAbilityId;
        // The resolver already returns a full `url(...)` value (mirrors the
        // action_bar_painter family), so write it directly: wrapping it again
        // yields `url(url(...))`, which browsers drop.
        this.writers.setStyleProp(
          el.btn,
          BACKGROUND_IMAGE_PROP,
          this.resolveBackgroundImage(card.effectAbilityId),
        );
      }
    }
  }
}
