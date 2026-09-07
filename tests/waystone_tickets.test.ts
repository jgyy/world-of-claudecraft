// Waystone Tickets (src/sim/waystone_tickets.ts): the daily Dungeon Finder
// clear grant. The finder stamps the formed group's dungeon, the final-boss
// kill pays the credited participants once per realm day, and a premade that
// walked in through the door earns nothing.

import { describe, expect, it } from 'vitest';
import { HEROIC_DUNGEON_TUNING } from '../src/sim/content/dungeon_difficulty';
import { FIRST_TALENT_LEVEL, type Role, TALENTS } from '../src/sim/content/talents';
import {
  WAYSTONE_TICKET_ITEM_ID,
  WAYSTONE_TICKETS_PER_FINDER_CLEAR,
} from '../src/sim/content/waystones';
import { enterDungeon } from '../src/sim/instances/dungeons';
import { Sim } from '../src/sim/sim';
import type { SimContext } from '../src/sim/sim_context';
import type { Entity, PlayerClass } from '../src/sim/types';
import {
  awardFinderClearTickets,
  finderClearEarnsTickets,
  grantWaystoneTickets,
  markFinderRun,
} from '../src/sim/waystone_tickets';
import { EMPTY_TEST_WORLD, VENDOR_TEST_WORLD } from './sim_shared';

type AnySim = Sim & Record<string, any>;

function makeSim(seed = 5): AnySim {
  return new Sim({
    seed,
    playerClass: 'warrior',
    noPlayer: true,
    world: VENDOR_TEST_WORLD,
  }) as AnySim;
}

function ctxOf(sim: Sim): SimContext {
  return (sim as unknown as { ctx: SimContext }).ctx;
}

/** Enter the Hollow Crypt and return its final boss entity inside the claim. */
function finalBossIn(sim: AnySim, pid: number, dungeonId = 'hollow_crypt'): Entity {
  enterDungeon(ctxOf(sim), dungeonId, pid);
  const inst = (sim.instances as any[]).find(
    (candidate) => candidate.dungeonId === dungeonId && candidate.partyKey !== null,
  );
  const boss = inst.mobIds
    .map((id: number) => sim.entities.get(id))
    .find(
      (e: Entity | undefined) => e?.templateId === HEROIC_DUNGEON_TUNING[dungeonId].finalBossId,
    );
  if (!boss) throw new Error('missing final boss');
  return boss;
}

describe('finderClearEarnsTickets (pure)', () => {
  it('needs the finder stamp for THIS dungeon and a day that has not paid', () => {
    expect(
      finderClearEarnsTickets(
        { finderRunDungeonId: 'hollow_crypt', waystoneTicketDay: null },
        'hollow_crypt',
        'd1',
      ),
    ).toBe(true);
    expect(
      finderClearEarnsTickets(
        { finderRunDungeonId: 'sunken_bastion', waystoneTicketDay: null },
        'hollow_crypt',
        'd1',
      ),
    ).toBe(false);
    expect(
      finderClearEarnsTickets(
        { finderRunDungeonId: null, waystoneTicketDay: null },
        'hollow_crypt',
        'd1',
      ),
    ).toBe(false);
    expect(
      finderClearEarnsTickets(
        { finderRunDungeonId: 'hollow_crypt', waystoneTicketDay: 'd1' },
        'hollow_crypt',
        'd1',
      ),
    ).toBe(false);
    expect(
      finderClearEarnsTickets(
        { finderRunDungeonId: 'hollow_crypt', waystoneTicketDay: 'd1' },
        'hollow_crypt',
        'd2',
      ),
    ).toBe(true);
    // An unknown day pays once, then never again on the same unknown day.
    expect(
      finderClearEarnsTickets(
        { finderRunDungeonId: 'hollow_crypt', waystoneTicketDay: '' },
        'hollow_crypt',
        '',
      ),
    ).toBe(false);
  });
});

describe('grantWaystoneTickets', () => {
  it('lands the tickets in the bags as one stack and ignores a non-positive count', () => {
    const sim = makeSim();
    const pid = sim.addPlayer('warrior', 'Ticketed');
    const meta = sim.players.get(pid)!;
    grantWaystoneTickets(ctxOf(sim), meta, 0);
    expect(sim.countItem(WAYSTONE_TICKET_ITEM_ID, pid)).toBe(0);
    grantWaystoneTickets(ctxOf(sim), meta, 3);
    expect(sim.countItem(WAYSTONE_TICKET_ITEM_ID, pid)).toBe(3);
    expect(meta.inventory.filter((s) => s.itemId === WAYSTONE_TICKET_ITEM_ID)).toHaveLength(1);
  });
});

