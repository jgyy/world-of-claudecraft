import { describe, expect, it } from 'vitest';
import { targetOfTargetView } from '../src/ui/hud';
import type { Entity } from '../src/sim/types';

// Minimal entity stub — the view only reads a handful of fields.
function ent(over: Partial<Entity>): Entity {
  return {
    id: 1, kind: 'mob', name: 'Thing', templateId: '', level: 1,
    hp: 100, maxHp: 100, dead: false, hostile: true, targetId: null,
    ...over,
  } as unknown as Entity;
}

function world(...es: Entity[]): Map<number, Entity> {
  return new Map(es.map((e) => [e.id, e] as const));
}

describe('targetOfTargetView', () => {
  it('returns null when the target has no target', () => {
    const target = ent({ id: 5, targetId: null });
    expect(targetOfTargetView(target, world(target), 1)).toBeNull();
  });

  it('shows the viewer as "You" and hostile when the target hits the player', () => {
    const me = ent({ id: 1, name: 'Hero', kind: 'player', hostile: false, hp: 60, maxHp: 120 });
    const wolf = ent({ id: 5, name: 'Wolf', targetId: 1 });
    const v = targetOfTargetView(wolf, world(me, wolf), 1)!;
    expect(v.name).toBe('You');
    expect(v.isSelf).toBe(true);
    expect(v.hostile).toBe(true);
    expect(v.hpFrac).toBeCloseTo(0.5);
  });

  it('shows another unit by name with friendly colour when not hostile', () => {
    const ally = ent({ id: 7, name: 'Bet', kind: 'player', hostile: false });
    const wolf = ent({ id: 5, name: 'Wolf', targetId: 7 });
    const v = targetOfTargetView(wolf, world(ally, wolf), 1)!;
    expect(v.name).toBe('Bet');
    expect(v.isSelf).toBe(false);
    expect(v.hostile).toBe(false);
  });

  it('hides when the target targets itself, an object, or a corpse', () => {
    const wolf = ent({ id: 5, targetId: 5 });
    expect(targetOfTargetView(wolf, world(wolf), 1)).toBeNull();

    const obj = ent({ id: 8, kind: 'object' });
    expect(targetOfTargetView(ent({ id: 5, targetId: 8 }), world(obj), 1)).toBeNull();

    const corpse = ent({ id: 9, dead: true });
    expect(targetOfTargetView(ent({ id: 5, targetId: 9 }), world(corpse), 1)).toBeNull();
  });

  it('falls back to a humanoid crest for players, status_npc for npcs', () => {
    const npc = ent({ id: 2, kind: 'npc', name: 'Marshal' });
    expect(targetOfTargetView(ent({ id: 5, targetId: 2 }), world(npc), 1)!.crestId).toBe('status_npc');

    const pl = ent({ id: 3, kind: 'player', name: 'Gimel', templateId: '' });
    expect(targetOfTargetView(ent({ id: 5, targetId: 3 }), world(pl), 1)!.crestId).toBe('family_humanoid');
  });
});
