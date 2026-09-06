// The portal toll (PortalDef.tollCopper): the one coin-taking step of an
// overworld crossing, settled BEFORE portals.ts moves anyone. A traveler who
// can pay is charged and waved through; one who cannot is refused once per
// approach (Entity.portalHoldId latches the refusal until they step out of
// the trigger, portals.ts clears it) and never moved, so standing in a dark
// waystone costs nothing and spams nothing. A portal without a toll is the
// Duskfall cave: always open.
//
// Draws ZERO rng and touches only the player's own purse, so it runs
// byte-identically in the offline browser, the server, and the headless env.

import type { SimContext } from './sim_context';
import type { Entity, PortalDef } from './types';

export const PORTAL_TOLL_REFUSAL = 'Not enough money.';

/** Whether `p` may cross `portal` right now. Charges the toll when it can be
 *  paid; emits the refusal (once per approach) when it cannot. */
export function settlePortalToll(ctx: SimContext, p: Entity, portal: PortalDef): boolean {
  const toll = portal.tollCopper ?? 0;
  if (toll <= 0) return true;
  const meta = ctx.players.get(p.id);
  if (!meta) return false;
  if (meta.copper < toll) {
    if (p.portalHoldId !== portal.id) {
      p.portalHoldId = portal.id;
      ctx.error(p.id, portal.tollText ?? PORTAL_TOLL_REFUSAL);
    }
    return false;
  }
  meta.copper -= toll;
  return true;
}