describe('awardFinderClearTickets', () => {
  it('pays a finder-formed clear of the final boss once per realm day', () => {
    const sim = makeSim();
    sim.resetDay = '2026-09-07';
    const pid = sim.addPlayer('warrior', 'Queued');
    const meta = sim.players.get(pid)!;
    const boss = finalBossIn(sim, pid);
    markFinderRun(meta, 'hollow_crypt');
    awardFinderClearTickets(ctxOf(sim), boss, [meta]);
    expect(sim.countItem(WAYSTONE_TICKET_ITEM_ID, pid)).toBe(WAYSTONE_TICKETS_PER_FINDER_CLEAR);
    expect(meta.waystoneTicketDay).toBe('2026-09-07');
    expect(meta.finderRunDungeonId).toBeNull();
    // A second finder clear the same day pays nothing; the next day pays again.
    markFinderRun(meta, 'hollow_crypt');
    awardFinderClearTickets(ctxOf(sim), boss, [meta]);
    expect(sim.countItem(WAYSTONE_TICKET_ITEM_ID, pid)).toBe(WAYSTONE_TICKETS_PER_FINDER_CLEAR);
    sim.resetDay = '2026-09-08';
    awardFinderClearTickets(ctxOf(sim), boss, [meta]);
    expect(sim.countItem(WAYSTONE_TICKET_ITEM_ID, pid)).toBe(2 * WAYSTONE_TICKETS_PER_FINDER_CLEAR);
  });

  it('pays nothing to a premade that walked in, or for a trash kill', () => {
    const sim = makeSim();
    sim.resetDay = '2026-09-07';
    const pid = sim.addPlayer('warrior', 'Walker');
    const meta = sim.players.get(pid)!;
    const boss = finalBossIn(sim, pid);
    awardFinderClearTickets(ctxOf(sim), boss, [meta]);
    expect(sim.countItem(WAYSTONE_TICKET_ITEM_ID, pid)).toBe(0);
    markFinderRun(meta, 'hollow_crypt');
    const inst = (sim.instances as any[]).find((c) => c.dungeonId === 'hollow_crypt');
    const trash = inst.mobIds
      .map((id: number) => sim.entities.get(id))
      .find((e: Entity | undefined) => e && e.templateId !== boss.templateId) as Entity;
    awardFinderClearTickets(ctxOf(sim), trash, [meta]);
    expect(sim.countItem(WAYSTONE_TICKET_ITEM_ID, pid)).toBe(0);
    expect(meta.finderRunDungeonId).toBe('hollow_crypt');
  });

  it('the death hub pays the grant when the final boss actually dies', () => {
    const sim = makeSim();
    sim.resetDay = '2026-09-07';
    const pid = sim.addPlayer('warrior', 'Slayer');
    const meta = sim.players.get(pid)!;
    const boss = finalBossIn(sim, pid);
    markFinderRun(meta, 'hollow_crypt');
    sim.setPlayerLevel(60, pid);
    const p = sim.entities.get(pid)!;
    p.pos = { ...boss.pos };
    sim.dealDamage(p, boss, boss.hp + 10, false, 'physical', null, 'hit');
    expect(boss.dead).toBe(true);
    expect(sim.countItem(WAYSTONE_TICKET_ITEM_ID, pid)).toBe(WAYSTONE_TICKETS_PER_FINDER_CLEAR);
  });
});

describe('the finder stamps the formed group', () => {
  it('marks every member with the activity dungeon when a proposal completes', () => {
    const sim = new Sim({
      seed: 42,
      playerClass: 'warrior',
      noPlayer: true,
      world: EMPTY_TEST_WORLD,
    });
    const specs: { cls: PlayerClass; roles: Role[] }[] = [
      { cls: 'warrior', roles: ['tank'] },
      { cls: 'priest', roles: ['healer'] },
      { cls: 'mage', roles: ['dps'] },
      { cls: 'rogue', roles: ['dps'] },
      { cls: 'hunter', roles: ['dps'] },
    ];
    const pids = specs.map((spec, i) => {
      const pid = sim.addPlayer(spec.cls, `Finder${i}`);
      sim.setPlayerLevel(8, pid);
      if (8 >= FIRST_TALENT_LEVEL) {
        const specId = TALENTS[spec.cls]?.specs.find((s) => s.role === spec.roles[0])?.id;
        if (specId) sim.setSpec(specId, pid);
      }
      sim.dungeonFinderSetRoles(spec.roles, pid);
      return pid;
    });
    for (const pid of pids) sim.dungeonFinderQueueJoin(['hollow_crypt_normal'], pid);
    sim.tick();
    expect(pids.every((pid) => sim.players.get(pid)?.finderRunDungeonId === null)).toBe(true);
    for (const pid of pids) sim.dungeonFinderRespond(true, pid);
    sim.tick();
    for (const pid of pids) expect(sim.players.get(pid)?.finderRunDungeonId).toBe('hollow_crypt');
  });
});
