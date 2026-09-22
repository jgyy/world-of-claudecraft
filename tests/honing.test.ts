// Paired suite for src/sim/progression/honing.ts over a real Sim: the deny
// ladder (order, zero draws, zero spend), the level and fee spend on every
// resolved attempt, the first-attempt bind, the ONE draw, the rank walk and
// the per-copy stat channel reaching derived stats, the fail-keeps default,
// the max-rank stop, save/load round-trips through serializeCharacter/
// addPlayer, the load bound, the public projections, and determinism.
import { describe, expect, it } from 'vitest';
import { equippedInstanceWire } from '../server/equipped_instance_wire';
import { ENCHANTS } from '../src/sim/content/enchants';
import { ITEMS } from '../src/sim/data';
import { sanitizeItemInstancePayloadOnLoad } from '../src/sim/item_instance_load';
import { activeItemInstanceStats } from '../src/sim/item_instance_stats';
import { publicInstanceView } from '../src/sim/item_instance_transfer';
import { enchantedPayloadFor, replacedEnchantPayloadFor } from '../src/sim/professions/enchanting';
import {
  honingInfoFrom,
  honingRankOf,
  loadedVirtualLevelsSpent,
  resolveHoningAttempt,
} from '../src/sim/progression/honing';
import {
  HONING_MAX_RANK,
  honingChance,
  honingCost,
  unspentVirtualLevels,
} from '../src/sim/progression/honing_policy';
import { isValidHoningRecord } from '../src/sim/progression/honing_record';
import { createRiftGearInstance, sanitizeRiftGearInstance } from '../src/sim/rift/progression';
import { type PlayerMeta, Sim } from '../src/sim/sim';
import {
  cloneItemInstancePayload,
  type Entity,
  type ItemInstancePayload,
  MAX_LEVEL,
  type SimEvent,
  xpToReachLevel,
} from '../src/sim/types';
import { EMPTY_TEST_WORLD } from './sim_shared';

const SWORD = 'eastbrook_arming_sword';
const PURSE = 100 * 10_000; // 100 gold

interface Rig {
  sim: Sim;
  pid: number;
  meta: PlayerMeta;
  e: Entity;
}

/** A level-cap warrior with `vlevels` unspent virtual levels, a full purse,
 *  and the plain common sword worn in the mainhand. */
function capped(seed = 7, vlevels = 6, copper = PURSE): Rig {
  const sim = new Sim({ seed, playerClass: 'warrior', autoEquip: false, world: EMPTY_TEST_WORLD });
  const pid = sim.playerId;
  const meta = sim.players.get(pid) as PlayerMeta;
  const e = sim.entities.get(pid) as Entity;
  sim.setPlayerLevel(MAX_LEVEL);
  meta.lifetimeXp = xpToReachLevel(MAX_LEVEL + vlevels);
  meta.copper = copper;
  sim.addItem(SWORD, 1, pid);
  sim.equipItem(SWORD, pid);
  expect(meta.equipment.mainhand, 'the sword is really worn').toBe(SWORD);
  sim.drainEvents();
  return { sim, pid, meta, e };
}

function drawsDuring(sim: Sim, run: () => void): number {
  let draws = 0;
  sim.rng.setObserver(() => {
    draws += 1;
  });
  try {
    run();
  } finally {
    sim.rng.setObserver(null);
  }
  return draws;
}

/** Force the sim's next draws to `value` for the duration of `run`. */
function withForcedRoll(sim: Sim, value: number, run: () => void): void {
  const rng = sim.rng as { next: () => number };
  const live = rng.next;
  rng.next = () => value;
  try {
    run();
  } finally {
    rng.next = live;
  }
}

function texts(events: SimEvent[]): string[] {
  return events
    .filter(
      (ev): ev is Extract<SimEvent, { type: 'log' | 'error' }> =>
        ev.type === 'log' || ev.type === 'error',
    )
    .map((ev) => ev.text);
}

function honedEvents(events: SimEvent[]): Extract<SimEvent, { type: 'honed' }>[] {
  return events.filter((ev): ev is Extract<SimEvent, { type: 'honed' }> => ev.type === 'honed');
}

