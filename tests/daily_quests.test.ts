import { beforeEach, describe, expect, it } from 'vitest';
import { QUESTS } from '../src/sim/data';
import { Sim } from '../src/sim/sim';
import type { Entity } from '../src/sim/types';

// A day-aligned raid-reset boundary so the injected clock drives a clean day
// index (the same step-function shape the server's 3 AM reset has).
const DAY_MS = 24 * 60 * 60 * 1000;
const raidResetMs = (nowMs: number) => Math.ceil((nowMs + 1) / DAY_MS) * DAY_MS;

function marshal(sim: Sim): Entity {
  const npc = [...sim.entities.values()].find(
    (e): e is Entity => e.kind === 'npc' && e.templateId === 'marshal_redbrook',
  );
  if (!npc) throw new Error('marshal_redbrook not found');
  return npc;
}

function standAtMarshal(sim: Sim): Entity {
  const npc = marshal(sim);
  const pos = sim.groundPos(npc.pos.x + 1, npc.pos.z);
  sim.player.pos = { ...pos };
  sim.player.prevPos = { ...pos };
  return npc;
}

describe('daily quests (Marshal Redbrook rotation)', () => {
  let now = 1000;
  function makeSim(): Sim {
    const sim = new Sim({
      seed: 4242,
      playerClass: 'warrior',
      playerName: 'Bram',
      autoEquip: false,
      lockoutNowMs: () => now,
      raidResetMs,
    });
    sim.player.level = 5; // above every daily's minLevel (max 4)
    return sim;
  }

  beforeEach(() => {
    now = 1000;
  });

  it('content: 8 dailies wired to marshal_redbrook, repeatable + isDaily, modest rewards', () => {
    const dailyIds = Object.keys(QUESTS).filter((id) => QUESTS[id].isDaily);
    expect(dailyIds.length).toBe(8);
    for (const id of dailyIds) {
      const q = QUESTS[id];
      expect(q.giverNpcId).toBe('marshal_redbrook');
      expect(q.turnInNpcId).toBe('marshal_redbrook');
      expect(q.repeatable).toBe(true);
      expect(q.isDaily).toBe(true);
      expect(q.xpReward).toBeGreaterThan(0);
      // Roughly half a comparable starter quest (q_wolves is 250 xp).
      expect(q.xpReward).toBeLessThan(250);
    }
  });

  it('rolls exactly 3 dailies on talk, and only those show available', () => {
    const sim = makeSim();
    const npc = standAtMarshal(sim);
    sim.talkToNpc(npc.id, sim.playerId);

    const rolled = sim.dailyQuests;
    expect(rolled).toBeDefined();
    expect(rolled!.questIds).toHaveLength(3);

    // Every rolled daily is available; a daily NOT rolled is unavailable.
    for (const id of rolled!.questIds) expect(sim.questState(id)).toBe('available');
    const notRolled = Object.keys(QUESTS).filter(
      (id) => QUESTS[id].isDaily && !rolled!.questIds.includes(id),
    );
    expect(notRolled.length).toBeGreaterThan(0);
    for (const id of notRolled) expect(sim.questState(id)).toBe('unavailable');
  });

  it('keeps the same 3 dailies across a second talk on the same day', () => {
    const sim = makeSim();
    const npc = standAtMarshal(sim);
    sim.talkToNpc(npc.id, sim.playerId);
    const first = [...sim.dailyQuests!.questIds];

    const day1 = sim.dailyQuests!.day;
    now += 60_000; // still the same server day
    sim.talkToNpc(npc.id, sim.playerId);
    expect(sim.dailyQuests!.questIds).toEqual(first);
    expect(sim.dailyQuests!.day).toBe(day1);
  });

  it('accepts and turns in a daily for xp + copper; blocks a second same-day turn-in; re-rolls next day', () => {
    const sim = makeSim();
    const npc = standAtMarshal(sim);
    sim.talkToNpc(npc.id, sim.playerId);
    const rolledDay1 = [...sim.dailyQuests!.questIds];
    const dailyId = rolledDay1[0];
    const quest = QUESTS[dailyId];

    // Accept the rolled daily (near the giver, available).
    sim.acceptQuest(dailyId, sim.playerId);
    expect(sim.questState(dailyId)).toBe('active');

    // Force its objectives complete so it is ready to hand in.
    const qp = sim.questLog.get(dailyId);
    expect(qp).toBeDefined();
    qp!.counts = quest.objectives.map((o) => o.count ?? 1);
    qp!.state = 'ready';
    expect(sim.questState(dailyId)).toBe('ready');

    const copperBefore = sim.copper;
    const xpBefore = sim.xp;
    sim.turnInQuest(dailyId, sim.playerId);

    expect(sim.questsDone.has(dailyId)).toBe(true);
    expect(sim.copper - copperBefore).toBe(quest.copperReward);
    expect(sim.xp).toBeGreaterThan(xpBefore);

    // Consumed for the day: not in the log, and unavailable until the next roll.
    expect(sim.questLog.has(dailyId)).toBe(false);
    expect(sim.dailyQuests!.questIds).not.toContain(dailyId);
    expect(sim.questState(dailyId)).toBe('unavailable');

    // Advance past the reset boundary and talk again: a fresh set is rolled for
    // a new day index, and the consumed daily can come back into rotation.
    const dayBefore = sim.dailyQuests!.day;
    now = 2 * DAY_MS + 1000;
    sim.talkToNpc(npc.id, sim.playerId);
    expect(sim.dailyQuests!.questIds).toHaveLength(3);
    expect(sim.dailyQuests!.day).not.toBe(dayBefore);
  });
});
