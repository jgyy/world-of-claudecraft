import { describe, expect, it, vi } from 'vitest';
import { CardHandPainter } from '../src/ui/card_hand_painter';
import type { CardHandView } from '../src/ui/card_hand_view';
import type { PainterHostWriters } from '../src/ui/painter_host';

// A minimal fake element: the painter only ever calls addEventListener on the
// slot buttons; every read/write goes through the injected writers stub.
function fakeEl(): HTMLElement {
  return { addEventListener: vi.fn() } as unknown as HTMLElement;
}

// A capturing writers stub: it records every style-prop write so the test can
// assert on the background-image value the painter produced.
function captureWriters(styleWrites: { prop: string; value: string }[]): PainterHostWriters {
  return {
    setText: vi.fn(),
    setDisplay: vi.fn(),
    setTransform: vi.fn(),
    setWidth: vi.fn(),
    setStyleProp: vi.fn((_el: HTMLElement, prop: string, value: string) => {
      styleWrites.push({ prop, value });
    }),
    toggleClass: vi.fn(),
    setAttr: vi.fn(),
  } as unknown as PainterHostWriters;
}

function makePainter(styleWrites: { prop: string; value: string }[]) {
  const slots = [0, 1].map(() => ({ btn: fakeEl(), costEl: fakeEl() }));
  const onPlay = vi.fn();
  const painter = new CardHandPainter(
    captureWriters(styleWrites),
    {
      container: fakeEl(),
      deckCountEl: fakeEl(),
      discardCountEl: fakeEl(),
      slots,
    },
    // Resolver returns a full url(...) value, exactly like the hud wiring.
    (abilityId) => `url(data:image/png;base64,ICON_${abilityId})`,
    (abilityId) => `Name of ${abilityId}`,
    'Empty card slot',
    onPlay,
  );
  return { painter, slots, onPlay };
}

const filledView: CardHandView = {
  visible: true,
  deckCount: 3,
  discardCount: 1,
  slots: [
    { id: 'card_a', effectAbilityId: 'ca_arcane_bolt', cost: 40, rarity: 'common', playable: true },
  ],
};

describe('card_hand_painter', () => {
  it('writes the background-image WITHOUT a double url() wrap', () => {
    const writes: { prop: string; value: string }[] = [];
    const { painter } = makePainter(writes);
    painter.paint(filledView);
    const bg = writes.find((w) => w.prop === 'background-image');
    expect(bg).toBeDefined();
    // The regression this guards: url(url(data:...)) which every browser drops.
    expect(bg?.value).not.toContain('url(url(');
    expect(bg?.value).toBe('url(data:image/png;base64,ICON_ca_arcane_bolt)');
  });

  it('ignores clicks on an empty slot and routes a filled slot to onPlay', () => {
    const writes: { prop: string; value: string }[] = [];
    const { painter, slots, onPlay } = makePainter(writes);
    painter.paint(filledView); // slot 0 filled, slot 1 empty
    // Recover the click handlers bound in the constructor.
    const click = (i: number) =>
      (
        slots[i].btn.addEventListener as unknown as { mock: { calls: [string, () => void][] } }
      ).mock.calls[0][1]();
    click(1); // empty slot: no-op
    expect(onPlay).not.toHaveBeenCalled();
    click(0); // filled slot: plays index 0
    expect(onPlay).toHaveBeenCalledWith(0);
  });
});
