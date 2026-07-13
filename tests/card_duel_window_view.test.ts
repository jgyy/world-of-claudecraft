import { describe, expect, it } from 'vitest';
import { buildCardDuelView } from '../src/ui/card_duel_window_view';

describe('card_duel_window_view', () => {
  it('reports not-eligible for a non-Card-Adept regardless of queue state', () => {
    const view = buildCardDuelView({
      isCardAdept: false,
      info: { queued: true, queueSize: 3 },
    });
    expect(view.action).toEqual({ kind: 'not-eligible' });
  });

  it('reports idle for a Card Adept not yet queued', () => {
    const view = buildCardDuelView({
      isCardAdept: true,
      info: { queued: false, queueSize: 0 },
    });
    expect(view.action).toEqual({ kind: 'idle' });
  });

  it('reports queued with the live queue size for a queued Card Adept', () => {
    const view = buildCardDuelView({
      isCardAdept: true,
      info: { queued: true, queueSize: 2 },
    });
    expect(view.action).toEqual({ kind: 'queued', queueSize: 2 });
  });

  it('changes sig when the queue state changes, holds steady otherwise', () => {
    const a = buildCardDuelView({ isCardAdept: true, info: { queued: false, queueSize: 0 } });
    const b = buildCardDuelView({ isCardAdept: true, info: { queued: false, queueSize: 0 } });
    const c = buildCardDuelView({ isCardAdept: true, info: { queued: true, queueSize: 1 } });
    expect(a.sig).toBe(b.sig);
    expect(a.sig).not.toBe(c.sig);
  });
});
