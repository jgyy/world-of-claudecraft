// The Honing card's pure core (src/ui/honing_sheet_view.ts) over a real
// offline Sim and over a ClientWorld-shaped mirror stub (host parity): the
// worn-slot list and picks, the quote from the sim's own policy, the button
// gates (pool, purse, cap, max), and the pre-cap card.
import { describe, expect, it } from 'vitest';
import { ITEMS } from '../src/sim/data';
import { HONING_MAX_RANK, honingChance, honingCost } from '../src/sim/progression/honing_policy';
import { type PlayerMeta, Sim } from '../src/sim/sim';
import { ALL_EQUIP_SLOTS, MAX_LEVEL, xpToReachLevel } from '../src/sim/types';
import { buildHoningSheetModel, honingSheetHtml } from '../src/ui/honing_sheet_view';
import { EMPTY_TEST_WORLD } from './sim_shared';

const SWORD = 'eastbrook_arming_sword';
type World = Parameters<typeof buildHoningSheetModel>[0];

function rig(vlevels = 6, copper = 100 * 10_000) {
  const sim = new Sim({
    seed: 3,
    playerClass: 'warrior',
    autoEquip: false,
    world: EMPTY_TEST_WORLD,
  });
  const pid = sim.playerId;
  const meta = sim.players.get(pid) as PlayerMeta;
  sim.setPlayerLevel(MAX_LEVEL);
  meta.lifetimeXp = xpToReachLevel(MAX_LEVEL + vlevels);
  meta.copper = copper;
  for (const slot of ALL_EQUIP_SLOTS) {
    delete meta.equipment[slot];
    delete meta.equipmentInstance[slot];
  }
  sim.addItem(SWORD, 1, pid);
  sim.equipItem(SWORD, pid);
  expect(meta.equipment.mainhand).toBe(SWORD);
  return { sim, meta };
}

describe('buildHoningSheetModel', () => {
  it('lists the worn slots, defaults and falls back the pick, and quotes the sim policy', () => {
    const { sim } = rig();
    const model = buildHoningSheetModel(sim, { stat: 'str' });
    expect(model).toMatchObject({ atCap: true, unspent: 6, picked: 'mainhand', canHone: true });
    expect(model.slots).toEqual([
      { slot: 'mainhand', itemId: SWORD, name: ITEMS[SWORD].name, rank: 0 },
    ]);
    expect(model.info).toMatchObject({ rank: 0, cost: honingCost(0), chance: honingChance(0) });
    expect(buildHoningSheetModel(sim, { slot: 'helmet', stat: 'agi' }).picked).toBe('mainhand');
  });

  it('disables the button when the pool, the purse, the rank, or the cap gate fails', () => {
    expect(buildHoningSheetModel(rig(0).sim, { stat: 'str' }).canHone).toBe(false);
    expect(buildHoningSheetModel(rig(6, 0).sim, { stat: 'str' }).canHone).toBe(false);
    const maxed = rig(60);
    maxed.meta.equipmentInstance.mainhand = {
      honing: { rank: HONING_MAX_RANK, stats: { str: HONING_MAX_RANK } },
    };
    const model = buildHoningSheetModel(maxed.sim, { stat: 'str' });
    expect(model.info?.maxed).toBe(true);
    expect(model.canHone).toBe(false);
    expect(model.slots[0].rank).toBe(HONING_MAX_RANK);
    const low = rig();
    low.sim.setPlayerLevel(MAX_LEVEL - 1);
    low.meta.lifetimeXp = xpToReachLevel(MAX_LEVEL + 9);
    expect(buildHoningSheetModel(low.sim, { stat: 'str' })).toMatchObject({
      atCap: false,
      canHone: false,
    });
  });

  it('a ClientWorld-shaped mirror (sparse einst, vls scalar) yields the same model', () => {
    const { sim } = rig(6);
    const fromSim = buildHoningSheetModel(sim, { slot: 'mainhand', stat: 'agi' });
    const mirror = {
      player: { level: MAX_LEVEL },
      equipment: { mainhand: SWORD },
      equipmentInstances: {},
      lifetimeXp: xpToReachLevel(MAX_LEVEL + 6),
      virtualLevelsSpent: 0,
      copper: 100 * 10_000,
    } as unknown as World;
    expect(buildHoningSheetModel(mirror, { slot: 'mainhand', stat: 'agi' })).toEqual(fromSim);
    const honedMirror = {
      ...mirror,
      equipmentInstances: { mainhand: { honing: { rank: 3, stats: { agi: 3 } } } },
      virtualLevelsSpent: 6,
    } as unknown as World;
    const model = buildHoningSheetModel(honedMirror, { stat: 'agi' });
    expect(model.slots[0].rank).toBe(3);
    expect(model.unspent).toBe(0);
    expect(model.info).toMatchObject({ rank: 3, cost: honingCost(3), chance: honingChance(3) });
    expect(model.canHone).toBe(false);
  });
});

describe('honingSheetHtml', () => {
  it('paints the pool, both picks with the selection and a stable data-act, the quote, the button', () => {
    const { sim } = rig();
    const html = honingSheetHtml(buildHoningSheetModel(sim, { slot: 'mainhand', stat: 'sta' }));
    expect(html).toContain('class="cp-milestones cp-honing ui-card"');
    expect(html).toContain('<b class="cp-honing-pool">6</b>');
    expect(html).toContain('<option value="mainhand" selected>');
    expect(html).toContain('<option value="sta" selected>');
    expect(html).toContain('data-act="hone-slot" data-honing="slot"');
    expect(html).toContain('data-act="hone-stat" data-honing="stat"');
    expect(html).toContain('Cost: 1 in virtual levels and');
    expect(html).toContain('100%');
    expect(html).toContain('data-act="hone"');
    expect(html).not.toContain('data-act="hone" disabled');
  });

  it('disables the button, labels a honed slot with its rank, and shows only the hint before the cap', () => {
    const { sim, meta } = rig(6, 0);
    meta.equipmentInstance.mainhand = { honing: { rank: 2, stats: { str: 2 } } };
    const html = honingSheetHtml(buildHoningSheetModel(sim, { stat: 'str' }));
    expect(html).toContain('data-act="hone" disabled');
    expect(html).toContain('(Honed +2)');
    sim.setPlayerLevel(MAX_LEVEL - 1);
    const low = honingSheetHtml(buildHoningSheetModel(sim, { stat: 'str' }));
    expect(low).toContain('Reach the level cap to hone gear.');
    expect(low).not.toContain('data-honing="slot"');
    expect(low).not.toContain('data-act="hone"');
  });
});
