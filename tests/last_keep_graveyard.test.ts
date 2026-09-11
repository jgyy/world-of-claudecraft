// The Last Keep churchyard (Drakelands) is a functional graveyard: the placed
// headstone cluster south of the keep chapel carries an OVERWORLD_GRAVEYARDS
// record, so a death at the keep releases into its own yard instead of walking
// the ghost back from the Wyrmwatch cairns nearly 300 yd north (the "we rez
// far away" report).

import { describe, expect, it } from 'vitest';
import { DRAKELANDS_PROPS } from '../src/sim/content/drakelands';
import { DUNGEONS, OVERWORLD_GRAVEYARDS } from '../src/sim/data';
import { nearestOverworldGraveyard } from '../src/sim/spirit';

const KEEP_YARD = { x: 451, z: 2134 };

describe('the Last Keep churchyard is a functional graveyard', () => {
  it('carries a graveyard record on the placed headstone cluster', () => {
    const stones = DRAKELANDS_PROPS.graveyards.find(
      (g) => g.x === KEEP_YARD.x && g.z === KEEP_YARD.z,
    );
    expect(stones).toBeDefined();
    const gy = OVERWORLD_GRAVEYARDS.find((g) => g.id === 'gy_last_keep');
    expect(gy).toBeDefined();
    expect({ x: gy!.x, z: gy!.z }).toEqual(KEEP_YARD);
  });

  it('is appended last, so no earlier spirit healer changes its entity id', () => {
    expect(OVERWORLD_GRAVEYARDS[OVERWORLD_GRAVEYARDS.length - 1]?.id).toBe('gy_last_keep');
  });

  it('is the release point for a death at the keep door and inside the keep', () => {
    const door = DUNGEONS.the_last_keep.doorPos;
    const gy = nearestOverworldGraveyard(door.x, door.z);
    expect(gy).toEqual(KEEP_YARD);
    expect(Math.hypot(gy.x - door.x, gy.z - door.z)).toBeLessThan(60);
    // The Wyrmwatch cairns (the zone's hub yard) no longer catch keep deaths.
    const hub = OVERWORLD_GRAVEYARDS.find((g) => g.id === 'gy_drakelands')!;
    expect(Math.hypot(hub.x - door.x, hub.z - door.z)).toBeGreaterThan(250);
  });
});