describe('the deny ladder: zero draws, nothing spent', () => {
  function expectDenied(rig: Rig, run: () => boolean, line: string): void {
    const { sim, meta } = rig;
    const spent = meta.virtualLevelsSpent;
    const copper = meta.copper;
    const before = JSON.stringify(meta.equipmentInstance);
    let landed = true;
    const draws = drawsDuring(sim, () => {
      landed = run();
    });
    expect(landed).toBe(false);
    expect(draws).toBe(0);
    expect(meta.virtualLevelsSpent).toBe(spent);
    expect(meta.copper).toBe(copper);
    expect(JSON.stringify(meta.equipmentInstance)).toBe(before);
    const events = sim.drainEvents();
    expect(texts(events)).toEqual([line]);
    expect(honedEvents(events)).toEqual([]);
  }

  it('refuses a dead player', () => {
    const rig = capped(11);
    rig.e.dead = true;
    expectDenied(rig, () => rig.sim.honeItem('mainhand', 'str'), "You can't do that while dead.");
  });

  it('refuses a forged slot or stat token', () => {
    const rig = capped(12);
    expectDenied(
      rig,
      () => resolveHoningAttempt(rig.sim.ctx, rig.pid, 'mainhand', 'armor'),
      'You cannot hone that.',
    );
    expectDenied(
      rig,
      () => resolveHoningAttempt(rig.sim.ctx, rig.pid, 'backpack', 'str'),
      'You cannot hone that.',
    );
  });

  it('refuses a character under the cap even with a fat lifetime counter', () => {
    const rig = capped(13);
    rig.sim.setPlayerLevel(MAX_LEVEL - 1);
    rig.meta.lifetimeXp = xpToReachLevel(MAX_LEVEL + 9);
    rig.sim.drainEvents();
    expectDenied(
      rig,
      () => rig.sim.honeItem('mainhand', 'str'),
      'You must be at the level cap to hone gear.',
    );
  });

  it('refuses an empty slot', () => {
    const rig = capped(14);
    expectDenied(
      rig,
      () => rig.sim.honeItem('helmet', 'str'),
      'You have nothing worn in that slot to hone.',
    );
  });

  it('refuses a fully honed copy', () => {
    const rig = capped(15, 60);
    rig.meta.equipmentInstance.mainhand = {
      honing: { rank: HONING_MAX_RANK, stats: { str: HONING_MAX_RANK } },
    };
    expectDenied(
      rig,
      () => rig.sim.honeItem('mainhand', 'str'),
      'That item is already fully honed.',
    );
  });

  it('refuses when the unspent pool is short, naming the shortfall', () => {
    const rig = capped(16, 0);
    expectDenied(
      rig,
      () => rig.sim.honeItem('mainhand', 'str'),
      'You need 1 unspent virtual levels to hone that.',
    );
  });

  it('refuses when the purse is short, naming the fee', () => {
    const rig = capped(17, 6, honingCost(0).copper - 1);
    expectDenied(rig, () => rig.sim.honeItem('mainhand', 'str'), 'You need 50s to hone that.');
  });
});

