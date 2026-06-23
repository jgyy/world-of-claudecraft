import { describe, expect, it } from 'vitest';
import { MOBS } from '../src/sim/data';
import { createMob } from '../src/sim/entity';
import { Sim } from '../src/sim/sim';
import { groundHeight } from '../src/sim/world';

const SEED = 20061;
const PREMIUM = 'greyjaw_hide_boots'; // uncommon: opens a roll under default strategies
const COMMON = 'worn_sword'; // common: never master-looted under a rare threshold

function makeSim() {
  return new Sim({ seed: SEED, playerClass: 'warrior' });
}
function teleportTo(sim: Sim, x: number, z: number, pid?: number) {
  const p = sim.entities.get(pid ?? sim.playerId)!;
  p.pos.x = x;
  p.pos.z = z;
  p.pos.y = groundHeight(x, z, sim.cfg.seed);
  p.prevPos = { ...p.pos };
}

// A two-member party (a=leader) standing on a freshly tapped, lootable corpse
// holding `itemId`, with master loot enabled. Returns the pids.
function partyOnCorpse(sim: Sim, itemId: string, mobId = 990500) {
  const a = sim.playerId;
  const b = sim.addPlayer('mage', 'Bert');
  sim.partyInvite(b, a);
  sim.partyAccept(b);
  teleportTo(sim, 20, 20, a);
  teleportTo(sim, 21, 20, b);
  const mob = createMob(mobId, MOBS.forest_wolf, 2, { x: 20, y: 0, z: 22 });
  mob.dead = true;
  mob.lootable = true;
  mob.tappedById = a;
  mob.loot = { copper: 0, items: [{ itemId, count: 1 }] };
  sim.entities.set(mob.id, mob);
  return { a, b, mob };
}

describe('master loot', () => {
  it('routes a threshold drop to the master looter instead of opening a need/greed roll', () => {
    const sim = makeSim();
    const { a, b, mob } = partyOnCorpse(sim, PREMIUM);
    sim.setPartyLootMaster(true, 0, 'uncommon', a); // 0 = leader is master looter

    sim.events.length = 0;
    sim.lootCorpse(mob.id, a);

    expect(sim.events.filter((e) => e.type === 'lootRoll')).toHaveLength(0);
    const prompts = sim.events.filter((e) => e.type === 'masterLoot');
    expect(prompts).toHaveLength(1);
    const prompt = prompts[0] as Extract<typeof prompts[number], { type: 'masterLoot' }>;
    expect(prompt.pid).toBe(a); // sent only to the master looter
    expect(prompt.itemId).toBe(PREMIUM);
    expect(prompt.candidates.map((c) => c.pid).sort()).toEqual([a, b].sort());
    expect(sim.countItem(PREMIUM, a) + sim.countItem(PREMIUM, b)).toBe(0); // nothing awarded yet
  });

  it('awards the item to the assigned member when the master looter assigns it', () => {
    const sim = makeSim();
    const { a, b, mob } = partyOnCorpse(sim, PREMIUM);
    sim.setPartyLootMaster(true, 0, 'uncommon', a);
    sim.lootCorpse(mob.id, a);
    const rollId = sim.events.find((e) => e.type === 'masterLoot')?.rollId;
    if (rollId === undefined) throw new Error('expected master loot prompt');

    sim.events.length = 0;
    sim.assignMasterLoot(rollId, b, a);

    expect(sim.countItem(PREMIUM, b)).toBe(1);
    expect(sim.countItem(PREMIUM, a)).toBe(0);
    expect(sim.events.some((e) => e.type === 'loot' && e.text.includes('assigned'))).toBe(true);
  });

  it('rejects assignment from anyone other than the master looter', () => {
    const sim = makeSim();
    const { a, b, mob } = partyOnCorpse(sim, PREMIUM);
    sim.setPartyLootMaster(true, 0, 'uncommon', a);
    sim.lootCorpse(mob.id, a);
    const rollId = sim.events.find((e) => e.type === 'masterLoot')!.rollId;

    sim.assignMasterLoot(rollId, b, b); // b is not the master looter

    expect(sim.countItem(PREMIUM, a) + sim.countItem(PREMIUM, b)).toBe(0);
  });

  it('leaves below-threshold drops to the normal loot path', () => {
    const sim = makeSim();
    const { a, mob } = partyOnCorpse(sim, COMMON);
    sim.setPartyLootMaster(true, 0, 'rare', a); // rare threshold, item is common

    sim.events.length = 0;
    sim.lootCorpse(mob.id, a);

    expect(sim.events.filter((e) => e.type === 'masterLoot')).toHaveLength(0);
    expect(sim.countItem(COMMON, a)).toBe(1); // looter-takes-all for common items
  });

  it('frees an unassigned drop back to the corpse at timeout', () => {
    const sim = makeSim();
    const { a, mob } = partyOnCorpse(sim, PREMIUM);
    sim.setPartyLootMaster(true, 0, 'uncommon', a);
    sim.lootCorpse(mob.id, a);
    expect(sim.events.some((e) => e.type === 'masterLoot')).toBe(true);

    // Run past the 30s roll timeout.
    for (let i = 0; i < 20 * 31; i++) sim.tick();

    const slot = mob.loot?.items.find((s) => s.itemId === PREMIUM);
    expect(slot?.openToAll).toBe(true);
  });

  it('only the leader can change the loot method', () => {
    const sim = makeSim();
    const { a, b } = partyOnCorpse(sim, PREMIUM);
    sim.setPartyLootMaster(true, 0, 'uncommon', b); // b is not the leader
    expect(sim.partyInfo?.master.enabled).toBe(false);
    sim.setPartyLootMaster(true, 0, 'uncommon', a);
    expect(sim.partyInfo?.master.enabled).toBe(true);
  });

  it('disabled master loot keeps the existing need/greed behavior', () => {
    const sim = makeSim();
    const { a, mob } = partyOnCorpse(sim, PREMIUM);
    // master loot left disabled (default)
    sim.events.length = 0;
    sim.lootCorpse(mob.id, a);
    expect(sim.events.filter((e) => e.type === 'masterLoot')).toHaveLength(0);
    expect(sim.events.filter((e) => e.type === 'lootRoll').length).toBeGreaterThan(0);
  });
});
