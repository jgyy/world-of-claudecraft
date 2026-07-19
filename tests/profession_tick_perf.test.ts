import { describe, expect, it } from 'vitest';
import { GATHER_NODES } from '../src/sim/data';
import { craftItem } from '../src/sim/professions/crafting';
import { applyEnchant } from '../src/sim/professions/enchanting';
import { harvestNode } from '../src/sim/professions/gathering';
import { salvageItem } from '../src/sim/professions/salvage';
import { Sim } from '../src/sim/sim';
import { terrainHeight } from '../src/sim/world';

const WORLD_SEED = 20074;

// Regression coverage this file adds: the four profession command entry points
// (harvestNode/gathering.ts, craftItem/crafting.ts, applyEnchant/enchanting.ts,
// salvageItem/salvage.ts) are the hot path for a busy crafting-hub tick, where many
// players gather/craft/enchant/salvage in the same window. Nothing today budgets that
// per-action cost at scale. There is no dedicated 'professions' cfg.perfLap phase tag
// in sim.tick() (grep confirms the tag list is respawns/worldBosses/groundAoEs/
// frozenOrbs/despawnDecay/projectiles/p.move/p.doors/p.casting/p.autoAtk/p.regen/
// p.auras/mob.update/mob.auras/ent.misc/engaged/duels/cardDuel/arena/trades/
// lootRolls/instances/delves/valecup/dfinder/market/postOffice/delayedEv/deeds/
// gridRefresh, none of which cover profession commands), so per the task's own
// guidance this measures the command entry points directly with performance.now()
// in-test, the same way mob_update_perf/aura_tick_perf measure a tick phase: warm up,
// sample many iterations, take the median.

function teleportOntoNode(sim: Sim, pid: number, nodeIndex: number) {
  const node = GATHER_NODES[nodeIndex % GATHER_NODES.length];
  const p = sim.entities.get(pid);
  if (!p) throw new Error(`missing entity ${pid}`);
  p.pos.x = node.pos.x;
  p.pos.z = node.pos.z;
  p.pos.y = terrainHeight(node.pos.x, node.pos.z, sim.cfg.seed);
  p.prevPos = { ...p.pos };
}

const CRAFT_RECIPE_ID = 'recipe_eastbrook_arming_sword';
const CRAFT_REAGENTS: readonly { itemId: string; count: number }[] = [
  { itemId: 'bone_fragments', count: 2 },
  { itemId: 'linen_scrap', count: 1 },
];
const CRAFT_RESULT_ITEM = 'eastbrook_arming_sword';

const ENCHANT_ID = 'enchant_weapon_might';
const ENCHANT_REAGENT = { itemId: 'arcane_dust', count: 5 };
const SALVAGE_ITEM = 'eastbrook_arming_sword';

// Runs one volley of `actionsPerVolley` profession actions (a mix of gather/craft/
// enchant/salvage, cycling through `playerCount` players), granting the exact
// reagents each action consumes just before it runs so bag state never blocks the
// hot path. Returns the median per-action ms across VOLLEYS samples.
function measureProfessionActionMedian(playerCount: number, actionsPerVolley: number): number {
  const sim = new Sim({
    seed: WORLD_SEED,
    playerClass: 'warrior',
    autoEquip: false,
    noPlayer: true,
  });
  const pids: number[] = [];
  for (let i = 0; i < playerCount; i++) {
    const pid = sim.addPlayer('warrior', `Crafter${i}`);
    teleportOntoNode(sim, pid, i);
    pids.push(pid);
  }

  const doAction = (index: number): void => {
    const pid = pids[index % pids.length];
    const kind = index % 4;
    if (kind === 0) {
      // Gathering: each player's node cooldown resets on harvest, and cycling
      // through GATHER_NODES round-robin per player avoids the immediate re-harvest
      // cooldown on the SAME node for the SAME player.
      teleportOntoNode(sim, pid, index);
      harvestNode(sim.ctx, GATHER_NODES[index % GATHER_NODES.length].id, pid);
    } else if (kind === 1) {
      for (const reagent of CRAFT_REAGENTS) sim.addItem(reagent.itemId, reagent.count, pid);
      craftItem(sim.ctx, CRAFT_RECIPE_ID, pid);
    } else if (kind === 2) {
      sim.addItem(CRAFT_RESULT_ITEM, 1, pid);
      sim.addItem(ENCHANT_REAGENT.itemId, ENCHANT_REAGENT.count, pid);
      applyEnchant(sim.ctx, CRAFT_RESULT_ITEM, ENCHANT_ID, pid);
    } else {
      sim.addItem(SALVAGE_ITEM, 1, pid);
      salvageItem(sim.ctx, SALVAGE_ITEM, pid);
    }
  };

  // Warm up.
  for (let i = 0; i < actionsPerVolley; i++) doAction(i);

  const VOLLEYS = 40;
  const samples: number[] = [];
  for (let v = 0; v < VOLLEYS; v++) {
    const t0 = performance.now();
    for (let i = 0; i < actionsPerVolley; i++) doAction(v * actionsPerVolley + i);
    samples.push((performance.now() - t0) / actionsPerVolley);
  }
  samples.sort((a, b) => a - b);
  return samples[Math.floor(samples.length / 2)];
}