describe('a resolved attempt', () => {
  it('rank 1 always lands: spends, binds, draws once, writes the record, and re-bakes stats', () => {
    const { sim, meta, e } = capped(21);
    const strBefore = e.stats.str;
    expect(honingChance(0)).toBe(1);
    let landed = false;
    const draws = drawsDuring(sim, () => {
      landed = sim.honeItem('mainhand', 'str');
    });
    expect(landed).toBe(true);
    expect(draws).toBe(1);
    expect(meta.virtualLevelsSpent).toBe(1);
    expect(unspentVirtualLevels(meta.lifetimeXp, meta.virtualLevelsSpent)).toBe(5);
    expect(meta.copper).toBe(PURSE - honingCost(0).copper);
    const payload = meta.equipmentInstance.mainhand as ItemInstancePayload;
    expect(payload.boundTo).toBe(meta.entityId);
    expect(payload.honing).toEqual({ rank: 1, stats: { str: 1 } });
    // rolled.stats is never the writer: the honing channel is its own field
    expect(payload.rolled).toBeUndefined();
    expect(e.stats.str).toBe(strBefore + 1);
    const events = sim.drainEvents();
    expect(texts(events)).toEqual([
      `Honing begins: ${ITEMS[SWORD].name} is now bound to you.`,
      `Honing: ${ITEMS[SWORD].name} is now honed +1.`,
    ]);
    expect(honedEvents(events)).toEqual([
      { type: 'honed', pid: e.id, slot: 'mainhand', rank: 1, landed: true, spent: 1 },
    ]);
  });

  it('a miss spends the levels and the fee and keeps the piece (the fail-keeps default)', () => {
    const { sim, meta, e } = capped(22);
    sim.honeItem('mainhand', 'str');
    sim.drainEvents();
    const strAfterOne = e.stats.str;
    let landed = true;
    withForcedRoll(sim, 0.999, () => {
      landed = sim.honeItem('mainhand', 'str');
    });
    expect(landed).toBe(false);
    expect(meta.virtualLevelsSpent).toBe(1 + honingCost(1).levels);
    expect(meta.copper).toBe(PURSE - honingCost(0).copper - honingCost(1).copper);
    expect(meta.equipmentInstance.mainhand?.honing).toEqual({ rank: 1, stats: { str: 1 } });
    expect(e.stats.str).toBe(strAfterOne);
    const events = sim.drainEvents();
    expect(texts(events)).toEqual(['The honing fails; the virtual levels and gold are spent.']);
    expect(honedEvents(events)[0]).toMatchObject({ rank: 1, landed: false, spent: 3 });
  });

  it('each landed rank adds +1 to the CHOSEN stat, so a copy can spread its ranks', () => {
    const { sim, meta, e } = capped(23, 20);
    const before = { str: e.stats.str, sta: e.stats.sta };
    withForcedRoll(sim, 0, () => {
      sim.honeItem('mainhand', 'str');
      sim.honeItem('mainhand', 'sta');
      sim.honeItem('mainhand', 'str');
    });
    expect(meta.equipmentInstance.mainhand?.honing).toEqual({ rank: 3, stats: { str: 2, sta: 1 } });
    expect(e.stats.str).toBe(before.str + 2);
    expect(e.stats.sta).toBe(before.sta + 1);
    expect(meta.virtualLevelsSpent).toBe(1 + 2 + 3);
    // the bind line prints once, on the first attempt only
    expect(texts(sim.drainEvents()).filter((t) => t.startsWith('Honing begins'))).toHaveLength(1);
  });

  it('stops at the cap: the walk to +10 costs exactly the ladder and the next press is refused', () => {
    // 385 is the ladder's fee sum in HONING_COPPER_BASE units (honing_policy.test.ts)
    const { sim, meta } = capped(24, 55, honingCost(0).copper * 385);
    const purse = meta.copper;
    withForcedRoll(sim, 0, () => {
      for (let i = 0; i < HONING_MAX_RANK; i++) sim.honeItem('mainhand', 'agi');
    });
    expect(honingRankOf(meta.equipmentInstance.mainhand)).toBe(HONING_MAX_RANK);
    expect(meta.virtualLevelsSpent).toBe(55);
    let total = 0;
    for (let r = 0; r < HONING_MAX_RANK; r++) total += honingCost(r).copper;
    expect(meta.copper).toBe(purse - total);
    sim.drainEvents();
    expect(sim.honeItem('mainhand', 'agi')).toBe(false);
    expect(texts(sim.drainEvents())).toEqual(['That item is already fully honed.']);
  });

  it('honingInfoFrom quotes the next rank off the worn copy', () => {
    const { sim, meta } = capped(25, 20);
    const reads = { equipment: meta.equipment, equipmentInstances: meta.equipmentInstance };
    expect(honingInfoFrom(reads, 'helmet')).toBeNull();
    expect(honingInfoFrom(reads, 'mainhand')).toEqual({
      slot: 'mainhand',
      itemId: SWORD,
      rank: 0,
      maxed: false,
      cost: honingCost(0),
      chance: honingChance(0),
      stats: {},
    });
    withForcedRoll(sim, 0, () => {
      sim.honeItem('mainhand', 'spi');
    });
    expect(honingInfoFrom(reads, 'mainhand')).toMatchObject({
      rank: 1,
      cost: honingCost(1),
      chance: honingChance(1),
      stats: { spi: 1 },
    });
  });

  it('is deterministic: the same seed walks the same ranks', () => {
    const walk = (seed: number): number[] => {
      const { sim, meta } = capped(seed, 55, PURSE * 10);
      const ranks: number[] = [];
      for (let i = 0; i < 8; i++) {
        sim.honeItem('mainhand', 'str');
        ranks.push(honingRankOf(meta.equipmentInstance.mainhand));
      }
      return ranks;
    };
    expect(walk(31)).toEqual(walk(31));
  });
});

