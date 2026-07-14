import { describe, expect, it } from 'vitest';
import { ZONE3_OBJECTS } from '../src/sim/content/zone3';
import { DUNGEONS, QUESTS } from '../src/sim/data';

// Regression for issue #1894: "The Bound Guardian" quest text sent players to
// the wrong side of the western grave (said "south-east", the ritual circle is
// actually north-east of it). Pin the quest's compass words against the real
// world coordinates so a future copy edit can't silently reintroduce the drift.
//
// Convention (see src/sim/content/graveyards.ts: gy_thornpeak_east x=141 vs
// gy_thornpeak_west x=-139; delve_litany doorPos comments): +x is east, +z is
// north.
describe('q_nythraxis_bound_guardian quest text direction', () => {
  function objectPos(itemId: string): { x: number; z: number } {
    const obj = ZONE3_OBJECTS.find((o) => o.itemId === itemId);
    expect(obj, `${itemId} should be a registered zone3 object`).toBeTruthy();
    const pos = obj!.positions[0];
    expect(pos).toBeTruthy();
    return pos;
  }

  it('places the ritual circle east of the abandoned crypt door', () => {
    const crypt = DUNGEONS.nythraxis_crypt;
    expect(crypt, 'nythraxis_crypt dungeon should be registered').toBeTruthy();
    const ritual = objectPos('crypt_ritual_circle');
    expect(ritual.x).toBeGreaterThan(crypt.doorPos.x);
  });

  it('places the ritual circle north-east (not south-east) of the western grave', () => {
    const grave = objectPos('grave_captain_voss');
    const ritual = objectPos('crypt_ritual_circle');
    expect(ritual.x).toBeGreaterThan(grave.x); // east of the grave
    expect(ritual.z).toBeGreaterThan(grave.z); // north of the grave, not south
  });

  it('quest text says north-east of the western grave, matching the coordinates', () => {
    const quest = QUESTS.q_nythraxis_bound_guardian;
    expect(quest, 'q_nythraxis_bound_guardian should be registered').toBeTruthy();
    expect(quest.text).toContain('north-east of the western grave');
    expect(quest.text).not.toContain('south-east of the western grave');
  });
});
