import { describe, expect, it } from 'vitest';
import { ABILITIES } from '../src/sim/content/classes';
import {
  GRAND_TELEPORT_BOOK_BOSSES,
  GRAND_TELEPORT_BOSS_ROLLS,
  grandTeleportLearnKey,
  grandTeleportTomeItemId,
  RUNE_OF_PASSAGE_ITEM_ID,
  TOME_SELL_COPPER,
} from '../src/sim/content/grand_teleports';
import { ITEMS, MOBS, NPCS, QUESTS } from '../src/sim/data';
import { createMob } from '../src/sim/entity';
import {
  checkGrandTeleportCityUnlocks,
  cityQuestIds,
  learnKeyForAbility,
} from '../src/sim/grand_teleport_learning';
import { rollLoot } from '../src/sim/loot/loot_roll';
import type { PlayerMeta } from '../src/sim/sim';
import { Sim } from '../src/sim/sim';
import type { SimContext } from '../src/sim/sim_context';
import type { SimEvent } from '../src/sim/types';

function ctx(sim: Sim): SimContext {
  return (sim as unknown as { ctx: SimContext }).ctx;
}

function metaOf(sim: Sim, pid: number): PlayerMeta {
  const meta = sim.meta(pid);
  if (!meta) throw new Error(`missing meta ${pid}`);
  return meta;
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

function knows(sim: Sim, pid: number, abilityId: string): boolean {
  return metaOf(sim, pid).known.some((a) => a.def.id === abilityId);
}

const TOME = grandTeleportTomeItemId('eastbrook');
const ABILITY = 'grand_teleport_eastbrook';

describe('Grand Teleport learning: the tome', () => {
  it('teaches the mage the spell, consumes the tome and refuses a second read', () => {
    const sim = new Sim({ seed: 3, playerClass: 'mage', noPlayer: true });
    const mageId = sim.addPlayer('mage', 'Reader');
    sim.setPlayerLevel(20, mageId);
    expect(knows(sim, mageId, ABILITY)).toBe(false);
    sim.addItem(TOME, 2, mageId);
    sim.events.length = 0;

    sim.useItem(TOME, mageId);
    expect(metaOf(sim, mageId).questsDone.has(grandTeleportLearnKey('eastbrook'))).toBe(true);
    expect(sim.countItem(TOME, mageId)).toBe(1);
    expect(knows(sim, mageId, ABILITY)).toBe(true);
    expect(logsFor(sim, mageId)).toContain(`You learn ${ABILITIES[ABILITY].name}.`);

    sim.events.length = 0;
    sim.useItem(TOME, mageId);
    expect(errorsFor(sim, mageId)).toContain('You already know that spell.');
    // The spare tome stays, and stays vendorable.
    expect(sim.countItem(TOME, mageId)).toBe(1);
    expect(ITEMS[TOME].sellValue).toBe(TOME_SELL_COPPER);
  });

  it('refuses a non-mage reader', () => {
    const sim = new Sim({ seed: 3, playerClass: 'warrior', noPlayer: true });
    const warriorId = sim.addPlayer('warrior', 'Grunt');
    sim.addItem(TOME, 1, warriorId);
    sim.events.length = 0;
    sim.useItem(TOME, warriorId);
    expect(errorsFor(sim, warriorId)).toContain('Only a mage can read that tome.');
    expect(sim.countItem(TOME, warriorId)).toBe(1);
    expect(metaOf(sim, warriorId).questsDone.has(grandTeleportLearnKey('eastbrook'))).toBe(false);
  });

  it('records a generic learn key for a non-teleport tome', () => {
    expect(learnKeyForAbility(ABILITY)).toBe(grandTeleportLearnKey('eastbrook'));
    expect(learnKeyForAbility('fireball')).toBe('learned:fireball');
  });
});

describe('Grand Teleport learning: the city quest clear', () => {
  it('derives a non-empty Eastbrook quest set from Eastbrook hub givers only', () => {
    const ids = cityQuestIds('eastbrook');
    expect(ids.length).toBeGreaterThan(0);
    expect(ids).toEqual([...ids].sort());
    for (const id of ids) {
      const quest = QUESTS[id];
      expect(quest).toBeDefined();
      expect(quest.retired ?? false).toBe(false);
      expect(quest.repeatable ?? false).toBe(false);
      if (quest.requiredClass) expect(quest.requiredClass).toContain('mage');
      const giver = NPCS[quest.giverNpcId];
      // Eastbrook's hub sits at the world origin band; a giver 200 yards out is another town.
      expect(Math.hypot(giver.pos.x, giver.pos.z + 100)).toBeLessThan(200);
    }
    expect(cityQuestIds('eastbrook')).toBe(ids);
    expect(cityQuestIds('nowhere')).toEqual([]);
  });

  it('learns the spell once every city quest is done, and only for a mage', () => {
    const sim = new Sim({ seed: 5, playerClass: 'mage', noPlayer: true });
    const mageId = sim.addPlayer('mage', 'Servant');
    sim.setPlayerLevel(20, mageId);
    const meta = metaOf(sim, mageId);
    const ids = cityQuestIds('eastbrook');
    for (const id of ids.slice(0, -1)) meta.questsDone.add(id);
    checkGrandTeleportCityUnlocks(ctx(sim), meta);
    expect(meta.questsDone.has(grandTeleportLearnKey('eastbrook'))).toBe(false);

    meta.questsDone.add(ids[ids.length - 1]);
    sim.events.length = 0;
    checkGrandTeleportCityUnlocks(ctx(sim), meta);
    expect(meta.questsDone.has(grandTeleportLearnKey('eastbrook'))).toBe(true);
    expect(knows(sim, mageId, ABILITY)).toBe(true);
    expect(logsFor(sim, mageId)).toContain(
      `Having served Eastbrook faithfully, you learn ${ABILITIES[ABILITY].name}.`,
    );

    const warriorId = sim.addPlayer('warrior', 'Grunt');
    const wmeta = metaOf(sim, warriorId);
    for (const id of ids) wmeta.questsDone.add(id);
    checkGrandTeleportCityUnlocks(ctx(sim), wmeta);
    expect(wmeta.questsDone.has(grandTeleportLearnKey('eastbrook'))).toBe(false);
  });
});

describe('Grand Teleport loot: the mage-only raid rolls', () => {
  function rig(secondClass: 'mage' | 'warrior') {
    const sim = new Sim({ seed: 21, playerClass: 'warrior', noPlayer: true });
    const a = sim.addPlayer('warrior', 'Tank');
    const b = sim.addPlayer(secondClass, 'Second');
    sim.partyInvite(b, a);
    sim.partyAccept(b);
    return { sim, a, b };
  }

  function kill(sim: Sim, tapper: number, eligible: number[]): { draws: number; items: string[] } {
    const template = MOBS[GRAND_TELEPORT_BOOK_BOSSES[0]];
    const mob = createMob(sim.nextId++, template, template.minLevel, { x: 0, y: 0, z: 0 });
    mob.dead = true;
    sim.entities.set(mob.id, mob);
    let draws = 0;
    ctx(sim).rng.setObserver(() => {
      draws++;
    });
    rollLoot(
      ctx(sim),
      mob,
      metaOf(sim, tapper),
      eligible.map((pid) => metaOf(sim, pid)),
    );
    ctx(sim).rng.setObserver(null);
    return { draws, items: (mob.loot?.items ?? []).map((i) => i.itemId) };
  }

  it('draws nothing extra without a mage and exactly the roll table with one', () => {
    const noMage = rig('warrior');
    const withMage = rig('mage');
    const without = kill(noMage.sim, noMage.a, [noMage.a, noMage.b]);
    const withM = kill(withMage.sim, withMage.a, [withMage.a, withMage.b]);
    expect(withM.draws - without.draws).toBe(GRAND_TELEPORT_BOSS_ROLLS.length);
  });

  it('hands the rune and tomes to the mages only, personal to them', () => {
    const { sim, a, b } = rig('mage');
    let runeSeen = false;
    for (let i = 0; i < 40 && !runeSeen; i++) {
      const template = MOBS[GRAND_TELEPORT_BOOK_BOSSES[1]];
      const mob = createMob(sim.nextId++, template, template.minLevel, { x: 0, y: 0, z: 0 });
      mob.dead = true;
      sim.entities.set(mob.id, mob);
      rollLoot(ctx(sim), mob, metaOf(sim, a), [metaOf(sim, a), metaOf(sim, b)]);
      const rune = mob.loot?.items.find((s) => s.itemId === RUNE_OF_PASSAGE_ITEM_ID);
      if (rune) {
        runeSeen = true;
        expect(rune.personalFor).toEqual([b]);
      }
      for (const slot of mob.loot?.items ?? []) {
        if (slot.itemId.startsWith('tome_grand_teleport_')) expect(slot.personalFor).toEqual([b]);
      }
    }
    expect(runeSeen).toBe(true);
  });
});
