import { describe, expect, it } from 'vitest';
import { sharedCooldownIds } from '../src/sim/combat/ability_cooldown_groups';
import {
  GRAND_PORTAL_DURATION,
  GRAND_PORTAL_OBJECT_ITEM_ID,
  GRAND_TELEPORT_ABILITY_IDS,
  GRAND_TELEPORT_COOLDOWN,
  grandTeleportDestination,
  grandTeleportLearnKey,
  RUNE_OF_PASSAGE_ITEM_ID,
} from '../src/sim/content/grand_teleports';
import {
  HELLGATE_ABILITY_ID,
  HELLGATE_BLEED_AURA_ID,
  HELLGATE_DURATION,
  HELLGATE_FINAL_QUEST_ID,
  HELLGATE_OBJECT_ITEM_ID,
} from '../src/sim/content/hellgate';
import { Sim } from '../src/sim/sim';
import type { SimContext } from '../src/sim/sim_context';
import type { Entity, SimEvent } from '../src/sim/types';

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

function learn(sim: Sim, pid: number, key: string): void {
  const meta = sim.meta(pid);
  if (!meta) throw new Error('missing meta');
  meta.questsDone.add(key);
  ctx(sim).refreshKnownAbilities(meta, false);
}

function mageWorld() {
  const sim = new Sim({ seed: 7, playerClass: 'mage', noPlayer: true });
  const mageId = sim.addPlayer('mage', 'Portalist');
  const allyId = sim.addPlayer('warrior', 'Companion');
  const strangerId = sim.addPlayer('rogue', 'Stranger');
  sim.setPlayerLevel(20, mageId);
  sim.partyInvite(allyId, mageId);
  sim.partyAccept(allyId);
  learn(sim, mageId, grandTeleportLearnKey('fenbridge'));
  const mage = entity(sim, mageId);
  mage.resource = mage.maxResource;
  sim.events.length = 0;
  return { sim, mageId, allyId, strangerId, mage };
}

describe('Grand Portal (mage party gate)', () => {
  it('refuses the cast without a Rune of Passage and consumes one when it fires', () => {
    const { sim, mageId, allyId, mage } = mageWorld();
    sim.castAbility('grand_teleport_fenbridge', mageId);
    expect(mage.castingAbility).toBeNull();
    expect(errorsFor(sim, mageId)).toContain('You do not have the required reagent.');

    sim.addItem(RUNE_OF_PASSAGE_ITEM_ID, 2, mageId);
    sim.events.length = 0;
    sim.castAbility('grand_teleport_fenbridge', mageId);
    expect(mage.castingAbility).toBe('grand_teleport_fenbridge');
    // The reagent leaves with the mana at completion, not at cast start.
    expect(sim.countItem(RUNE_OF_PASSAGE_ITEM_ID, mageId)).toBe(2);
    ticks(sim, 20 * 11);
    expect(sim.countItem(RUNE_OF_PASSAGE_ITEM_ID, mageId)).toBe(1);

    const [portal] = gates(sim, GRAND_PORTAL_OBJECT_ITEM_ID);
    expect(portal).toBeDefined();
    expect(portal.name).toBe('Grand Portal');
    expect(portal.templateId).toBe('grand_portal');
    expect(portal.partyGate).toEqual({
      ownerId: mageId,
      partyId: 1,
      eligiblePlayerIds: [mageId, allyId],
      destination: 'fenbridge',
    });
    expect(portal.despawnTimer).toBeGreaterThan(GRAND_PORTAL_DURATION - 2);
  });

  it('refuses at completion when the rune left the bags mid-cast', () => {
    const { sim, mageId, mage } = mageWorld();
    sim.addItem(RUNE_OF_PASSAGE_ITEM_ID, 1, mageId);
    sim.castAbility('grand_teleport_fenbridge', mageId);
    ticks(sim, 20 * 5);
    sim.removeItem(RUNE_OF_PASSAGE_ITEM_ID, 1, mageId);
    const emitted = ticks(sim, 20 * 6);
    expect(mage.castingAbility).toBeNull();
    expect(gates(sim, GRAND_PORTAL_OBJECT_ITEM_ID)).toHaveLength(0);
    expect(errorTexts(emitted, mageId)).toContain('You do not have the required reagent.');
    expect(mage.cooldowns.has('grand_teleport_fenbridge')).toBe(false);
  });

  it('arms the one shared 20 minute cooldown on every Grand Teleport', () => {
    const { sim, mageId, mage } = mageWorld();
    sim.addItem(RUNE_OF_PASSAGE_ITEM_ID, 1, mageId);
    sim.castAbility('grand_teleport_fenbridge', mageId);
    ticks(sim, 20 * 11);
    for (const id of GRAND_TELEPORT_ABILITY_IDS) {
      expect(mage.cooldowns.get(id) ?? 0).toBeGreaterThan(GRAND_TELEPORT_COOLDOWN - 15);
    }
    expect(sharedCooldownIds('grand_teleport_eastbrook')).toBe(GRAND_TELEPORT_ABILITY_IDS);
    expect(sharedCooldownIds('fireball')).toBeNull();
  });

  it('carries an eligible group member to the landing and refuses a stranger', () => {
    const { sim, mageId, allyId, strangerId } = mageWorld();
    sim.addItem(RUNE_OF_PASSAGE_ITEM_ID, 1, mageId);
    sim.castAbility('grand_teleport_fenbridge', mageId);
    ticks(sim, 20 * 11);
    const [portal] = gates(sim, GRAND_PORTAL_OBJECT_ITEM_ID);
    const landing = grandTeleportDestination('fenbridge')?.landing;
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
    expect(logsFor(sim, allyId)).toContain('You step through the portal to Fenbridge.');

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
    sim.castAbility('grand_teleport_fenbridge', mageId);
    ticks(sim, 20 * 11);
    const [first] = gates(sim, GRAND_PORTAL_OBJECT_ITEM_ID);
    mage.cooldowns.clear();
    mage.resource = mage.maxResource;
    sim.castAbility('grand_teleport_fenbridge', mageId);
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
});

function warlockWorld() {
  const sim = new Sim({ seed: 11, playerClass: 'warlock', noPlayer: true });
  const ownerId = sim.addPlayer('warlock', 'Gatekeeper');
  const allyId = sim.addPlayer('warrior', 'Companion');
  const strangerId = sim.addPlayer('mage', 'Stranger');
  sim.setPlayerLevel(20, ownerId);
  sim.partyInvite(allyId, ownerId);
  sim.partyAccept(allyId);
  learn(sim, ownerId, HELLGATE_FINAL_QUEST_ID);
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
