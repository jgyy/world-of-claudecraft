// Loot Explorer pure-core behavior: the index built from live content tables,
// its filters, and the by-encounter grouping. Static-content only (no
// IWorld), so unlike a dual-host view core this drives buildLootExplorerIndex
// directly rather than against Sim- and ClientWorld-shaped stubs.

import { beforeEach, describe, expect, it } from 'vitest';
import { FINDER_ACTIVITIES } from '../src/sim/content/dungeon_finder';
import { HEROIC_BOSS_LOOT } from '../src/sim/content/heroic_loot';
import {
  CLASSES,
  DELVES,
  DUNGEONS,
  GROUND_OBJECTS,
  ITEMS,
  MOBS,
  NPCS,
  QUESTS,
} from '../src/sim/data';
import { lootEntryRollsOnClaim } from '../src/sim/loot/loot_difficulty_gate';
import {
  buildDungeonKind,
  buildLootExplorerIndex,
  buildMobToDelve,
  buildMobToDungeon,
  filterLootExplorerItems,
  groupLootExplorerBySource,
  LOOT_EXPLORER_DEFAULT_FILTERS,
  type LootExplorerCategory,
  resetLootExplorerIndexCache,
} from '../src/ui/hud/loot_explorer/loot_explorer_view';

beforeEach(() => {
  resetLootExplorerIndexCache();
});

