// Thin painter for the Card Adept hand bar (#card-hand). The pure slot-state
// rules live in card_hand_view.ts; this turns that state into DOM, routing every
// write through the host's elided writers so a no-op frame costs no DOM
// mutation (the ActionBarPainter pattern: reference action_bar_painter.ts).
//
// Fixed at MAX_HAND_SIZE slots (card_hand.ts), instance-parameterized via the
// descriptor (the container plus per-slot element refs), so a second hand-style
// bar is a new descriptor, no code change. Click-to-play routes straight through
// IWorld.playCard(index): the server (or the offline Sim) is the sole authority
// on affordability/validity, this painter only disables the button as a UX hint.

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

  constructor(
    private readonly writers: PainterHostWriters,
    private readonly descriptor: CardHandPaintDescriptor,
    private readonly resolveBackgroundImage: (abilityId: string) => string,
    private readonly onPlay: (index: number) => void,
  ) {
    this.lastIcon = descriptor.slots.map(() => null);
    descriptor.slots.forEach((s, i) => {
      s.btn.addEventListener('click', () => this.onPlay(i));
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
        this.writers.toggleClass(el.btn, CLASS_EMPTY, true);
        this.writers.toggleClass(el.btn, CLASS_UNPLAYABLE, false);
        if (this.lastIcon[i] !== null) {
          this.lastIcon[i] = null;
          this.writers.setStyleProp(el.btn, BACKGROUND_IMAGE_PROP, '');
        }
        this.writers.setText(el.costEl, '');
        continue;
      }

      this.writers.toggleClass(el.btn, CLASS_EMPTY, false);
      this.writers.toggleClass(el.btn, CLASS_UNPLAYABLE, !card.playable);
      this.writers.setText(el.costEl, String(card.cost));

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
