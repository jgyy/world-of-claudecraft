// The party gates (src/sim/party_gate.ts): the mage Grand Portal to Highwatch
// and the warlock Hellgate, cast through the real castAbility path and
// stepped through with the real pickUpObject interact.

import { describe, expect, it } from 'vitest';
import {
  GRAND_PORTAL_DURATION,
  GRAND_PORTAL_OBJECT_ITEM_ID,
  GRAND_TELEPORT_COOLDOWN,
  GRAND_TELEPORT_LEARN_LEVEL,
  grandTeleportDestination,
  RUNE_OF_PASSAGE_ITEM_ID,
} from '../src/sim/content/grand_teleports';
import {
  HELLGATE_ABILITY_ID,
  HELLGATE_BLEED_AURA_ID,
  HELLGATE_DURATION,
  HELLGATE_FINAL_QUEST_ID,
  HELLGATE_OBJECT_ITEM_ID,
} from '../src/sim/content/hellgate';
import { ABILITIES, arenaOrigin } from '../src/sim/data';
import { Sim } from '../src/sim/sim';
import type { SimContext } from '../src/sim/sim_context';
import type { Entity, SimEvent } from '../src/sim/types';
import { localizeSimText } from '../src/ui/sim_i18n';

const PORTAL_ID = 'grand_teleport_highwatch';

function ctx(sim: Sim): SimContext {
  return (sim as unknown as { ctx: SimContext }).ctx;
}

function entity(sim: Sim, id: number): Entity {
  const found = sim.entities.get(id);
  if (!found) throw new Error(`Missing test entity ${id}`);
  return found;
}

function gates(sim: Sim, objectItemId: string): Entity[] {
  return [...sim.entities.values()].filter(
    (e) => e.kind === 'object' && e.objectItemId === objectItemId && e.partyGate !== undefined,
  );
}

function errorsFor(sim: Sim, pid: number): string[] {
  return sim.events
    .filter((e): e is Extract<SimEvent, { type: 'error' }> => e.type === 'error' && e.pid === pid)
    .map((e) => e.text);
}

function logsFor(sim: Sim, pid: number): string[] {
  return sim.events
    .filter((e): e is Extract<SimEvent, { type: 'log' }> => e.type === 'log' && e.pid === pid)
    .map((e) => e.text);
}

/** tick() drains the event list; collect what the ticks emitted. */
function ticks(sim: Sim, n: number): SimEvent[] {
  const out: SimEvent[] = [];
  for (let i = 0; i < n; i++) out.push(...sim.tick());
  return out;
}

function errorTexts(events: SimEvent[], pid: number): string[] {
  return events
    .filter((e): e is Extract<SimEvent, { type: 'error' }> => e.type === 'error' && e.pid === pid)
    .map((e) => e.text);
}

/** The kit the real resolver (abilitiesKnownAt) currently grants `pid`. */
function known(sim: Sim, pid: number): Set<string> {
  const meta = sim.meta(pid);
  if (!meta) throw new Error('missing meta');
  return new Set(meta.known.map((k) => k.def.id));
}

function learnQuest(sim: Sim, pid: number, questId: string): void {
  const meta = sim.meta(pid);
  if (!meta) throw new Error('missing meta');
  meta.questsDone.add(questId);
  ctx(sim).refreshKnownAbilities(meta, false);
}

function mageWorld() {
  const sim = new Sim({ seed: 7, playerClass: 'mage', noPlayer: true });
  const mageId = sim.addPlayer('mage', 'Portalist');
  const allyId = sim.addPlayer('warrior', 'Companion');
  const strangerId = sim.addPlayer('rogue', 'Stranger');
  sim.setPlayerLevel(GRAND_TELEPORT_LEARN_LEVEL, mageId);
  sim.partyInvite(allyId, mageId);
  sim.partyAccept(allyId);
  const mage = entity(sim, mageId);
  mage.resource = mage.maxResource;
  sim.events.length = 0;
  return { sim, mageId, allyId, strangerId, mage };
}

