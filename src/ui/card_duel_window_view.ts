// Pure, host-agnostic view model for the Card Duel matchmaking window.
//
// The pure-core half of the pure-core + thin-painter split (root CLAUDE.md
// Conventions; reference arena_window_view.ts, the queue-style window this one
// follows). Card Duel is a much smaller feature than the arena ladder: one
// join/leave affordance plus the live queue size, gated to Card Adepts. DOM/i18n
// free, so a Vitest exercises it directly against both a Sim-shaped and a
// ClientWorld-mirror-shaped `CardDuelInfo`.

import type { CardDuelInfo } from '../world_api';

/** The main action affordance for the current state. */
export type CardDuelAction =
  | { kind: 'not-eligible' }
  | { kind: 'queued'; queueSize: number }
  | { kind: 'idle' };

export interface CardDuelView {
  action: CardDuelAction;
  /** Identity of the rendered content; the painter skips a rebuild when equal. */
  sig: string;
}

export interface CardDuelViewInput {
  isCardAdept: boolean;
  info: CardDuelInfo;
}

/** Build the Card Duel window view-model. Only a Card Adept may queue; every
 *  other class sees the not-eligible note (the window itself is still reachable,
 *  it just cannot be used). */
export function buildCardDuelView(input: CardDuelViewInput): CardDuelView {
  const { isCardAdept, info } = input;
  let action: CardDuelAction;
  if (!isCardAdept) action = { kind: 'not-eligible' };
  else if (info.queued) action = { kind: 'queued', queueSize: info.queueSize };
  else action = { kind: 'idle' };

  return { action, sig: JSON.stringify([isCardAdept, info.queued, info.queueSize]) };
}
