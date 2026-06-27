// Regression for #consecration-zone: a ground-AoE field (e.g. paladin Consecration)
// stores a FIXED cast position but resolves hostility through the live source entity.
// pulseGroundAoE only bailed on a DEAD source, so a living caster who warped away
// (zone change / dungeon enter+leave / arena teleport / death-respawn) left an orphan
// field that kept dealing damage and kill credit at the spot they had left. The fix
// drops a caster's ground-AoE fields whenever they leave the field's frame of
// reference. These tests drive the real warp paths through a live Sim.

import { describe, expect, it } from 'vitest';
import { clearGroundAoEsFromSource, type GroundAoE } from '../src/sim/entity_roster';
import { Sim } from '../src/sim/sim';

const SEED = 20061;

function paladin(): { sim: any; pid: number } {
  const sim = new Sim({ seed: SEED, playerClass: 'paladin', autoEquip: true }) as any;
  sim.setPlayerLevel(20); // Consecration learns at 18
  const p = sim.player;
  p.resource = p.maxResource;
  return { sim, pid: p.id };
}

function castConsecration(sim: any, pid: number): void {
  sim.castAbility('consecration', pid); // castTime 0, so the field registers immediately
  expect(sim.ctx.groundAoEs.some((g: GroundAoE) => g.sourceId === pid)).toBe(true);
}

describe('ground-AoE clears when the caster leaves the field (#consecration-zone)', () => {
  it('death-respawn drops the caster Consecration field', () => {
    const { sim, pid } = paladin();
    castConsecration(sim, pid);

    sim.entities.get(pid).dead = true;
    sim.releaseSpirit(pid); // warps the spirit to the graveyard

    expect(sim.ctx.groundAoEs.some((g: GroundAoE) => g.sourceId === pid)).toBe(false);
  });

  it('entering a delve drops a field cast outside (the delve teleport surface)', () => {
    const { sim, pid } = paladin();
    sim.entities.get(pid).pos.x = 0;
    sim.entities.get(pid).pos.z = 0;
    castConsecration(sim, pid);

    sim.enterDelve('collapsed_reliquary', 'normal'); // teleports the player into the delve module

    expect(sim.delveRunForPlayer(pid)).toBeTruthy(); // the warp actually happened
    expect(sim.ctx.groundAoEs.some((g: GroundAoE) => g.sourceId === pid)).toBe(false);
  });

  it('only the warping caster fields are cleared, others keep pulsing', () => {
    const sim = new Sim({
      seed: SEED,
      playerClass: 'paladin',
      autoEquip: true,
      noPlayer: true,
    }) as any;
    const a = sim.addPlayer('paladin', 'Aldra');
    const b = sim.addPlayer('paladin', 'Brael');
    for (const id of [a, b]) {
      sim.setPlayerLevel(20, id);
      sim.entities.get(id).resource = sim.entities.get(id).maxResource;
      castConsecration(sim, id);
    }

    sim.entities.get(a).dead = true;
    sim.releaseSpirit(a);

    expect(sim.ctx.groundAoEs.some((g: GroundAoE) => g.sourceId === a)).toBe(false);
    expect(sim.ctx.groundAoEs.some((g: GroundAoE) => g.sourceId === b)).toBe(true);
  });
});

describe('clearGroundAoEsFromSource (the entity_roster helper)', () => {
  const make = (sourceId: number, over: Partial<GroundAoE> = {}): GroundAoE => ({
    sourceId,
    pos: { x: 0, y: 0, z: 0 },
    radius: 8,
    min: 28,
    max: 34,
    remaining: 10,
    interval: 2,
    tickTimer: 0,
    school: 'holy',
    ability: 'consecration',
    ...over,
  });

  it('removes every field from the given source and leaves the rest', () => {
    const ctx = { groundAoEs: [make(1), make(2), make(1, { ability: 'death_and_decay' })] } as any;
    clearGroundAoEsFromSource(ctx, 1);
    expect(ctx.groundAoEs.map((g: GroundAoE) => g.sourceId)).toEqual([2]);
  });

  it('is a no-op when the source owns no field', () => {
    const ctx = { groundAoEs: [make(2), make(3)] } as any;
    clearGroundAoEsFromSource(ctx, 1);
    expect(ctx.groundAoEs.length).toBe(2);
  });
});