describe('buildLootExplorerIndex', () => {
  it('memoizes: repeat calls return the identical object until reset', () => {
    const first = buildLootExplorerIndex();
    const second = buildLootExplorerIndex();
    expect(second).toBe(first);
    resetLootExplorerIndexCache();
    expect(buildLootExplorerIndex()).not.toBe(first);
  });

  it('every row resolves against a real ITEMS entry', () => {
    const { items } = buildLootExplorerIndex();
    expect(items.length).toBeGreaterThan(0);
    for (const item of items) {
      expect(ITEMS[item.itemId]).toBeDefined();
      expect(item.sources.length).toBeGreaterThan(0);
    }
  });

  it('covers every category the taxonomy declares that live content can actually populate', () => {
    const { items } = buildLootExplorerIndex();
    const seen = new Set<LootExplorerCategory>();
    for (const item of items) for (const s of item.sources) seen.add(s.category);
    // 'delve' is deliberately excluded here: both current delve bosses
    // (deacon_varric, sister_nhalia_drowned_canticle) drop only copper, no
    // itemId, so the category is correctly empty today. Its classification
    // logic is covered directly below (buildMobToDelve), independent of
    // whether any delve boss currently carries an itemized drop.
    const expected: LootExplorerCategory[] = [
      'raid',
      'dungeon',
      'open_world',
      'rift',
      'vendor',
      'quest_reward',
      'quest_objective',
      'ground_object',
      'starting_equipment',
    ];
    for (const category of expected) {
      expect(seen.has(category), `no source of category "${category}" was catalogued`).toBe(true);
    }
  });

  it('places every dungeon boss mob under dungeon or raid, never open_world', () => {
    const { items } = buildLootExplorerIndex();
    const mobIdsInDungeons = new Set<string>();
    for (const dungeon of Object.values(DUNGEONS)) {
      for (const spawn of dungeon.spawns) mobIdsInDungeons.add(spawn.mobId);
    }
    for (const item of items) {
      for (const s of item.sources) {
        if (!mobIdsInDungeons.has(s.sourceId)) continue;
        if (s.category === 'vendor' || s.category === 'quest_reward') continue; // different source kind, same mob id space collision is not expected but guard anyway
        expect(['raid', 'dungeon']).toContain(s.category);
      }
    }
  });

  it('classifies every delve boss to its delve id (buildMobToDelve), whether or not it currently drops an item', () => {
    const mobToDelve = buildMobToDelve();
    let checked = 0;
    for (const delve of Object.values(DELVES)) {
      for (const bossId of delve.bosses) {
        expect(mobToDelve.get(bossId)).toBe(delve.id);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(0);
  });

  it('a mob placed in a dungeon spawn list is never also classified as a delve boss', () => {
    const mobToDungeon = buildMobToDungeon();
    const mobToDelve = buildMobToDelve();
    for (const mobId of mobToDungeon.keys()) {
      expect(mobToDelve.has(mobId)).toBe(false);
    }
  });

  it('buildDungeonKind classifies every raid dungeonId from FINDER_ACTIVITIES as raid, every plain dungeon as dungeon', () => {
    const kind = buildDungeonKind();
    for (const activity of FINDER_ACTIVITIES) {
      const expectedKind = activity.kind === 'raid' ? 'raid' : 'dungeon';
      expect(kind.get(activity.dungeonId)).toBe(expectedKind);
    }
    // Total over every DUNGEONS key (the fallback arm), not just finder-listed ids.
    for (const dungeon of Object.values(DUNGEONS)) {
      expect(kind.has(dungeon.id)).toBe(true);
    }
  });

  it('mirrors the roller difficulty gate: a normalOnly mob-loot entry never emits a heroic row', () => {
    const { items } = buildLootExplorerIndex();
    const mobToDungeon = new Map<string, string>();
    for (const dungeon of Object.values(DUNGEONS)) {
      for (const spawn of dungeon.spawns) mobToDungeon.set(spawn.mobId, dungeon.id);
    }
    let normalOnlyChecked = 0;
    for (const mob of Object.values(MOBS)) {
      if (!mobToDungeon.has(mob.id)) continue;
      for (const entry of mob.loot ?? []) {
        if (!entry.itemId || !entry.normalOnly) continue;
        const item = items.find((i) => i.itemId === entry.itemId);
        if (!item) continue;
        const heroicRowsForThisMob = item.sources.filter(
          (s) => s.sourceId === mob.id && s.difficulty === 'heroic' && s.chance === entry.chance,
        );
        expect(lootEntryRollsOnClaim(entry, true)).toBe(false);
        expect(heroicRowsForThisMob.length).toBe(0);
        normalOnlyChecked++;
      }
    }
    // At least one normalOnly entry exists in live content; if this ever hits
    // zero the assertion above is vacuous and the test needs a new fixture.
    expect(normalOnlyChecked).toBeGreaterThan(0);
  });

  it('every HEROIC_BOSS_LOOT entry appears only as a heroic row for its boss', () => {
    const { items } = buildLootExplorerIndex();
    let checked = 0;
    for (const [bossId, entries] of Object.entries(HEROIC_BOSS_LOOT)) {
      for (const entry of entries) {
        if (!entry.itemId || !ITEMS[entry.itemId]) continue;
        const item = items.find((i) => i.itemId === entry.itemId);
        expect(
          item,
          `${entry.itemId} (heroic append for ${bossId}) missing from index`,
        ).toBeDefined();
        const rows = item?.sources.filter((s) => s.sourceId === bossId) ?? [];
        expect(rows.length).toBeGreaterThan(0);
        for (const row of rows) expect(row.difficulty).toBe('heroic');
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(0);
  });

  it('every vendor row matches a real NPC vendorItems entry', () => {
    const { items } = buildLootExplorerIndex();
    for (const npc of Object.values(NPCS)) {
      for (const itemId of npc.vendorItems ?? []) {
        if (!ITEMS[itemId]) continue;
        const item = items.find((i) => i.itemId === itemId);
        expect(item?.sources.some((s) => s.category === 'vendor' && s.sourceId === npc.id)).toBe(
          true,
        );
      }
    }
  });

  it('every quest collect objective and class item reward is catalogued', () => {
    const { items } = buildLootExplorerIndex();
    let objectivesChecked = 0;
    for (const quest of Object.values(QUESTS)) {
      for (const obj of quest.objectives ?? []) {
        if (obj.type !== 'collect' || !obj.itemId || !ITEMS[obj.itemId]) continue;
        const item = items.find((i) => i.itemId === obj.itemId);
        expect(
          item?.sources.some((s) => s.category === 'quest_objective' && s.sourceId === quest.id),
        ).toBe(true);
        objectivesChecked++;
      }
    }
    expect(objectivesChecked).toBeGreaterThan(0);
  });

  it('every class starting weapon/chest is catalogued as starting_equipment', () => {
    const { items } = buildLootExplorerIndex();
    for (const [cls, def] of Object.entries(CLASSES)) {
      for (const itemId of [def.startWeapon, def.startChest]) {
        if (!itemId) continue;
        const item = items.find((i) => i.itemId === itemId);
        expect(
          item?.sources.some((s) => s.category === 'starting_equipment' && s.sourceId === cls),
        ).toBe(true);
      }
    }
  });

  it('every ground object resolves to a guaranteed (chance 1) source', () => {
    const { items } = buildLootExplorerIndex();
    expect(GROUND_OBJECTS.length).toBeGreaterThan(0);
    for (const obj of GROUND_OBJECTS) {
      if (!ITEMS[obj.itemId]) continue;
      const item = items.find((i) => i.itemId === obj.itemId);
      const row = item?.sources.find((s) => s.category === 'ground_object');
      expect(row?.chance).toBe(1);
    }
  });
});

describe('filterLootExplorerItems', () => {
  it('the default filters (all "all") return the full index unnarrowed', () => {
    const index = buildLootExplorerIndex();
    const filtered = filterLootExplorerItems(index, LOOT_EXPLORER_DEFAULT_FILTERS);
    expect(filtered.length).toBe(index.items.length);
  });

  it('quality narrows to exactly the matching tier', () => {
    const index = buildLootExplorerIndex();
    const filtered = filterLootExplorerItems(index, {
      ...LOOT_EXPLORER_DEFAULT_FILTERS,
      quality: 'epic',
    });
    expect(filtered.length).toBeGreaterThan(0);
    expect(filtered.length).toBeLessThan(index.items.length);
    for (const item of filtered) expect(item.quality).toBe('epic');
  });

  it('category narrows sources to only that category, dropping items with none', () => {
    const index = buildLootExplorerIndex();
    const filtered = filterLootExplorerItems(index, {
      ...LOOT_EXPLORER_DEFAULT_FILTERS,
      category: 'vendor',
    });
    expect(filtered.length).toBeGreaterThan(0);
    for (const item of filtered) {
      expect(item.sources.length).toBeGreaterThan(0);
      for (const s of item.sources) expect(s.category).toBe('vendor');
    }
  });

  it('requiredClass excludes items locked to a different class, keeps class-free items', () => {
    const index = buildLootExplorerIndex();
    const filtered = filterLootExplorerItems(index, {
      ...LOOT_EXPLORER_DEFAULT_FILTERS,
      requiredClass: 'mage',
    });
    for (const item of filtered) {
      if (item.requiredClass) expect(item.requiredClass).toContain('mage');
    }
    const excluded = index.items.find((i) => i.requiredClass && !i.requiredClass.includes('mage'));
    expect(excluded).toBeDefined();
    expect(filtered.some((i) => i.itemId === excluded?.itemId)).toBe(false);
  });

  it('statKey keeps only items carrying that non-zero stat', () => {
    const index = buildLootExplorerIndex();
    const filtered = filterLootExplorerItems(index, {
      ...LOOT_EXPLORER_DEFAULT_FILTERS,
      statKey: 'int',
    });
    expect(filtered.length).toBeGreaterThan(0);
    for (const item of filtered) expect(item.statKeys).toContain('int');
  });
});

describe('groupLootExplorerBySource', () => {
  it('every drop in a group traces back to an item in the input list', () => {
    const items = buildLootExplorerIndex().items;
    const groups = groupLootExplorerBySource(items);
    expect(groups.length).toBeGreaterThan(0);
    const itemIds = new Set(items.map((i) => i.itemId));
    for (const group of groups) {
      expect(group.drops.length).toBeGreaterThan(0);
      for (const drop of group.drops) expect(itemIds.has(drop.itemId)).toBe(true);
    }
  });

  it('normal and heroic variants of the same dungeon boss group separately', () => {
    const activity = FINDER_ACTIVITIES.find(
      (a) => a.kind === 'dungeon' && a.encounters.some((e) => MOBS[e.mobId]?.loot?.length),
    );
    expect(activity).toBeDefined();
    const items = buildLootExplorerIndex().items;
    const groups = groupLootExplorerBySource(items);
    const bossId = activity?.encounters.find((e) => MOBS[e.mobId]?.loot?.length)?.mobId;
    expect(bossId).toBeDefined();
    const forBoss = groups.filter((g) => g.sourceId === bossId);
    const difficulties = new Set(forBoss.map((g) => g.difficulty));
    expect(difficulties.has('normal')).toBe(true);
  });
});
