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

  it('persists a turned-in daily across serializeCharacter/addPlayer so a relog cannot re-offer it', () => {
    const sim = makeSim();
    const npc = standAtMarshal(sim);
    sim.talkToNpc(npc.id, sim.playerId);
    const dailyId = sim.dailyQuests!.questIds[0];
    const quest = QUESTS[dailyId];

    sim.acceptQuest(dailyId, sim.playerId);
    const qp = sim.questLog.get(dailyId);
    qp!.counts = quest.objectives.map((o) => o.count ?? 1);
    qp!.state = 'ready';
    sim.turnInQuest(dailyId, sim.playerId);
    expect(sim.questState(dailyId)).toBe('unavailable');

    // Simulate a relog: serialize the character, then rejoin a fresh Sim from
    // that saved state (same day, same clock).
    const saved = sim.serializeCharacter(sim.playerId);
    expect(saved).not.toBeNull();
    expect(saved!.dailyQuests?.questIds).not.toContain(dailyId);
    expect(saved!.dailyQuestsMeta?.consumedIds).toContain(dailyId);

    const sim2 = new Sim({
      seed: 4242,
      playerClass: 'warrior',
      playerName: 'Bram',
      autoEquip: false,
      lockoutNowMs: () => now,
      raidResetMs,
      noPlayer: true,
    });
    sim2.addPlayer('warrior', 'Bram', { state: saved! });
    const npc2 = standAtMarshal(sim2);
    sim2.talkToNpc(npc2.id, sim2.playerId);

    // The relog must not re-offer the already-turned-in daily, and must not
    // re-roll a fresh set for the same day.
    expect(sim2.questState(dailyId)).toBe('unavailable');
    expect(sim2.dailyQuests!.questIds).not.toContain(dailyId);
    expect(sim2.dailyQuests!.day).toBe(saved!.dailyQuests!.day);
  });

  it('re-rolls (without losing turned-in credit) once a level-up widens the eligible pool', () => {
    const sim = new Sim({
      seed: 4242,
      playerClass: 'warrior',
      playerName: 'Bram',
      autoEquip: false,
      lockoutNowMs: () => now,
      raidResetMs,
    });
    sim.player.level = 1; // below every daily's minLevel: first roll is empty
    const npc = standAtMarshal(sim);
    sim.talkToNpc(npc.id, sim.playerId);
    expect(sim.dailyQuests!.questIds).toEqual([]);
    const day1 = sim.dailyQuests!.day;

    // Level up mid-day past the daily gate, then talk again (same day).
    sim.player.level = 5;
    now += 60_000;
    sim.talkToNpc(npc.id, sim.playerId);
    expect(sim.dailyQuests!.day).toBe(day1);
    expect(sim.dailyQuests!.questIds).toHaveLength(3);
  });

  // Regression for review finding: ensureDailyQuests' level-up re-roll must
  // cap the OFFERED set at DAILY_QUEST_COUNT minus what's already been turned
  // in today, not just re-cap at DAILY_QUEST_COUNT. Turn in one daily at a
  // level whose eligible pool is a strict subset of DAILY_QUEST_COUNT, then
  // level up mid-day so the fresh roll draws from a wider pool: without the
  // fix the player could end up with 1 consumed + 3 freshly offered, 4 for the
  // day total, breaking the once-per-day contract.
  it('never exceeds DAILY_QUEST_COUNT total (consumed + offered) after a level-up re-roll', () => {
    const sim = new Sim({
      seed: 4242,
      playerClass: 'warrior',
      playerName: 'Bram',
      autoEquip: false,
      lockoutNowMs: () => now,
      raidResetMs,
    });
    sim.player.level = 2; // narrow eligible pool at this level
    const npc = standAtMarshal(sim);
    sim.talkToNpc(npc.id, sim.playerId);
    const firstRoll = [...sim.dailyQuests!.questIds];
    expect(firstRoll.length).toBeGreaterThan(0);

    const dailyId = firstRoll[0];
    const quest = QUESTS[dailyId];
    sim.acceptQuest(dailyId, sim.playerId);
    const qp = sim.questLog.get(dailyId);
    qp!.counts = quest.objectives.map((o) => o.count ?? 1);
    qp!.state = 'ready';
    sim.turnInQuest(dailyId, sim.playerId);

    // Level up mid-day past every daily's minLevel, then talk again (same day)
    // to trigger the eligible-pool-widened re-roll.
    sim.player.level = 10;
    now += 60_000;
    sim.talkToNpc(npc.id, sim.playerId);

    const saved = sim.serializeCharacter(sim.playerId);
    const consumedCount = saved?.dailyQuestsMeta?.consumedIds.length ?? 0;
    const offeredCount = sim.dailyQuests?.questIds.length ?? 0;
    expect(consumedCount + offeredCount).toBeLessThanOrEqual(3);
    expect(consumedCount).toBe(1);
    expect(sim.dailyQuests!.questIds).not.toContain(dailyId);
  });

  // Pins the design invariant the whole "local PRNG, not the shared stream"
  // argument rests on: rolling the daily set must leave sim.rng at the exact
  // same position it would be at without a roll. Two identically-seeded sims,
  // one that talks to Marshal Redbrook (rolling dailies) and one that doesn't,
  // must draw the identical subsequent sequence from the shared Rng. Without
  // this pin, a future refactor to draw from ctx.rng instead of the local
  // mulberry32 would only be caught by the much blunter parity fixture digests.
  it('rolling the daily set draws zero times from the shared sim Rng', () => {
    const untouched = makeSim();
    const rolled = makeSim();

    const npc = standAtMarshal(rolled);
    rolled.talkToNpc(npc.id, rolled.playerId);
    expect(rolled.dailyQuests!.questIds).toHaveLength(3);

    const untouchedDraws = Array.from({ length: 10 }, () => untouched.rng.next());
    const rolledDraws = Array.from({ length: 10 }, () => rolled.rng.next());
    expect(rolledDraws).toEqual(untouchedDraws);
  });
});
