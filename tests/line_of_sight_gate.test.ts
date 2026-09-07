// The line-of-sight gate leaf (src/sim/line_of_sight_gate.ts): which abilities
// need a sight line (the arena point-blank exception included), and the
// composed blocked verdict over a live Sim.

import { describe, expect, it } from 'vitest';
import { ABILITIES, arenaOrigin } from '../src/sim/data';
import {
  abilityNeedsLineOfSight,
  hasLineOfSight,
  lineOfSightBlocked,
} from '../src/sim/line_of_sight_gate';
import { Sim } from '../src/sim/sim';
import type { SimContext } from '../src/sim/sim_context';
import type { AbilityDef, Entity } from '../src/sim/types';
import { groundHeight } from '../src/sim/world';

function ctxOf(sim: Sim): SimContext {
  return (sim as unknown as { ctx: SimContext }).ctx;
}

const spell = (over: Partial<AbilityDef> = {}): AbilityDef =>
  ({
    ...ABILITIES.fireball,
    requiresTarget: true,
    school: 'fire',
    range: 30,
    ...over,
  }) as AbilityDef;

describe('abilityNeedsLineOfSight', () => {
  it('a targetless ability never needs a sight line', () => {
    expect(abilityNeedsLineOfSight(spell({ requiresTarget: false }))).toBe(false);
  });

  it('a ranged spell or a ranged physical ability always does', () => {
    expect(abilityNeedsLineOfSight(spell())).toBe(true);
    expect(abilityNeedsLineOfSight(spell({ school: 'physical', range: 30 }))).toBe(true);
  });

  it('a point-blank physical swing skips it, except inside the arena pit', () => {
    const melee = spell({ school: 'physical', range: 5 });
    const outside = { pos: { x: 0, y: 0, z: 0 } } as Entity;
    const inside = { pos: { x: arenaOrigin(0).x, y: 0, z: arenaOrigin(0).z } } as Entity;
    expect(abilityNeedsLineOfSight(melee)).toBe(false);
    expect(abilityNeedsLineOfSight(melee, outside)).toBe(false);
    expect(abilityNeedsLineOfSight(melee, inside)).toBe(true);
  });
});

describe('hasLineOfSight / lineOfSightBlocked over a live Sim', () => {
  it('two bodies on open ground see each other, so a ranged spell is not blocked', () => {
    const sim = new Sim({ seed: 7, playerClass: 'mage', noPlayer: true });
    const a = sim.entities.get(sim.addPlayer('mage', 'A')) as Entity;
    const b = sim.entities.get(sim.addPlayer('mage', 'B')) as Entity;
    // Both at the open spawn ground, three yards apart.
    b.pos = { x: a.pos.x + 3, y: groundHeight(a.pos.x + 3, a.pos.z, sim.cfg.seed), z: a.pos.z };
    expect(hasLineOfSight(ctxOf(sim), a, b)).toBe(true);
    expect(lineOfSightBlocked(ctxOf(sim), a, b, spell())).toBe(false);
    expect(lineOfSightBlocked(ctxOf(sim), a, b, spell({ requiresTarget: false }))).toBe(false);
  });
});
