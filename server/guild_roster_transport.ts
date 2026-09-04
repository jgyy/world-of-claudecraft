// The purse half of guild roster expansion (docs/prd/guild-roster-expansion.md),
// as the SocialTransport methods GameServer spreads into its transport object.
// A sibling of game.ts on purpose: the three bodies need only the live
// SimContext, a character-to-pid lookup, and the character save, so they
// live here behind a deps bag and stay unit-testable without a socket or a
// database (tests/guild_roster_transport.test.ts).
//
// The service (server/social.ts guildBuyRosterPage) prices the page from the
// guild row and drives the reserve-at-gate flow; this module only moves
// copper on the LIVE purse and makes the successful charge durable.

import { chargeGuildRosterPage, refundGuildRosterPage } from '../src/sim/guild_roster';
import type { SimContext } from '../src/sim/sim_context';
import type { SocialTransport } from './social';

export interface GuildRosterTransportDeps {
  ctx: SimContext;
  /** The live entity id of a character's session, or null while offline. */
  pidOf(characterId: number): number | null;
  /** Persist the character's live state now (the game's saveCharacter),
   *  resolving to whether the write became durable. Null-session callers
   *  never reach this: pidOf gated them out at the charge. */
  persistCharacter(characterId: number): Promise<boolean>;
}

export type GuildRosterTransport = Pick<
  SocialTransport,
  'chargePurse' | 'refundPurse' | 'onGuildRosterExpanded'
>;

export function guildRosterTransport(deps: GuildRosterTransportDeps): GuildRosterTransport {
  return {
    chargePurse: (characterId, copper) => {
      const pid = deps.pidOf(characterId);
      return pid === null ? 0 : chargeGuildRosterPage(deps.ctx, pid, copper);
    },
    refundPurse: (characterId, copper) => {
      const pid = deps.pidOf(characterId);
      const refunded = pid === null ? 0 : refundGuildRosterPage(deps.ctx, pid, copper);
      if (refunded !== copper) {
        // A refusal racing a logout: the live purse is gone, so the reserved
        // copper cannot be returned here. Loud, for operator compensation.
        console.error(
          `guild roster page refund could not be applied for character ${characterId}: reserved ${copper}, refunded ${refunded}; operator compensation needed`,
        );
      }
      return refunded;
    },
    onGuildRosterExpanded: (characterId, guildId, pages, copper) => {
      // The audit line: the guild row already holds the page count, and this
      // pairs it with who paid and how much.
      console.info(
        `guild ${guildId} roster page ${pages} bought by character ${characterId} for ${copper} copper`,
      );
      // The deduction sits in the live purse and would ride the next autosave
      // anyway; persisting now closes the window in which a crash leaves the
      // page bought and the purse unpaid. A save that does not become durable
      // (a fenced-out session) is the one arm that cannot self-heal, so it is
      // logged loudly rather than silently accepted.
      void deps
        .persistCharacter(characterId)
        .then((durable) => {
          if (!durable) {
            console.error(
              `guild roster page ${pages} for guild ${guildId} did not become durable for character ${characterId}: ${copper} copper may be uncollected`,
            );
          }
        })
        .catch((err) => {
          console.error(
            `guild roster page ${pages} for guild ${guildId}: purse save failed for character ${characterId}:`,
            err,
          );
        });
    },
  };
}
