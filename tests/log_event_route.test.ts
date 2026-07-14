// src/ui/log_event_route.ts: which chat pane a 'log' SimEvent belongs in. Mob/boss
// combat-flavor chatter (entityId-anchored) goes to the Combat Log tab, not
// General/Chat; genuine chat/system notices (pid-only or anchorless) stay in
// General/Chat.

import { describe, expect, it } from 'vitest';
import { isCombatFlavorLog } from '../src/ui/log_event_route';

describe('isCombatFlavorLog', () => {
  it('routes an entityId-anchored line (mob/boss combat flavor text) to Combat Log', () => {
    expect(isCombatFlavorLog(42)).toBe(true);
  });

  it('keeps an anchorless line (e.g. a world boss spawn broadcast) in General/Chat', () => {
    expect(isCombatFlavorLog(undefined)).toBe(false);
  });
});
