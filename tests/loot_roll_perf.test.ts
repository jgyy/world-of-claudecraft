import { describe, expect, it } from 'vitest';
import { MOBS } from '../src/sim/data';
import { createMob } from '../src/sim/entity';
import { hasSharedLootRights, LOOT_FFA_DELAY, lootHasGoneFfa } from '../src/sim/loot/loot_ffa';
import { awardSharedLootItem, submitLootRoll } from '../src/sim/loot/loot_roll';
import type { PlayerMeta } from '../src/sim/sim';
import { Sim } from '../src/sim/sim';
import type { Entity } from '../src/sim/types';

const WORLD_SEED = 20065;

// Regression coverage gap this file closes: nothing budgets the loot-distribution
// layer (src/sim/loot/loot_roll.ts's awardSharedLootItem, the master/need-greed/
// round-robin dispatch, plus loot_ffa.ts's owner-lock check) at a full raid's real
// worst-case shape: a 10-player raid (RAID_MAX) rolling on a corpse carrying a deep
// mixed loot table (rare+ items opening need-greed prompts, common items rotating
// round-robin) across many corpses in a row, the shape one AoE raid pull produces.

const RARE_ITEM_ID = 'moggers_copper_cudgel'; // quality 'rare' -> premiumItems (need-greed)
const COMMON_ITEM_ID = 'roasted_boar'; // quality 'common' -> commonItems (round-robin)

// Build a full 10-member raid (5-player party converted to raid, then filled to the
// RAID_MAX cap) so partyLootCandidatesForMob and the need-greed candidate roster walk
// the largest legal membership the real game allows.
function buildRaid(seed: number): { sim: Sim; pids: number[]; leader: number } {
  const sim = new Sim({ seed, playerClass: 'warrior', noPlayer: true });
  const pids: number[] = [];
  for (let i = 0; i < 5; i++) pids.push(sim.addPlayer('warrior', `Raider${i}`));
  for (let i = 1; i < 5; i++) {
    sim.partyInvite(pids[i], pids[0]);
    sim.partyAccept(pids[i]);
  }
  sim.convertPartyToRaid(pids[0]);
  for (let i = 5; i < 10; i++) {
    const pid = sim.addPlayer('warrior', `Raider${i}`);
    pids.push(pid);
    sim.partyInvite(pid, pids[0]);
    sim.partyAccept(pid);
  }
  sim.drainEvents();
  return { sim, pids, leader: pids[0] };
}

// One freshly tapped, lootable corpse whose recipient roster is the whole raid: the
// per-item roll-resolution shape the tap-owner's loot pass drives.
function tappedCorpse(sim: Sim, pids: number[]): Entity {
  const template = MOBS.forest_wolf;
  const mob = createMob(sim.nextId++, template, template.maxLevel, { x: 0, y: 0, z: 0 });
  mob.tappedById = pids[0];
  mob.lootRecipientIds = [...pids];
  mob.lootable = true;
  mob.lootFfaTimer = LOOT_FFA_DELAY;
  sim.entities.set(mob.id, mob);
  return mob;
}

// Resolve every roll the corpse's award pass opened: submit a need choice for every
// candidate on every pending roll, mirroring a raid actually clicking through its loot
// prompts (not just leaving them to time out), so the resolution path (submitLootRoll
// -> resolveLootRoll's highest-roll pick) is exercised, not just the open.
function resolveAllPendingRolls(sim: Sim, pids: number[]): void {
  for (const roll of [...sim.ctx.pendingLootRolls.values()]) {
    for (const pid of pids) submitLootRoll(sim.ctx, roll.id, 'need', pid);
  }
}

// One full corpse loot pass: DEEP items-per-corpse worth of alternating rare/common
// drops, each dispatched through the real awardSharedLootItem entry point (master ->
// need-greed -> round-robin -> direct grant), then resolve whatever rolls opened.
function lootOneCorpse(
  sim: Sim,
  pids: number[],
  leaderMeta: PlayerMeta,
  itemsPerCorpse: number,
): void {
  const mob = tappedCorpse(sim, pids);
  for (let i = 0; i < itemsPerCorpse; i++) {
    const itemId = i % 2 === 0 ? RARE_ITEM_ID : COMMON_ITEM_ID;
    awardSharedLootItem(sim.ctx, itemId, mob, leaderMeta);
  }
  resolveAllPendingRolls(sim, pids);
  sim.drainEvents();
}

