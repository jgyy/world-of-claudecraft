// The Honing card's pure core (src/ui/honing_sheet_view.ts) over a real
// offline Sim (which satisfies IWorld): the worn-slot list, the default and
// explicit picks, the next rank's cost and chance quoted from the sim's own
// policy, the button's enabled state across the pool, purse, cap, and max
// gates, and the pre-cap card that shows only the pool line and the hint.
import { describe, expect, it } from 'vitest';
import { ITEMS } from '../src/sim/data';
import { HONING_MAX_RANK, honingChance, honingCost } from '../src/sim/progression/honing_policy';
import { type PlayerMeta, Sim } from '../src/sim/sim';
import { ALL_EQUIP_SLOTS, MAX_LEVEL, xpToReachLevel } from '../src/sim/types';
import { buildHoningSheetModel, honingSheetHtml } from '../src/ui/honing_sheet_view';
import { EMPTY_TEST_WORLD } from './sim_shared';

const SWORD = 'eastbrook_arming_sword';

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
  // Only the sword is worn, so the slot list and the default pick are exact.
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
  it('lists the worn slots, defaults the pick to the first, and quotes the sim policy', () => {
    const { sim } = rig();
    const model = buildHoningSheetModel(sim, { stat: 'str' });
    expect(model.atCap).toBe(true);
    expect(model.unspent).toBe(6);
    expect(model.slots).toEqual([
      { slot: 'mainhand', itemId: SWORD, name: ITEMS[SWORD].name, rank: 0 },
    ]);
    expect(model.picked).toBe('mainhand');
    expect(model.stat).toBe('str');
    expect(model.info).toMatchObject({ rank: 0, cost: honingCost(0), chance: honingChance(0) });
    expect(model.canHone).toBe(true);
  });

  it('falls back to the first worn slot when the pick names an empty one', () => {
    const { sim } = rig();
    expect(buildHoningSheetModel(sim, { slot: 'helmet', stat: 'agi' }).picked).toBe('mainhand');
  });

  it('disables the button when the pool, the purse, or the rank gate fails', () => {
    expect(buildHoningSheetModel(rig(0).sim, { stat: 'str' }).canHone).toBe(false);
    expect(buildHoningSheetModel(rig(6, 0).sim, { stat: 'str' }).canHone).toBe(false);
    const { sim, meta } = rig(60);
    meta.equipmentInstance.mainhand = {
      honing: { rank: HONING_MAX_RANK, stats: { str: HONING_MAX_RANK } },
    };
    const model = buildHoningSheetModel(sim, { stat: 'str' });
    expect(model.info?.maxed).toBe(true);
    expect(model.canHone).toBe(false);
    expect(model.slots[0].rank).toBe(HONING_MAX_RANK);
  });

  it('reads the pool as zero and the card as pre-cap under the level cap', () => {
    const { sim, meta } = rig();
    sim.setPlayerLevel(MAX_LEVEL - 1);
    meta.lifetimeXp = xpToReachLevel(MAX_LEVEL + 9);
    const model = buildHoningSheetModel(sim, { stat: 'str' });
    expect(model.atCap).toBe(false);
    expect(model.canHone).toBe(false);
  });
});

describe('honingSheetHtml', () => {
  it('paints the pool, both picks with the current selection, the quote, and an enabled button', () => {
    const { sim } = rig();
    const html = honingSheetHtml(buildHoningSheetModel(sim, { slot: 'mainhand', stat: 'sta' }));
    expect(html).toContain('class="cp-milestones cp-honing ui-card"');
    expect(html).toContain('<b class="cp-honing-pool">6</b>');
    expect(html).toContain('<option value="mainhand" selected>');
    expect(html).toContain('<option value="sta" selected>');
    expect(html).toContain('data-honing="slot"');
    expect(html).toContain('data-honing="stat"');
    expect(html).toContain('data-act="hone"');
    expect(html).not.toContain('data-act="hone" disabled');
    expect(html).toContain('100%');
  });

  it('disables the button and labels a honed slot with its rank', () => {
    const { sim, meta } = rig(6, 0);
    meta.equipmentInstance.mainhand = { honing: { rank: 2, stats: { str: 2 } } };
    const html = honingSheetHtml(buildHoningSheetModel(sim, { stat: 'str' }));
    expect(html).toContain('data-act="hone" disabled');
    expect(html).toContain('(Honed +2)');
  });

  it('shows only the pool and the cap hint before the cap', () => {
    const { sim } = rig();
    sim.setPlayerLevel(MAX_LEVEL - 1);
    const html = honingSheetHtml(buildHoningSheetModel(sim, { stat: 'str' }));
    expect(html).toContain('Reach the level cap to hone gear.');
    expect(html).not.toContain('data-honing="slot"');
    expect(html).not.toContain('data-act="hone"');
  });
});