describe('persistence and projections', () => {
  it('the ledger and the worn record round-trip through serializeCharacter/addPlayer', () => {
    const { sim, pid, meta, e } = capped(41, 20);
    withForcedRoll(sim, 0, () => {
      sim.honeItem('mainhand', 'str');
      sim.honeItem('mainhand', 'int');
    });
    const liveStr = e.stats.str;
    const state = sim.serializeCharacter(pid);
    expect(state?.virtualLevelsSpent).toBe(3);

    const fresh = new Sim({ seed: 41, playerClass: 'warrior', noPlayer: true });
    const loadedPid = fresh.addPlayer('warrior', 'Reloaded', { state: state ?? undefined });
    const loadedMeta = fresh.players.get(loadedPid) as PlayerMeta;
    expect(loadedMeta.virtualLevelsSpent).toBe(3);
    expect(loadedMeta.equipmentInstance.mainhand?.honing).toEqual({
      rank: 2,
      stats: { str: 1, int: 1 },
    });
    expect(loadedMeta.equipmentInstance.mainhand?.boundTo).toBe(meta.entityId);
    expect((fresh.entities.get(loadedPid) as Entity).stats.str).toBe(liveStr);
  });

  it('a pre-honing save loads with an empty ledger', () => {
    const { sim, pid } = capped(42);
    const state = sim.serializeCharacter(pid);
    if (!state) throw new Error('no state');
    delete (state as { virtualLevelsSpent?: number }).virtualLevelsSpent;
    const fresh = new Sim({ seed: 42, playerClass: 'warrior', noPlayer: true });
    const loadedPid = fresh.addPlayer('warrior', 'Legacy', { state });
    expect((fresh.players.get(loadedPid) as PlayerMeta).virtualLevelsSpent).toBe(0);
  });

  it('the load bound keeps only the exact legal record shape (drop-only)', () => {
    const legal = { rank: 3, stats: { str: 2, spi: 1 } };
    expect(isValidHoningRecord(legal)).toBe(true);
    expect(sanitizeItemInstancePayloadOnLoad({ honing: legal }).payload?.honing).toEqual(legal);
    for (const bad of [
      { rank: 0, stats: {} },
      { rank: HONING_MAX_RANK + 1, stats: { str: HONING_MAX_RANK + 1 } },
      { rank: 2, stats: { str: 1 } },
      { rank: 1, stats: { armor: 1 } },
      { rank: 1, stats: { str: 1 }, extra: true },
      { rank: 1.5, stats: { str: 1.5 } },
      { rank: 1, stats: { str: -1, agi: 2 } },
      'honed',
      [1],
      null,
    ]) {
      expect(isValidHoningRecord(bad), JSON.stringify(bad)).toBe(false);
      const out = sanitizeItemInstancePayloadOnLoad({ signer: 'Ada', honing: bad });
      expect(out.payload?.honing).toBeUndefined();
      expect(out.payload?.signer).toBe('Ada');
      expect(out.dropped).toContain('honing');
    }
  });

  it('the clone and both public projections carry an independent copy of the record', () => {
    const src: ItemInstancePayload = { honing: { rank: 1, stats: { agi: 1 } }, boundTo: 4 };
    const clone = cloneItemInstancePayload(src);
    const pub = publicInstanceView(src);
    const wire = equippedInstanceWire({ equippedInstances: { mainhand: src } }) as Record<
      string,
      { honing?: unknown; boundTo?: unknown }
    >;
    expect(clone.honing).toEqual(src.honing);
    expect(clone.honing).not.toBe(src.honing);
    expect(clone.honing?.stats).not.toBe(src.honing?.stats);
    expect(pub.honing).toEqual(src.honing);
    expect(pub.honing?.stats).not.toBe(src.honing?.stats);
    expect(pub.boundTo).toBeUndefined();
    expect(wire.mainhand.honing).toEqual(src.honing);
    expect(wire.mainhand.boundTo).toBeUndefined();
  });

  it('activeItemInstanceStats folds the record on top of rolled stats', () => {
    const instance: ItemInstancePayload = {
      rolled: { stats: { str: 2, spellPower: 5 } },
      honing: { rank: 3, stats: { str: 2, sta: 1 } },
    };
    expect(activeItemInstanceStats(instance)).toEqual({ str: 4, spellPower: 5, sta: 1 });
    // the fold never aliases the live rolled map
    expect(instance.rolled?.stats).toEqual({ str: 2, spellPower: 5 });
    expect(activeItemInstanceStats({ honing: { rank: 1, stats: { int: 1 } } })).toEqual({ int: 1 });
    expect(activeItemInstanceStats(undefined)).toBeUndefined();
  });
});