function measureCorpseLootMedian(seed: number, itemsPerCorpse: number): number {
  const { sim, pids, leader } = buildRaid(seed);
  const leaderMeta = sim.ctx.players.get(leader);
  if (!leaderMeta) throw new Error('missing raid leader meta');

  for (let i = 0; i < 5; i++) lootOneCorpse(sim, pids, leaderMeta, itemsPerCorpse);

  const CORPSES = 50;
  const samples: number[] = [];
  for (let i = 0; i < CORPSES; i++) {
    const t0 = performance.now();
    lootOneCorpse(sim, pids, leaderMeta, itemsPerCorpse);
    samples.push(performance.now() - t0);
  }
  samples.sort((a, b) => a - b);
  return samples[Math.floor(samples.length / 2)];
}

describe('loot_roll raid distribution high-load regression budget', () => {
  it('bounds per-corpse loot-resolution cost for a full 10-player raid', () => {
    const ITEMS_PER_CORPSE = 20;
    const median = measureCorpseLootMedian(WORLD_SEED, ITEMS_PER_CORPSE);

    console.log(
      `[loot_roll perf] raid=10 itemsPerCorpse=${ITEMS_PER_CORPSE} median=${median.toFixed(3)}ms`,
    );

    // Generous by design (see mob_update_perf.test.ts): observed healthy median at
    // this population is well under a millisecond per corpse; 15ms leaves ample
    // headroom for slow/contended CI hardware while still catching an
    // order-of-magnitude regression.
    expect(median).toBeLessThan(15);
  }, 60_000);

  it('doubling items-per-corpse does not more than roughly double the cost', () => {
    const SMALL = 10;
    const LARGE = SMALL * 2;

    const smallMedian = measureCorpseLootMedian(WORLD_SEED + 1, SMALL);
    const largeMedian = measureCorpseLootMedian(WORLD_SEED + 2, LARGE);

    console.log(
      `[loot_roll perf] scaling small=${SMALL}items(${smallMedian.toFixed(3)}ms) ` +
        `large=${LARGE}items(${largeMedian.toFixed(3)}ms) ratio=${(largeMedian / Math.max(smallMedian, 0.001)).toFixed(2)}x`,
    );

    // A doubled per-corpse item count doing genuinely linear roll-dispatch work
    // should land near 2x; the bound is set generously above that (3.5x) to absorb
    // noise at these small absolute ms magnitudes while still failing hard on
    // quadratic blowup.
    expect(largeMedian).toBeLessThan(Math.max(smallMedian * 3.5, 5));
  }, 60_000);

  it('actually built the full raid and resolved real need-greed and round-robin awards', () => {
    const { sim, pids, leader } = buildRaid(WORLD_SEED + 3);
    const party = sim.ctx.partyOf(leader);
    expect(party).not.toBeNull();
    expect(party?.raid).toBe(true);
    expect(party?.members.length).toBe(10);

    const leaderMeta = sim.ctx.players.get(leader);
    if (!leaderMeta) throw new Error('missing raid leader meta');
    const mob = tappedCorpse(sim, pids);

    // FFA lock is live at loot-open (mirrors loot_ffa.ts): the tap owner has rights,
    // a non-party outsider does not, before the lock lapses.
    expect(lootHasGoneFfa(mob.lootFfaTimer)).toBe(false);
    expect(hasSharedLootRights(leader, mob.tappedById, mob.lootRecipientIds ?? null, false)).toBe(
      true,
    );
    expect(hasSharedLootRights(999_999, mob.tappedById, mob.lootRecipientIds ?? null, false)).toBe(
      false,
    );

    const rareAwarded = awardSharedLootItem(sim.ctx, RARE_ITEM_ID, mob, leaderMeta);
    expect(rareAwarded).toBe(true);
    expect(sim.ctx.pendingLootRolls.size).toBeGreaterThan(0); // a real need-greed roll opened

    const commonAwarded = awardSharedLootItem(sim.ctx, COMMON_ITEM_ID, mob, leaderMeta);
    expect(commonAwarded).toBe(true); // round-robin grants immediately, no roll

    resolveAllPendingRolls(sim, pids);
    expect(sim.ctx.pendingLootRolls.size).toBe(0); // every opened roll actually resolved
  }, 60_000);
});
