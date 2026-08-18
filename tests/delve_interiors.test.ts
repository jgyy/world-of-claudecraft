// Delve module interior residency: the DELVE_SLOT_COUNT pool is shared
// server-wide, so a slot a finished run vacates is claimed by the NEXT
// party's run, which re-shuffles its own module order (pickDelveModules).
// Reproduces the reported bug (rooms overlapping, walls/pools/platforms
// that don't match what the player stands on) end to end through the real
// orchestration functions: a slot reused with a DIFFERENT module order must
// retire the previous occupant's build, never leave it parked at the wrong
// z-stacked origin under/beside the new run's rooms.
import { describe, expect, it, vi } from 'vitest';
import {
  buildDelveModulesInSlot,
  type DelveInteriorResidency,
  prebuildDelveModuleResidency,
} from '../src/render/delve_interiors';
import type { DungeonInteriors } from '../src/render/dungeon';
import type { DelveModuleId } from '../src/sim/delve_layout';

interface FakeGroup {
  interior: string;
  ox: number;
  oz: number;
  moduleId?: string;
}

function fakeResidency(): DelveInteriorResidency {
  return {
    builtInteriors: new Set(),
    pendingInteriors: new Set(),
    delveInteriorGroups: new Map(),
    delveSlotModuleKey: new Map(),
  };
}

function fakeDungeons() {
  const built: FakeGroup[] = [];
  const dungeons = {
    buildInterior: vi.fn(
      async (
        interior: string,
        ox: number,
        oz: number,
        opts?: { moduleId?: string },
      ): Promise<FakeGroup> => {
        const group: FakeGroup = { interior, ox, oz, moduleId: opts?.moduleId };
        built.push(group);
        return group;
      },
    ),
  };
  return { dungeons: dungeons as unknown as DungeonInteriors, built, spy: dungeons.buildInterior };
}

// Two orders for the SAME 4 modules: exercising the slot-reuse case, not a
// bigger/smaller subset, so the only variable is the ORDER (and therefore
// the z-stacked origin each module lands at).
const ORDER_A: DelveModuleId[] = [
  'litany_baptistry',
  'litany_sluice',
  'litany_ledger',
  'litany_apse',
];
const ORDER_B: DelveModuleId[] = [
  'litany_sluice',
  'litany_baptistry',
  'litany_ledger',
  'litany_apse',
];

describe('prebuildDelveModuleResidency', () => {
  it('a fresh claim on a never-used slot builds every module, retires nothing', async () => {
    const residency = fakeResidency();
    const { dungeons, spy } = fakeDungeons();
    const retire = vi.fn();
    prebuildDelveModuleResidency(
      residency,
      dungeons,
      'drowned_litany',
      { delveId: 'drowned_litany', slot: 0, origin: { x: 0, z: 0 }, modules: ORDER_A },
      retire,
    );
    await vi.waitFor(() => expect(spy).toHaveBeenCalledTimes(ORDER_A.length));
    expect(retire).not.toHaveBeenCalled();
    expect(residency.builtInteriors.size).toBe(ORDER_A.length);
  });

  it('a party member REJOINING the same run (unchanged module order) does not retire or rebuild', async () => {
    const residency = fakeResidency();
    const { dungeons, spy } = fakeDungeons();
    const retire = vi.fn();
    const run = { delveId: 'drowned_litany', slot: 0, origin: { x: 0, z: 0 }, modules: ORDER_A };
    prebuildDelveModuleResidency(residency, dungeons, 'drowned_litany', run, retire);
    await vi.waitFor(() => expect(spy).toHaveBeenCalledTimes(ORDER_A.length));

    // Second party member enters: same 'delveEntered' event, same run, same order.
    prebuildDelveModuleResidency(residency, dungeons, 'drowned_litany', { ...run }, retire);

    expect(retire).not.toHaveBeenCalled();
    expect(spy).toHaveBeenCalledTimes(ORDER_A.length); // no re-build of the already-correct geometry
  });

  it('a RE-SHUFFLED run reusing the same slot retires the stale build and rebuilds at the new offsets', async () => {
    const residency = fakeResidency();
    const { dungeons, spy, built } = fakeDungeons();
    const retire = vi.fn();

    // Run 1 claims slot 0 with ORDER_A.
    prebuildDelveModuleResidency(
      residency,
      dungeons,
      'drowned_litany',
      { delveId: 'drowned_litany', slot: 0, origin: { x: 0, z: 0 }, modules: ORDER_A },
      retire,
    );
    await vi.waitFor(() => expect(spy).toHaveBeenCalledTimes(ORDER_A.length));
    const staleGroups = residency.delveInteriorGroups.size;
    expect(staleGroups).toBe(ORDER_A.length);

    // Run 1 ends; slot 0 is later claimed by a DIFFERENT party's run with a
    // freshly re-shuffled module order (pickDelveModules re-rolled on the new
    // claim). Without the fix, litany_baptistry/litany_sluice (present in
    // BOTH orders, but at DIFFERENT z-offsets since order changed) would read
    // as "already built" and never rebuild at their new, correct positions.
    prebuildDelveModuleResidency(
      residency,
      dungeons,
      'drowned_litany',
      { delveId: 'drowned_litany', slot: 0, origin: { x: 0, z: 0 }, modules: ORDER_B },
      retire,
    );
    await vi.waitFor(() => expect(spy).toHaveBeenCalledTimes(ORDER_A.length + ORDER_B.length));

    // Every stale group from run 1 was retired exactly once.
    expect(retire).toHaveBeenCalledTimes(staleGroups);

    // The tracked residency now reflects ONLY run 2's fresh build, not a mix
    // of run 1's leftovers and run 2's new geometry.
    expect(residency.delveInteriorGroups.size).toBe(ORDER_B.length);
    expect(residency.builtInteriors.size).toBe(ORDER_B.length);

    // litany_baptistry was built for BOTH runs (present in both orders), at
    // DIFFERENT z origins each time: this is the exact repro of the bug
    // (a moduleId alone is not a stable key across a slot's re-shuffled reuse).
    const baptistryBuilds = built.filter((g) => g.moduleId === 'litany_baptistry');
    expect(baptistryBuilds).toHaveLength(2);
    expect(baptistryBuilds[0].oz).not.toBe(baptistryBuilds[1].oz);
  });
});

describe('buildDelveModulesInSlot', () => {
  it('skips a module already tracked as built or pending for the slot', async () => {
    const residency = fakeResidency();
    const { dungeons, spy } = fakeDungeons();
    buildDelveModulesInSlot(residency, dungeons, 'drowned_litany', 0, { x: 0, z: 0 }, ORDER_A);
    await vi.waitFor(() => expect(spy).toHaveBeenCalledTimes(ORDER_A.length));

    buildDelveModulesInSlot(residency, dungeons, 'drowned_litany', 0, { x: 0, z: 0 }, ORDER_A);
    expect(spy).toHaveBeenCalledTimes(ORDER_A.length); // still, no duplicate builds
  });
});