describe('the record survives every other payload writer', () => {
  it('rides the Rift load rebuild (a fresh payload minted from named inputs)', () => {
    const band = createRiftGearInstance('survive', 'S', 'warrior', 1, 2);
    band.instance.honing = { rank: 4, stats: { str: 3, sta: 1 } };
    const clean = sanitizeRiftGearInstance(band.itemId, band.instance, 1);
    expect(clean?.honing).toEqual({ rank: 4, stats: { str: 3, sta: 1 } });
    expect(clean?.honing).not.toBe(band.instance.honing);
    // and a corrupt record is dropped by the rebuild exactly as the load bound drops it
    band.instance.honing = { rank: 2, stats: { str: 9 } };
    expect(sanitizeRiftGearInstance(band.itemId, band.instance, 1)?.honing).toBeUndefined();
  });

  it('rides an enchant apply and an enchant replace untouched', () => {
    const enchant = ENCHANTS.enchant_weapon_might;
    const honed: ItemInstancePayload = { honing: { rank: 2, stats: { agi: 2 } } };
    const enchanted = enchantedPayloadFor(honed, enchant);
    expect(enchanted.enchant).toBe(enchant.id);
    expect(enchanted.honing).toEqual({ rank: 2, stats: { agi: 2 } });
    const replaced = replacedEnchantPayloadFor(enchanted, ENCHANTS.enchant_weapon_lastflame_zeal);
    expect(replaced.honing).toEqual({ rank: 2, stats: { agi: 2 } });
    // the fold reads both channels: the enchant's share plus the honing +2
    expect(activeItemInstanceStats(replaced)?.agi).toBe(
      2 + (ENCHANTS.enchant_weapon_lastflame_zeal.statBonus.agi ?? 0),
    );
  });

  it('rides unequip to the bags and back, and the stats follow', () => {
    const { sim, pid, meta, e } = capped(51, 20);
    const base = e.stats.str;
    withForcedRoll(sim, 0, () => {
      sim.honeItem('mainhand', 'str');
      sim.honeItem('mainhand', 'str');
    });
    expect(e.stats.str).toBe(base + 2);
    expect(sim.unequipItem('mainhand', pid)).toBe(true);
    expect(e.stats.str).toBe(base);
    const bagged = meta.inventory.find((s) => s.itemId === SWORD);
    expect(bagged?.instance?.honing).toEqual({ rank: 2, stats: { str: 2 } });
    sim.equipItem(SWORD, pid);
    expect(meta.equipmentInstance.mainhand?.honing).toEqual({ rank: 2, stats: { str: 2 } });
    expect(e.stats.str).toBe(base + 2);
  });

  it('the reset option (HONING_FAIL_RESETS) strips every rank on a miss', () => {
    const { sim, pid, meta, e } = capped(52, 20);
    const base = e.stats.str;
    withForcedRoll(sim, 0, () => {
      sim.honeItem('mainhand', 'str');
      sim.honeItem('mainhand', 'str');
    });
    sim.drainEvents();
    let landed = true;
    withForcedRoll(sim, 0.999, () => {
      landed = resolveHoningAttempt(sim.ctx, pid, 'mainhand', 'str', { failResets: true });
    });
    expect(landed).toBe(false);
    expect(meta.equipmentInstance.mainhand?.honing).toBeUndefined();
    expect(e.stats.str).toBe(base);
    expect(meta.virtualLevelsSpent).toBe(1 + 2 + 3);
    const events = sim.drainEvents();
    expect(texts(events)).toEqual([`The honing fails and ${ITEMS[SWORD].name} loses every hone.`]);
    expect(honedEvents(events)[0]).toMatchObject({ rank: 0, landed: false, spent: 6 });
  });
});

describe('the ledger load bound', () => {
  it('reads a finite non-negative integer and nothing else', () => {
    expect(loadedVirtualLevelsSpent(undefined)).toBe(0);
    expect(loadedVirtualLevelsSpent(7)).toBe(7);
    expect(loadedVirtualLevelsSpent(7.9)).toBe(7);
    expect(loadedVirtualLevelsSpent(-3)).toBe(0);
    expect(loadedVirtualLevelsSpent(Number.NaN)).toBe(0);
    expect(loadedVirtualLevelsSpent('lots')).toBe(0);
    expect(loadedVirtualLevelsSpent(Number.POSITIVE_INFINITY)).toBe(0);
  });

  it('a corrupt persisted ledger loads as zero and never unlocks the pool gate', () => {
    const { sim, pid } = capped(61);
    const state = sim.serializeCharacter(pid);
    if (!state) throw new Error('no state');
    (state as { virtualLevelsSpent?: unknown }).virtualLevelsSpent = 'NaN';
    const fresh = new Sim({ seed: 61, playerClass: 'warrior', noPlayer: true });
    const loadedPid = fresh.addPlayer('warrior', 'Corrupt', { state });
    const meta = fresh.players.get(loadedPid) as PlayerMeta;
    expect(meta.virtualLevelsSpent).toBe(0);
    meta.lifetimeXp = xpToReachLevel(MAX_LEVEL);
    expect(fresh.honeItem('mainhand', 'str', loadedPid)).toBe(false);
    expect(texts(fresh.drainEvents())).toContain('You need 1 unspent virtual levels to hone that.');
  });
});
