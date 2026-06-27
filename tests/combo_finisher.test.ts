// Integration: combo-point finishers must scale their flat DoT / armor effect by
// the points actually spent (the fix). 1 combo point must not equal 5. Drives a
// real Sim end to end so it pins the wired behavior, not just the pure helper
// (see tests/finisher_scale.test.ts for the unit-level contract).
import { describe, expect, it } from 'vitest';
import { Sim } from '../src/sim/sim';
import { dist2d } from '../src/sim/types';
import { terrainHeight } from '../src/sim/world';

function makeRogue(seed = 42) {
  return new Sim({ seed, playerClass: 'rogue', autoEquip: true });
}

function nearestMob(sim: Sim) {
  const p = sim.player;
  let best: any = null;
  let bestD = Infinity;
  for (const e of sim.entities.values()) {
    if (e.kind !== 'mob' || e.dead) continue;
    const d = dist2d(p.pos, e.pos);
    if (d < bestD) {
      bestD = d;
      best = e;
    }
  }
  return best;
}

function teleportTo(sim: Sim, x: number, z: number) {
  const p = sim.player;
  p.pos.x = x;
  p.pos.z = z;
  p.pos.y = terrainHeight(x, z, sim.cfg.seed);
  p.prevPos = { ...p.pos };
}

// Cast a finisher with a fixed number of combo points and return the resulting
// debuff aura on the target (by aura kind), or null if none landed.
function castFinisherWithCombo(
  seed: number,
  ability: string,
  comboPoints: number,
  auraKind: 'dot' | 'sunder',
) {
  const sim = makeRogue(seed);
  sim.setPlayerLevel(20); // knows sinister_strike, rupture (16), expose_armor (14)
  const wolf = nearestMob(sim);
  wolf.level = 1;
  wolf.hp = wolf.maxHp = 100000; // never dies, so the DoT/sunder always applies
  teleportTo(sim, wolf.pos.x + 2, wolf.pos.z);
  sim.targetEntity(wolf.id);
  sim.player.facing = Math.atan2(wolf.pos.x - sim.player.pos.x, wolf.pos.z - sim.player.pos.z);
  // Arm the finisher directly: combo points on the current target, full energy.
  sim.player.comboPoints = comboPoints;
  sim.player.comboTargetId = wolf.id;
  sim.player.resource = 100;
  sim.player.gcdRemaining = 0;
  // Expose Armor can miss (melee hit table); a wolf this far below us never does,
  // but cast a few times defensively until the aura lands.
  for (let attempt = 0; attempt < 5; attempt++) {
    sim.player.comboPoints = comboPoints;
    sim.player.comboTargetId = wolf.id;
    sim.player.resource = 100;
    sim.player.gcdRemaining = 0;
    sim.castAbility(ability);
    sim.tick();
    const aura = wolf.auras.find((a: any) => a.kind === auraKind);
    if (aura) return { value: aura.value as number, comboPoints: sim.player.comboPoints };
  }
  return null;
}

describe('combo finisher scaling (integration)', () => {
  it('Rupture DoT tick value scales with combo points spent', () => {
    const one = castFinisherWithCombo(1, 'rupture', 1, 'dot');
    const five = castFinisherWithCombo(1, 'rupture', 5, 'dot');
    expect(one).not.toBeNull();
    expect(five).not.toBeNull();
    // 1 point must deal strictly less per tick than 5 points (the bug was equal).
    expect(one!.value).toBeLessThan(five!.value);
    expect(one!.value).toBeGreaterThanOrEqual(1);
  });

  it('Expose Armor reduction scales with combo points spent', () => {
    const one = castFinisherWithCombo(2, 'expose_armor', 1, 'sunder');
    const three = castFinisherWithCombo(2, 'expose_armor', 3, 'sunder');
    const five = castFinisherWithCombo(2, 'expose_armor', 5, 'sunder');
    expect(one).not.toBeNull();
    expect(five).not.toBeNull();
    // Authored armor is 170 (the 5-point max) -> 34 per point.
    expect(five!.value).toBe(170);
    expect(one!.value).toBe(34);
    expect(three!.value).toBe(102);
  });

  it('spending all 5 points delivers the authored maximum, unchanged from before', () => {
    const rup = castFinisherWithCombo(3, 'rupture', 5, 'dot');
    // Rupture authored as total 96 over 16s @ 2s interval -> 8 ticks of 12.
    expect(rup!.value).toBe(12);
  });

  it('is deterministic: same seed and combo spend give the same debuff value', () => {
    const a = castFinisherWithCombo(7, 'rupture', 3, 'dot');
    const b = castFinisherWithCombo(7, 'rupture', 3, 'dot');
    expect(a!.value).toBe(b!.value);
  });
});
