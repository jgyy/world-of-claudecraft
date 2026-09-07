// The Heroic Mark tier upgrade (src/sim/instances/heroic_upgrade.ts) and the
// heroic TIER variants it mints (src/sim/content/heroic_variants.ts
// buildHeroicTierVariants): the generated defs, the pure resolver's deny
// order, and the real Sim command path at Quartermaster Vex.
import { describe, expect, it } from 'vitest';
import { HEROIC_MARK_ITEM_ID } from '../src/sim/content/dungeon_difficulty';
import {
  HEROIC_TIER_VARIANT_IDS,
  heroicVariantId,
  IGNIVAR_HEROIC_TIER_SOURCE_LEVEL,
  isHeroicTierVariantId,
} from '../src/sim/content/heroic_variants';
import { IGNIVAR_RAID_LOOT_SOURCE_LEVEL, IGNIVAR_SET_ITEMS } from '../src/sim/content/ignivar_loot';
import { ITEMS, NPCS } from '../src/sim/data';
import { uniqueEquipFamily } from '../src/sim/equipment_rules';
import {
  HEROIC_UPGRADE_MARKS,
  heroicUpgradePayload,
  heroicUpgradeTargetId,
  isHeroicUpgradeEligible,
  resolveHeroicUpgrade,
} from '../src/sim/instances/heroic_upgrade';
import {
  expectedStatBudget,
  itemLevel,
  primaryStatSum,
  RAID_ILVL_BONUS,
} from '../src/sim/item_level';
import { type PlayerMeta, Sim } from '../src/sim/sim';
import type { Entity } from '../src/sim/types';
import { expectDefined } from './helpers/defined';
import { VENDOR_TEST_WORLD } from './sim_shared';

const HELM = 'slagbreaker_helmet';
const HEROIC_HELM = heroicVariantId(HELM);

function meta(sim: Sim, pid: number): PlayerMeta {
  return expectDefined(sim.ctx.players.get(pid));
}

function makeSim(): Sim {
  return new Sim({ seed: 5, playerClass: 'warrior', noPlayer: true, world: VENDOR_TEST_WORLD });
}

function atQuartermaster(sim: Sim, pid: number): void {
  const pos = NPCS.heroic_quartermaster.pos;
  const e = expectDefined(sim.entities.get(pid)) as Entity;
  e.pos = { x: pos.x + 1, y: e.pos.y, z: pos.z };
  e.prevPos = { ...e.pos };
  sim.rebucket(e);
}

function upgradeEvents(sim: Sim) {
  return (sim.drainEvents() as any[]).filter((e) => e.type === 'heroicUpgradeResult');
}

describe('heroic tier variants: one generated def per Crucible set piece', () => {
  it('mints every set piece one level up, tradeable, same set and class lock', () => {
    const bases = Object.values(IGNIVAR_SET_ITEMS);
    expect(bases.length).toBeGreaterThan(100);
    expect(HEROIC_TIER_VARIANT_IDS.size).toBe(bases.length);
    for (const base of bases) {
      const id = heroicVariantId(base.id);
      const v = expectDefined(ITEMS[id]);
      expect(isHeroicTierVariantId(id)).toBe(true);
      expect(v.heroicOf).toBe(base.id);
      expect(v.name).toBe(base.name);
      expect(v.soulbound, id).toBeUndefined();
      expect(v.set, id).toBe(base.set);
      expect(v.requiredClass, id).toEqual(base.requiredClass);
      expect(v.slot, id).toBe(base.slot);
      expect(v.quality, id).toBe('epic');
      expect(v.stats?.armor, id).toBe(base.stats?.armor);
      expect(v.critRating ?? v.hitRating ?? v.hasteRating, id).toBeDefined();
      expect(uniqueEquipFamily(v)).toBe(base.id);
      // The minor step: item level 37 against the base's 35 (the two-level
      // heroic step every variant family takes), with the primary stat line
      // budget-exact at the new level and strictly above the base.
      expect(itemLevel(base), base.id).toBe(35);
      expect(itemLevel(v), id).toBe(37);
      expect(primaryStatSum(v), id).toBe(expectedStatBudget(v));
      expect(primaryStatSum(v), id).toBeGreaterThan(primaryStatSum(base));
    }
    expect(isHeroicTierVariantId(HELM)).toBe(false);
    expect(isHeroicTierVariantId('heroic_boneguard_breastplate')).toBe(false);
  });

  it('pins the source level and the raid bonus the generator mirrors by literal', () => {
    expect(IGNIVAR_HEROIC_TIER_SOURCE_LEVEL).toBe(IGNIVAR_RAID_LOOT_SOURCE_LEVEL + 2);
    expect(RAID_ILVL_BONUS).toBe(3);
    expect(IGNIVAR_HEROIC_TIER_SOURCE_LEVEL + 6 + RAID_ILVL_BONUS).toBe(37);
  });
});

