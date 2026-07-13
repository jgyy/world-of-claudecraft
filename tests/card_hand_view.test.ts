import { describe, expect, it } from 'vitest';
import { buildCardHandView } from '../src/ui/card_hand_view';

describe('card_hand_view', () => {
  it('is hidden for non-Card-Adept players', () => {
    const view = buildCardHandView({
      isCardAdept: false,
      handIds: ['card_arcane_bolt'],
      deckCount: 5,
      discardCount: 1,
      focus: 100,
    });
    expect(view.visible).toBe(false);
    expect(view.slots).toEqual([]);
  });

  it('marks cards playable only when Focus covers their cost', () => {
    const view = buildCardHandView({
      isCardAdept: true,
      handIds: ['card_quickstrike', 'card_royal_flush'], // cost 20 and 80
      deckCount: 10,
      discardCount: 2,
      focus: 50,
    });
    expect(view.visible).toBe(true);
    expect(view.slots).toHaveLength(2);
    const byId = Object.fromEntries(view.slots.map((s) => [s.id, s]));
    expect(byId.card_quickstrike.playable).toBe(true);
    expect(byId.card_royal_flush.playable).toBe(false);
    expect(view.deckCount).toBe(10);
    expect(view.discardCount).toBe(2);
  });

  it('drops unknown card ids and clamps negative counts', () => {
    const view = buildCardHandView({
      isCardAdept: true,
      handIds: ['card_quickstrike', 'not_a_real_card'],
      deckCount: -3,
      discardCount: -1,
      focus: 100,
    });
    expect(view.slots).toHaveLength(1);
    expect(view.slots[0].effectAbilityId).toBe('ca_quickstrike');
    expect(view.deckCount).toBe(0);
    expect(view.discardCount).toBe(0);
  });
});