describe('Grand Teleport (mage party gate to Highwatch)', () => {
  it('is one ordinary level 20 mage spell: no quest gate, no tome, a 20 min cooldown', () => {
    const def = ABILITIES[PORTAL_ID];
    expect(def).toBeDefined();
    expect(def.class).toBe('mage');
    expect(def.learnLevel).toBe(GRAND_TELEPORT_LEARN_LEVEL);
    expect(def.requiresQuest).toBeUndefined();
    expect(def.cooldown).toBe(GRAND_TELEPORT_COOLDOWN);
    expect(def.reagent).toEqual({ itemId: RUNE_OF_PASSAGE_ITEM_ID, count: 1 });
    expect(Object.keys(ABILITIES).filter((id) => id.startsWith('grand_teleport_'))).toEqual([
      PORTAL_ID,
    ]);

    // Known at 20, unknown at 19, through the real kit resolver.
    const sim = new Sim({ seed: 7, playerClass: 'mage', noPlayer: true });
    const pid = sim.addPlayer('mage', 'Apprentice');
    sim.setPlayerLevel(GRAND_TELEPORT_LEARN_LEVEL - 1, pid);
    expect(known(sim, pid).has(PORTAL_ID)).toBe(false);
    sim.setPlayerLevel(GRAND_TELEPORT_LEARN_LEVEL, pid);
    expect(known(sim, pid).has(PORTAL_ID)).toBe(true);
  });

  it('refuses the cast without a Rune of Passage and consumes one when it fires', () => {
    const { sim, mageId, allyId, mage } = mageWorld();
    sim.castAbility(PORTAL_ID, mageId);
    expect(mage.castingAbility).toBeNull();
    expect(errorsFor(sim, mageId)).toContain('You do not have the required reagent.');

    sim.addItem(RUNE_OF_PASSAGE_ITEM_ID, 2, mageId);
    sim.events.length = 0;
    sim.castAbility(PORTAL_ID, mageId);
    expect(mage.castingAbility).toBe(PORTAL_ID);
    // The reagent leaves with the mana at completion, not at cast start.
    expect(sim.countItem(RUNE_OF_PASSAGE_ITEM_ID, mageId)).toBe(2);
    ticks(sim, 20 * 11);
    expect(sim.countItem(RUNE_OF_PASSAGE_ITEM_ID, mageId)).toBe(1);
    expect(mage.cooldowns.get(PORTAL_ID) ?? 0).toBeGreaterThan(GRAND_TELEPORT_COOLDOWN - 15);

    const [portal] = gates(sim, GRAND_PORTAL_OBJECT_ITEM_ID);
    expect(portal).toBeDefined();
    expect(portal.name).toBe('Grand Portal');
    expect(portal.templateId).toBe('grand_portal');
    expect(portal.partyGate).toEqual({
      ownerId: mageId,
      partyId: 1,
      eligiblePlayerIds: [mageId, allyId],
      destination: 'highwatch',
    });
    expect(portal.despawnTimer).toBeGreaterThan(GRAND_PORTAL_DURATION - 2);
  });

  it('refuses at completion when the rune left the bags mid-cast', () => {
    const { sim, mageId, mage } = mageWorld();
    sim.addItem(RUNE_OF_PASSAGE_ITEM_ID, 1, mageId);
    sim.castAbility(PORTAL_ID, mageId);
    ticks(sim, 20 * 5);
    sim.removeItem(RUNE_OF_PASSAGE_ITEM_ID, 1, mageId);
    const emitted = ticks(sim, 20 * 6);
    expect(mage.castingAbility).toBeNull();
    expect(gates(sim, GRAND_PORTAL_OBJECT_ITEM_ID)).toHaveLength(0);
    expect(errorTexts(emitted, mageId)).toContain('You do not have the required reagent.');
    expect(mage.cooldowns.has(PORTAL_ID)).toBe(false);
  });

  it('carries an eligible group member to the Highwatch landing and refuses a stranger', () => {
    const { sim, mageId, allyId, strangerId } = mageWorld();
    sim.addItem(RUNE_OF_PASSAGE_ITEM_ID, 1, mageId);
    sim.castAbility(PORTAL_ID, mageId);
    ticks(sim, 20 * 11);
    const [portal] = gates(sim, GRAND_PORTAL_OBJECT_ITEM_ID);
    const landing = grandTeleportDestination('highwatch')?.landing;
    if (!landing) throw new Error('missing destination');

    sim.events.length = 0;
    expect(sim.pickUpObject(portal.id, strangerId)).toBe(true);
    expect(errorsFor(sim, strangerId)).toContain('That ally is not in your group.');
    const stranger = entity(sim, strangerId);
    expect(Math.hypot(stranger.pos.x - landing.x, stranger.pos.z - landing.z)).toBeGreaterThan(50);

    sim.events.length = 0;
    expect(sim.pickUpObject(portal.id, allyId)).toBe(true);
    const ally = entity(sim, allyId);
    expect(ally.pos.x).toBeCloseTo(landing.x, 5);
    expect(ally.pos.z).toBeCloseTo(landing.z, 5);
    expect(logsFor(sim, allyId)).toContain('You step through the portal to Highwatch.');

    // Combat blocks the step.
    const mage = entity(sim, mageId);
    mage.inCombat = true;
    sim.events.length = 0;
    expect(sim.pickUpObject(portal.id, mageId)).toBe(true);
    expect(errorsFor(sim, mageId)).toContain("You can't do that while in combat.");
  });

  it('expires after its duration and replaces the same mage previous portal', () => {
    const { sim, mageId, mage } = mageWorld();
    sim.addItem(RUNE_OF_PASSAGE_ITEM_ID, 2, mageId);
    sim.castAbility(PORTAL_ID, mageId);
    ticks(sim, 20 * 11);
    const [first] = gates(sim, GRAND_PORTAL_OBJECT_ITEM_ID);
    mage.cooldowns.clear();
    mage.resource = mage.maxResource;
    sim.castAbility(PORTAL_ID, mageId);
    ticks(sim, 20 * 11);
    const live = gates(sim, GRAND_PORTAL_OBJECT_ITEM_ID);
    expect(live).toHaveLength(1);
    expect(live[0].id).not.toBe(first.id);
    // The authored 5 minute timer, shortened here so the suite stays quick.
    expect(live[0].despawnTimer).toBeGreaterThan(GRAND_PORTAL_DURATION - 2);
    live[0].despawnTimer = 1;
    ticks(sim, 20 * 2);
    expect(gates(sim, GRAND_PORTAL_OBJECT_ITEM_ID)).toHaveLength(0);
  });

  it('hands the rune and the cooldown back when the summon cannot land', () => {
    const { sim, mageId, mage } = mageWorld();
    sim.addItem(RUNE_OF_PASSAGE_ITEM_ID, 1, mageId);
    const effect = ABILITIES[PORTAL_ID].effects[0];
    if (effect.type !== 'summonGrandPortal') throw new Error('unexpected effect shape');
    const real = effect.destination;
    // A destination the content table cannot resolve is the one summon
    // failure a test can force without crowding a hub with 32 objects.
    effect.destination = 'nowhere';
    try {
      sim.castAbility(PORTAL_ID, mageId);
      const emitted = ticks(sim, 20 * 11);
      expect(gates(sim, GRAND_PORTAL_OBJECT_ITEM_ID)).toHaveLength(0);
      expect(errorTexts(emitted, mageId)).toContain('There is not enough room here.');
      expect(sim.countItem(RUNE_OF_PASSAGE_ITEM_ID, mageId)).toBe(1);
      expect(mage.cooldowns.has(PORTAL_ID)).toBe(false);
    } finally {
      effect.destination = real;
    }
  });

  it('outlives its mage: the group keeps the exit after the caster dies', () => {
    const { sim, mageId, mage } = mageWorld();
    sim.addItem(RUNE_OF_PASSAGE_ITEM_ID, 1, mageId);
    sim.castAbility(PORTAL_ID, mageId);
    ticks(sim, 20 * 11);
    ctx(sim).handleDeath(mage, null);
    ticks(sim, 2);
    expect(gates(sim, GRAND_PORTAL_OBJECT_ITEM_ID)).toHaveLength(1);
  });

  it('labels the portal through the sim text matcher, never a bare English fallback', () => {
    const { sim, mageId } = mageWorld();
    sim.addItem(RUNE_OF_PASSAGE_ITEM_ID, 1, mageId);
    sim.castAbility(PORTAL_ID, mageId);
    ticks(sim, 20 * 11);
    const [portal] = gates(sim, GRAND_PORTAL_OBJECT_ITEM_ID);
    expect(localizeSimText(portal.name)).not.toBeNull();
  });
});

