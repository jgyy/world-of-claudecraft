// src/sim/progression/honing.ts over a real Sim: the deny ladder (zero draws,
// zero spend), the spend on every resolved attempt, the first-attempt bind,
// the ONE draw, the rank walk reaching derived stats, the max-rank stop,
// save/load, the load bound, the projections, survival across other payload
// writers, and determinism.
import { describe, expect, it } from 'vitest';
import { equippedInstanceWire } from '../server/equipped_instance_wire';
import { ENCHANTS } from '../src/sim/content/enchants';
import { ITEMS } from '../src/sim/data';
import { sanitizeItemInstancePayloadOnLoad } from '../src/sim/item_instance_load';
import { activeItemInstanceStats } from '../src/sim/item_instance_stats';
import { publicInstanceView } from '../src/sim/item_instance_transfer';
import { enchantedPayloadFor, replacedEnchantPayloadFor } from '../src/sim/professions/enchanting';
import {
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
const PURSE = 100 * 10_000;

/** A level-cap warrior with `vlevels` unspent virtual levels and the plain sword worn. */
function capped(seed = 7, vlevels = 6, copper = PURSE) {
  const sim = new Sim({ seed, playerClass: 'warrior', autoEquip: false, world: EMPTY_TEST_WORLD });
  const pid = sim.playerId;
  const meta = sim.players.get(pid) as PlayerMeta;
  const e = sim.entities.get(pid) as Entity;
  sim.setPlayerLevel(MAX_LEVEL);
  meta.lifetimeXp = xpToReachLevel(MAX_LEVEL + vlevels);
  meta.copper = copper;
  sim.addItem(SWORD, 1, pid);
  sim.equipItem(SWORD, pid);
  expect(meta.equipment.mainhand).toBe(SWORD);
  sim.drainEvents();
  return { sim, pid, meta, e };
}
type Rig = ReturnType<typeof capped>;

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

const texts = (events: SimEvent[]): string[] =>
  events
    .filter(
      (ev): ev is Extract<SimEvent, { type: 'log' | 'error' }> =>
        ev.type === 'log' || ev.type === 'error',
    )
    .map((ev) => ev.text);
const honed = (events: SimEvent[]) =>
  events.filter((ev): ev is Extract<SimEvent, { type: 'honed' }> => ev.type === 'honed');

describe('the deny ladder: zero draws, nothing spent', () => {
  const cases: [string, (rig: Rig) => void, string, string, string][] = [
    ['dead', (r) => (r.e.dead = true), 'mainhand', 'str', "You can't do that while dead."],
    ['forged stat', () => {}, 'mainhand', 'armor', 'You cannot hone that.'],
    ['forged slot', () => {}, 'backpack', 'str', 'You cannot hone that.'],
    [
      'under the cap',
      (r) => {
        r.sim.setPlayerLevel(MAX_LEVEL - 1);
        r.meta.lifetimeXp = xpToReachLevel(MAX_LEVEL + 9);
        r.sim.drainEvents();
      },
      'mainhand',
      'str',
      'You must be at the level cap to hone gear.',
    ],
    ['empty slot', () => {}, 'helmet', 'str', 'You have nothing worn in that slot to hone.'],
    [
      'fully honed',
      (r) => {
        r.meta.equipmentInstance.mainhand = {
          honing: { rank: HONING_MAX_RANK, stats: { str: HONING_MAX_RANK } },
        };
      },
      'mainhand',
      'str',
      'That item is already fully honed.',
    ],
    [
      'pool short',
      (r) => {
        r.meta.lifetimeXp = xpToReachLevel(MAX_LEVEL);
      },
      'mainhand',
      'str',
      'You need 1 unspent virtual levels to hone that.',
    ],
    [
      'purse short',
      (r) => {
        r.meta.copper = honingCost(0).copper - 1;
      },
      'mainhand',
      'str',
      'You need 50s to hone that.',
    ],
  ];
  it.each(cases)('%s', (_name, arrange, slot, stat, line) => {
    const rig = capped(11);
    arrange(rig);
    const { sim, meta } = rig;
    const before = [meta.virtualLevelsSpent, meta.copper, JSON.stringify(meta.equipmentInstance)];
    let landed = true;
    const draws = drawsDuring(sim, () => {
      landed = resolveHoningAttempt(sim.ctx, rig.pid, slot, stat);
    });
    expect(landed).toBe(false);
    expect(draws).toBe(0);
    expect([meta.virtualLevelsSpent, meta.copper, JSON.stringify(meta.equipmentInstance)]).toEqual(
      before,
    );
    const events = sim.drainEvents();
    expect(texts(events)).toEqual([line]);
    expect(honed(events)).toEqual([]);
  });
});

describe('a resolved attempt', () => {
  it('rank 1 always lands: spends, binds, draws once, writes the record, re-bakes stats', () => {
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
    expect(payload.rolled).toBeUndefined(); // never a rolled.stats writer
    expect(e.stats.str).toBe(strBefore + 1);
    const events = sim.drainEvents();
    expect(texts(events)).toEqual([
      `Honing begins: ${ITEMS[SWORD].name} is now bound to you.`,
      `Honing: ${ITEMS[SWORD].name} is now honed +1.`,
    ]);
    expect(honed(events)).toEqual([
      { type: 'honed', pid: e.id, slot: 'mainhand', rank: 1, landed: true, spent: 1 },
    ]);
  });

  it('a miss spends the levels and the fee and keeps the piece', () => {
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
    expect(honed(events)[0]).toMatchObject({ rank: 1, landed: false, spent: 3 });
  });

  it('each landed rank adds +1 to the CHOSEN stat, and the bind line prints once', () => {
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
    expect(texts(sim.drainEvents()).filter((t) => t.startsWith('Honing begins'))).toHaveLength(1);
  });

  it('stops at the cap: the walk to +10 costs exactly the ladder, then refuses', () => {
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

describe('persistence, projections, and survival across other payload writers', () => {
  it('the ledger and the worn record round-trip through serializeCharacter/addPlayer', () => {
    const { sim, pid, meta, e } = capped(41, 20);
    withForcedRoll(sim, 0, () => {
      sim.honeItem('mainhand', 'str');
      sim.honeItem('mainhand', 'int');
    });
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
    expect((fresh.entities.get(loadedPid) as Entity).stats.str).toBe(e.stats.str);
  });

  it('a pre-honing or corrupt ledger loads as zero and never unlocks the pool gate', () => {
    expect(loadedVirtualLevelsSpent(undefined)).toBe(0);
    expect(loadedVirtualLevelsSpent(7.9)).toBe(7);
    expect(loadedVirtualLevelsSpent(-3)).toBe(0);
    expect(loadedVirtualLevelsSpent('lots')).toBe(0);
    expect(loadedVirtualLevelsSpent(Number.POSITIVE_INFINITY)).toBe(0);
    const { sim, pid } = capped(42);
    const state = sim.serializeCharacter(pid);
    if (!state) throw new Error('no state');
    (state as { virtualLevelsSpent?: unknown }).virtualLevelsSpent = 'NaN';
    const fresh = new Sim({ seed: 42, playerClass: 'warrior', noPlayer: true });
    const loadedPid = fresh.addPlayer('warrior', 'Corrupt', { state });
    const meta = fresh.players.get(loadedPid) as PlayerMeta;
    expect(meta.virtualLevelsSpent).toBe(0);
    meta.lifetimeXp = xpToReachLevel(MAX_LEVEL);
    expect(fresh.honeItem('mainhand', 'str', loadedPid)).toBe(false);
    expect(texts(fresh.drainEvents())).toContain('You need 1 unspent virtual levels to hone that.');
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
      null,
    ]) {
      expect(isValidHoningRecord(bad), JSON.stringify(bad)).toBe(false);
      const out = sanitizeItemInstancePayloadOnLoad({ signer: 'Ada', honing: bad });
      expect(out.payload?.honing).toBeUndefined();
      expect(out.payload?.signer).toBe('Ada');
      expect(out.dropped).toContain('honing');
    }
  });

  it('the clone and both public projections carry an independent copy, never the bind', () => {
    const src: ItemInstancePayload = { honing: { rank: 1, stats: { agi: 1 } }, boundTo: 4 };
    const clone = cloneItemInstancePayload(src);
    const pub = publicInstanceView(src);
    const wire = equippedInstanceWire({ equippedInstances: { mainhand: src } }) as Record<
      string,
      { honing?: unknown; boundTo?: unknown }
    >;
    expect(clone.honing).toEqual(src.honing);
    expect(clone.honing?.stats).not.toBe(src.honing?.stats);
    expect(pub.honing).toEqual(src.honing);
    expect(pub.honing?.stats).not.toBe(src.honing?.stats);
    expect(pub.boundTo).toBeUndefined();
    expect(wire.mainhand.honing).toEqual(src.honing);
    expect(wire.mainhand.boundTo).toBeUndefined();
  });

  it('activeItemInstanceStats folds the record on top of rolled stats without aliasing', () => {
    const instance: ItemInstancePayload = {
      rolled: { stats: { str: 2, spellPower: 5 } },
      honing: { rank: 3, stats: { str: 2, sta: 1 } },
    };
    expect(activeItemInstanceStats(instance)).toEqual({ str: 4, spellPower: 5, sta: 1 });
    expect(instance.rolled?.stats).toEqual({ str: 2, spellPower: 5 });
    expect(activeItemInstanceStats(undefined)).toBeUndefined();
  });

  it('rides the Rift load rebuild (a fresh payload minted from named inputs)', () => {
    const band = createRiftGearInstance('survive', 'S', 'warrior', 1, 2);
    band.instance.honing = { rank: 4, stats: { str: 3, sta: 1 } };
    const clean = sanitizeRiftGearInstance(band.itemId, band.instance, 1);
    expect(clean?.honing).toEqual({ rank: 4, stats: { str: 3, sta: 1 } });
    expect(clean?.honing).not.toBe(band.instance.honing);
    band.instance.honing = { rank: 2, stats: { str: 9 } };
    expect(sanitizeRiftGearInstance(band.itemId, band.instance, 1)?.honing).toBeUndefined();
  });

  it('rides an enchant apply and an enchant replace untouched', () => {
    const honedCopy: ItemInstancePayload = { honing: { rank: 2, stats: { agi: 2 } } };
    const enchanted = enchantedPayloadFor(honedCopy, ENCHANTS.enchant_weapon_might);
    expect(enchanted.honing).toEqual({ rank: 2, stats: { agi: 2 } });
    const next = ENCHANTS.enchant_weapon_lastflame_zeal;
    const replaced = replacedEnchantPayloadFor(enchanted, next);
    expect(replaced.honing).toEqual({ rank: 2, stats: { agi: 2 } });
    expect(activeItemInstanceStats(replaced)?.agi).toBe(2 + (next.statBonus.agi ?? 0));
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
    expect(meta.inventory.find((s) => s.itemId === SWORD)?.instance?.honing).toEqual({
      rank: 2,
      stats: { str: 2 },
    });
    sim.equipItem(SWORD, pid);
    expect(meta.equipmentInstance.mainhand?.honing).toEqual({ rank: 2, stats: { str: 2 } });
    expect(e.stats.str).toBe(base + 2);
  });
});
