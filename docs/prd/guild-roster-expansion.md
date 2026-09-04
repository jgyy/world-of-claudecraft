# Guild Roster Expansion

Status: implemented for release/v0.42.0. Owner ask captured 2026-09-04: Guild
Masters can buy a larger guild for gold, 20 gold for the first 20 seats, scaling
from there, with 500 seats costing a ridiculous amount.

## Why

Every guild seats 100 members from its founding, and nothing a guild does can
change that. A guild that outgrows the base roster has to turn people away or
split, which is the opposite of what a guild is for. Expansion turns the cap
into a goal: a gold sink that only the guilds with the most players ever pay,
scaled so that the last seats are a realm-notable achievement.

## The angle: charter pages

The roster grows in 20-seat PAGES, bought one at a time by the Guild Master.
Page `n` (1-based) costs `20 gold x n squared`, so every seat on page `n` costs
`n squared` gold: the first extra seat costs a gold, the last one costs four
hundred.

| Page | Seats after | Page price | Cumulative |
| ---- | ----------- | ---------- | ---------- |
| 1    | 120         | 20g        | 20g        |
| 2    | 140         | 80g        | 100g       |
| 3    | 160         | 180g       | 280g       |
| 5    | 200         | 500g       | 1,100g     |
| 10   | 300         | 2,000g     | 7,700g     |
| 15   | 400         | 4,500g     | 24,800g    |
| 20   | 500         | 8,000g     | 57,400g    |

Why a square rather than the doubling the bank ladders use: doubling every rung
from 20 gold reaches ten million gold by page 20, and doubling every second rung
makes 300 seats almost free (about 1,500 gold) while the last hundred seats cost
forty thousand. The square keeps the early pages within reach of a guild that has
just outgrown 100 members (200 seats for 1,100 gold total) and still makes the
full charter the largest single gold sink in the game (the priciest existing
rung anywhere is 120 gold). The whole table is one data-as-code constant
(`GUILD_ROSTER_PAGE_PRICES` in `src/sim/guild_roster.ts`), so the curve is a
one-table change; `tests/guild_roster.test.ts` pins the formula and the totals.

## Who pays, and from where

The Guild Master pays from their OWN purse, the guild creation fee precedent.
Not the treasury, deliberately: the roster lives in the server social DB, and a
treasury-paid page would have to run through the guild bank's escrow ledger
(op log, replay, audit) for a mutation the bank never sees. A guild that wants
to pool gold withdraws it from the treasury to the Guild Master first, which the
bank already supports.

The flow is reserve-at-gate, like the creation fee:

1. The service reads the guild row (`guildMembership` carries `rosterPages`)
   and prices the NEXT page from the ladder by pages already bought. The
   client-shown price is never trusted.
2. The purse is charged synchronously through the live sim BEFORE the DB write
   (`chargeGuildRosterPage`). A short purse is refunded and refused with the
   price.
3. The page is bought with a compare-and-set on `guilds.roster_pages`
   (`buyGuildRosterPage`) that also re-checks the buyer still holds the
   leader rank: a double-click, a second client, or a demotion racing the
   purchase pays for one page at most; the loser is refunded and told to
   retry from the fresh price. The stored count is compared floored, the same
   load path the price came from, so a tampered negative column cannot turn
   into a charge-and-refund loop.
4. On commit the transport persists the charged purse now
   (`server/guild_roster_transport.ts`), is loud if the save cannot become
   durable, and writes one audit line naming the guild, the page, the buyer,
   and the copper. Every online member sees the success line; the snapshot
   re-pushes with the new cap.

Every refusal is a code the client localizes (`guildRosterResult`, the
billboard convention), never server English.

## Where the cap is enforced

The cap is per guild: `guildRosterCap(rosterPages)`. The invite gate reads it
from the membership row; the atomic seat (`addGuildMemberAtomic`) reads
`roster_pages` from the guild row under the same `FOR UPDATE` lock as the seat,
so a page landing between a caller's snapshot and the seat is honoured and no
caller-supplied limit exists any more. The admin backoffice pages the roster at
the absolute ceiling (`GUILD_ROSTER_MAX_MEMBERS`, 500) and bounds the rename
fan-out by it.

## What the player sees

The Guild tab shows the roster count against the guild's cap ("37 of 100
seats"). The Guild Master sees an "Expand roster (+20 seats for 20g)" button in
the tab footer that opens the shared confirm prompt (the gold is theirs and is
not refunded); once the ladder is complete the button reads "The roster is at
its largest size" and is disabled. Everyone else sees only the count.

## Follow-ups (not in the first change)

- Admin dashboard: surface the bought cap on the guild detail page.
- A treasury-paid option, if wanted, needs a guild bank ledger op and belongs
  in a guild bank phase.
- The world map's label-sprite budget was raised to cover a 500-seat guild
  entirely online (`TEXT_SPRITE_LIMIT`); measure on low-end mobile if such a
  guild ever exists.