function warlockWorld() {
  const sim = new Sim({ seed: 11, playerClass: 'warlock', noPlayer: true });
  const ownerId = sim.addPlayer('warlock', 'Gatekeeper');
  const allyId = sim.addPlayer('warrior', 'Companion');
  const strangerId = sim.addPlayer('mage', 'Stranger');
  sim.setPlayerLevel(20, ownerId);
  sim.partyInvite(allyId, ownerId);
  sim.partyAccept(allyId);
  learnQuest(sim, ownerId, HELLGATE_FINAL_QUEST_ID);
  const owner = entity(sim, ownerId);
  owner.resource = owner.maxResource;
  sim.events.length = 0;
  return { sim, ownerId, allyId, strangerId, owner };
}

function openGate(sim: Sim, ownerId: number): Entity {
  sim.castAbility(HELLGATE_ABILITY_ID, ownerId);
  ticks(sim, 20 * 11);
  const [gate] = gates(sim, HELLGATE_OBJECT_ITEM_ID);
  if (!gate) throw new Error('Missing test Hellgate');
  return gate;
}

describe('Hellgate (warlock party gate)', () => {
  it('is gated on the pact final quest, not on level alone', () => {
    const sim = new Sim({ seed: 11, playerClass: 'warlock', noPlayer: true });
    const pid = sim.addPlayer('warlock', 'Unpacted');
    sim.setPlayerLevel(20, pid);
    expect(known(sim, pid).has(HELLGATE_ABILITY_ID)).toBe(false);
    learnQuest(sim, pid, HELLGATE_FINAL_QUEST_ID);
    expect(known(sim, pid).has(HELLGATE_ABILITY_ID)).toBe(true);
  });

  it('opens a gate with the toll aura, which bleeds 1% per second and stops health regen', () => {
    const { sim, ownerId, allyId, owner } = warlockWorld();
    const gate = openGate(sim, ownerId);
    expect(gate.name).toBe('Hellgate');
    expect(gate.templateId).toBe('hellgate');
    expect(gate.partyGate).toEqual({
      ownerId,
      partyId: 1,
      eligiblePlayerIds: [ownerId, allyId],
    });
    const toll = owner.auras.find((a) => a.id === HELLGATE_BLEED_AURA_ID);
    expect(toll).toMatchObject({ kind: 'dot', noRegen: true, sourceId: ownerId });
    expect(toll?.value).toBe(Math.max(1, Math.round(owner.maxHp * 0.01)));

    // Out of combat, below full: natural regen would normally refill this.
    owner.hp = Math.floor(owner.maxHp * 0.5);
    const before = owner.hp;
    ticks(sim, 20 * 10);
    expect(owner.inCombat).toBe(false);
    const expectedLoss = Math.round(owner.maxHp * 0.01) * 10;
    expect(before - owner.hp).toBeGreaterThanOrEqual(expectedLoss - 2);
    expect(before - owner.hp).toBeLessThanOrEqual(expectedLoss + 2);
  });

  it('leaves every OTHER self-sourced dot on the real damage path: Bad Air still kills', () => {
    // The delve Bad Air affix (delves/runs.ts tickDelveBadAir) is also a
    // self-sourced player dot. The toll branch is keyed on the Hellgate aura
    // id, so Bad Air keeps running through dealDamage and can be lethal.
    const { sim, ownerId, owner } = warlockWorld();
    ctx(sim).applyAura(owner, {
      id: 'bad_air',
      name: 'Bad Air',
      kind: 'dot',
      school: 'nature',
      remaining: 4,
      duration: 4,
      // Authored Bad Air ticks for 3; sized to the health pool here so the
      // out-of-combat regen between ticks cannot mask the lethal path.
      value: owner.maxHp,
      tickInterval: 2,
      tickTimer: 2,
      sourceId: ownerId,
    });
    owner.hp = 2;
    ticks(sim, 20 * 3);
    expect(owner.dead).toBe(true);
  });

  it('never kills the warlock: the toll floors at 1 hp', () => {
    const { sim, ownerId, owner } = warlockWorld();
    openGate(sim, ownerId);
    owner.hp = 3;
    ticks(sim, 20 * 10);
    expect(owner.hp).toBe(1);
    expect(owner.dead).toBe(false);
  });

  it('pulls the targeted group member to the gate and refuses everyone else', () => {
    const { sim, ownerId, allyId, strangerId, owner } = warlockWorld();
    const gate = openGate(sim, ownerId);
    const ally = entity(sim, allyId);

    sim.events.length = 0;
    expect(sim.pickUpObject(gate.id, allyId)).toBe(true);
    expect(errorsFor(sim, allyId)).toContain('Only the warlock who opened the gate can use it.');
    // The ally walks off; the owner pulls from anywhere in the open world.
    ally.pos = ctx(sim).groundPos(ally.pos.x + 40, ally.pos.z + 40);

    sim.events.length = 0;
    owner.targetId = null;
    expect(sim.pickUpObject(gate.id, ownerId)).toBe(true);
    expect(errorsFor(sim, ownerId)).toContain('Target a group member to summon them.');

    sim.events.length = 0;
    owner.targetId = strangerId;
    expect(sim.pickUpObject(gate.id, ownerId)).toBe(true);
    expect(errorsFor(sim, ownerId)).toContain('Target a group member to summon them.');

    sim.events.length = 0;
    owner.targetId = allyId;
    expect(sim.pickUpObject(gate.id, ownerId)).toBe(true);
    expect(ally.pos.x).toBeCloseTo(gate.pos.x, 5);
    expect(ally.pos.z).toBeCloseTo(gate.pos.z, 5);
    expect(logsFor(sim, allyId)).toContain('You are pulled through the Hellgate.');

    // A dead ally cannot be pulled.
    ally.dead = true;
    sim.events.length = 0;
    owner.targetId = allyId;
    expect(sim.pickUpObject(gate.id, ownerId)).toBe(true);
    expect(errorsFor(sim, ownerId)).toContain('That ally cannot be summoned from where they are.');
  });

  it('refuses to pull an ally standing on an instanced plane (the arena)', () => {
    const { sim, ownerId, allyId, owner } = warlockWorld();
    const gate = openGate(sim, ownerId);
    const ally = entity(sim, allyId);
    const pit = arenaOrigin(0);
    ally.pos = { x: pit.x, y: ally.pos.y, z: pit.z };
    sim.events.length = 0;
    owner.targetId = allyId;
    expect(sim.pickUpObject(gate.id, ownerId)).toBe(true);
    expect(errorsFor(sim, ownerId)).toContain('That ally cannot be summoned from where they are.');
    expect(ally.pos.x).toBeCloseTo(pit.x, 5);
  });

  it('lasts its duration and the toll ends with it', () => {
    const { sim, ownerId, owner } = warlockWorld();
    const gate = openGate(sim, ownerId);
    const toll = owner.auras.find((a) => a.id === HELLGATE_BLEED_AURA_ID);
    if (!toll) throw new Error('missing toll');
    // Gate and toll share the authored 99 s clock. Wind both forward to the
    // last few seconds rather than ticking the whole span, then let them lapse.
    expect(gate.despawnTimer).toBeGreaterThan(HELLGATE_DURATION - 2);
    expect(toll.duration).toBe(HELLGATE_DURATION);
    const skip = HELLGATE_DURATION - 5;
    gate.despawnTimer = (gate.despawnTimer ?? 0) - skip;
    toll.remaining -= skip;
    ticks(sim, 20 * 3);
    expect(gates(sim, HELLGATE_OBJECT_ITEM_ID)).toHaveLength(1);
    expect(owner.auras.some((a) => a.id === HELLGATE_BLEED_AURA_ID)).toBe(true);
    ticks(sim, 20 * 4);
    expect(gates(sim, HELLGATE_OBJECT_ITEM_ID)).toHaveLength(0);
    expect(owner.auras.some((a) => a.id === HELLGATE_BLEED_AURA_ID)).toBe(false);
  });

  it('drops the gate early and lifts the toll when the warlock dies', () => {
    const { sim, ownerId, owner } = warlockWorld();
    openGate(sim, ownerId);
    ctx(sim).handleDeath(owner, null);
    sim.tick();
    expect(gates(sim, HELLGATE_OBJECT_ITEM_ID)).toHaveLength(0);
    expect(owner.auras.some((a) => a.id === HELLGATE_BLEED_AURA_ID)).toBe(false);
  });

  it('lets a late joiner of the group be pulled', () => {
    const { sim, ownerId, strangerId, owner } = warlockWorld();
    const gate = openGate(sim, ownerId);
    sim.partyInvite(strangerId, ownerId);
    sim.partyAccept(strangerId);
    expect(gate.partyGate?.eligiblePlayerIds).toContain(strangerId);
    owner.targetId = strangerId;
    expect(sim.pickUpObject(gate.id, ownerId)).toBe(true);
    const stranger = entity(sim, strangerId);
    expect(stranger.pos.x).toBeCloseTo(gate.pos.x, 5);
  });
});