describe('heroicUpgradeTargetId and the pure resolver', () => {
  it('targets only un-upgraded tier set pieces', () => {
    expect(heroicUpgradeTargetId(HELM)).toBe(HEROIC_HELM);
    expect(heroicUpgradeTargetId(HEROIC_HELM)).toBeNull(); // already heroic
    expect(heroicUpgradeTargetId('worn_sword')).toBeNull(); // no set
    expect(heroicUpgradeTargetId(HEROIC_MARK_ITEM_ID)).toBeNull();
    expect(heroicUpgradeTargetId('no_such_item')).toBeNull();
    expect(isHeroicUpgradeEligible(ITEMS[HELM])).toBe(true);
    expect(isHeroicUpgradeEligible(ITEMS[HEROIC_HELM])).toBe(false);
    expect(isHeroicUpgradeEligible(undefined)).toBe(false);
  });

  it('denies in order: eligibility, the named copy, range, marks', () => {
    const inv = { inventory: [{ itemId: HELM, count: 1 }] };
    expect(resolveHeroicUpgrade(inv, 'worn_sword', 0, true, 99)).toEqual({
      ok: false,
      reason: 'heroic_upgrade_not_eligible',
    });
    expect(resolveHeroicUpgrade(inv, HELM, 4, true, 99)).toEqual({
      ok: false,
      reason: 'heroic_upgrade_not_eligible',
    });
    expect(resolveHeroicUpgrade({ inventory: [] }, HELM, undefined, true, 99)).toEqual({
      ok: false,
      reason: 'heroic_upgrade_not_eligible',
    });
    expect(resolveHeroicUpgrade(inv, HELM, 0, false, 99)).toEqual({
      ok: false,
      reason: 'heroic_upgrade_out_of_range',
    });
    expect(resolveHeroicUpgrade(inv, HELM, 0, true, HEROIC_UPGRADE_MARKS - 1)).toEqual({
      ok: false,
      reason: 'heroic_upgrade_not_enough_marks',
    });
    expect(resolveHeroicUpgrade(inv, HELM, undefined, true, HEROIC_UPGRADE_MARKS)).toEqual({
      ok: true,
      heroicItemId: HEROIC_HELM,
      slotIndex: 0,
    });
  });

  it('carries the copy payload minus the bond qualifiers', () => {
    expect(heroicUpgradePayload(undefined)).toBeUndefined();
    expect(heroicUpgradePayload({ unbound: true })).toBeUndefined();
    expect(
      heroicUpgradePayload({
        enchant: 'e',
        unbound: true,
        partyTrade: { untilMs: 1, eligible: [] },
        locked: true,
      }),
    ).toEqual({ enchant: 'e', locked: true });
  });
});

describe('Sim.heroicUpgradeItem: the command path', () => {
  it('swaps the tier copy for its heroic variant and debits the marks', () => {
    const sim = makeSim();
    const pid = sim.addPlayer('warrior', 'Forger');
    atQuartermaster(sim, pid);
    sim.addItem(HEROIC_MARK_ITEM_ID, HEROIC_UPGRADE_MARKS + 3, pid);
    sim.addItemInstance(HELM, { enchant: 'e', unbound: true }, pid);
    sim.drainEvents();
    sim.heroicUpgradeItem(HELM, pid);
    expect(upgradeEvents(sim)[0]).toMatchObject({
      ok: true,
      itemId: HELM,
      heroicItemId: HEROIC_HELM,
      marks: HEROIC_UPGRADE_MARKS,
    });
    expect(sim.countItem(HELM, pid)).toBe(0);
    expect(sim.countItem(HEROIC_HELM, pid)).toBe(1);
    expect(sim.countItem(HEROIC_MARK_ITEM_ID, pid)).toBe(3);
    const copy = expectDefined(meta(sim, pid).inventory.find((s) => s.itemId === HEROIC_HELM));
    expect(copy.instance).toEqual({ enchant: 'e' });
  });

  it('refuses short of marks, away from Vex, on a non-tier piece, and while dead', () => {
    const sim = makeSim();
    const pid = sim.addPlayer('warrior', 'Broke');
    sim.addItem(HELM, 1, pid);
    sim.addItem(HEROIC_MARK_ITEM_ID, HEROIC_UPGRADE_MARKS, pid);
    sim.drainEvents();
    sim.heroicUpgradeItem(HELM, pid);
    expect(upgradeEvents(sim)[0]).toMatchObject({
      ok: false,
      reason: 'heroic_upgrade_out_of_range',
    });
    atQuartermaster(sim, pid);
    sim.removeItem(HEROIC_MARK_ITEM_ID, 1, pid);
    sim.heroicUpgradeItem(HELM, pid);
    expect(upgradeEvents(sim)[0]).toMatchObject({
      ok: false,
      reason: 'heroic_upgrade_not_enough_marks',
    });
    sim.addItem('worn_sword', 1, pid);
    sim.heroicUpgradeItem('worn_sword', pid);
    expect(upgradeEvents(sim)[0]).toMatchObject({
      ok: false,
      reason: 'heroic_upgrade_not_eligible',
    });
    expect(sim.countItem(HELM, pid)).toBe(1);
    expect(sim.countItem(HEROIC_MARK_ITEM_ID, pid)).toBe(HEROIC_UPGRADE_MARKS - 1);
    sim.addItem(HEROIC_MARK_ITEM_ID, 1, pid);
    (expectDefined(sim.entities.get(pid)) as Entity).dead = true;
    sim.heroicUpgradeItem(HELM, pid);
    expect(upgradeEvents(sim)).toEqual([]);
    expect(sim.countItem(HELM, pid)).toBe(1);
  });

  it('a plain tier copy upgrades to a plain heroic copy (no payload minted)', () => {
    const sim = makeSim();
    const pid = sim.addPlayer('warrior', 'Plain');
    atQuartermaster(sim, pid);
    sim.addItem(HEROIC_MARK_ITEM_ID, HEROIC_UPGRADE_MARKS, pid);
    sim.addItem(HELM, 1, pid);
    sim.drainEvents();
    const slotIndex = meta(sim, pid).inventory.findIndex((s) => s.itemId === HELM);
    sim.heroicUpgradeItem(HELM, pid, slotIndex);
    expect(upgradeEvents(sim)[0].ok).toBe(true);
    const copy = expectDefined(meta(sim, pid).inventory.find((s) => s.itemId === HEROIC_HELM));
    expect(copy.instance).toBeUndefined();
    expect(sim.countItem(HEROIC_MARK_ITEM_ID, pid)).toBe(0);
  });
});