describe('profession command (gather/craft/enchant/salvage) perf budget', () => {
  it('bounds the per-action cost of a busy crafting-hub volley', () => {
    const PLAYERS = 50;
    const ACTIONS = 200;
    const median = measureProfessionActionMedian(PLAYERS, ACTIONS);

    console.log(
      `[profession action perf] players=${PLAYERS} actionsPerVolley=${ACTIONS} medianPerAction=${median.toFixed(4)}ms`,
    );

    // Generous by design (see mob_update_perf.test.ts): each of these four commands
    // is a bounded reagent check plus a handful of bag/state writes for ONE player, an
    // operation with a healthy median well under a ms; 5ms leaves ample headroom for
    // slow/contended CI while still catching an order-of-magnitude regression.
    expect(median).toBeLessThan(5);
  }, 60_000);

  it('doubling actions per volley does not more than roughly double the per-action cost', () => {
    const PLAYERS = 30;
    const SMALL = 80;
    const LARGE = SMALL * 2;

    const smallMedian = measureProfessionActionMedian(PLAYERS, SMALL);
    const largeMedian = measureProfessionActionMedian(PLAYERS, LARGE);

    console.log(
      `[profession action perf] scaling players=${PLAYERS} small=${SMALL}actions(${smallMedian.toFixed(4)}ms) ` +
        `large=${LARGE}actions(${largeMedian.toFixed(4)}ms) ratio=${(largeMedian / Math.max(smallMedian, 0.0001)).toFixed(2)}x`,
    );

    // A doubled action volume doing genuinely per-action linear work should land near
    // 2x; the bound is set generously above that (3.5x) to absorb noise at these tiny
    // absolute ms magnitudes while still failing hard on a quadratic blowup.
    expect(largeMedian).toBeLessThan(Math.max(smallMedian * 3.5, 2));
  }, 60_000);

  it('actually completed a mix of gather/craft/enchant/salvage actions (shape sanity)', () => {
    const sim = new Sim({
      seed: WORLD_SEED + 1,
      playerClass: 'warrior',
      autoEquip: false,
      noPlayer: true,
    });
    const pids: number[] = [];
    for (let i = 0; i < 20; i++) {
      const pid = sim.addPlayer('warrior', `Crafter${i}`);
      teleportOntoNode(sim, pid, i);
      pids.push(pid);
    }

    let gathered = 0;
    let crafted = 0;
    let enchanted = 0;
    let salvaged = 0;
    for (let i = 0; i < 80; i++) {
      const pid = pids[i % pids.length];
      const kind = i % 4;
      if (kind === 0) {
        teleportOntoNode(sim, pid, i);
        if (harvestNode(sim.ctx, GATHER_NODES[i % GATHER_NODES.length].id, pid)) gathered++;
      } else if (kind === 1) {
        for (const reagent of CRAFT_REAGENTS) sim.addItem(reagent.itemId, reagent.count, pid);
        if (craftItem(sim.ctx, CRAFT_RECIPE_ID, pid).ok) crafted++;
      } else if (kind === 2) {
        sim.addItem(CRAFT_RESULT_ITEM, 1, pid);
        sim.addItem(ENCHANT_REAGENT.itemId, ENCHANT_REAGENT.count, pid);
        if (applyEnchant(sim.ctx, CRAFT_RESULT_ITEM, ENCHANT_ID, pid).ok) enchanted++;
      } else {
        sim.addItem(SALVAGE_ITEM, 1, pid);
        if (salvageItem(sim.ctx, SALVAGE_ITEM, pid).ok) salvaged++;
      }
    }

    expect(gathered).toBeGreaterThan(0);
    expect(crafted).toBeGreaterThan(0);
    expect(enchanted).toBeGreaterThan(0);
    expect(salvaged).toBeGreaterThan(0);
  });
});
