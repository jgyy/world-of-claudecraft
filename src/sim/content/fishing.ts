import type { ItemDef } from '../types';

// ---------------------------------------------------------------------------
// Fishing catch pack — data-as-code
// ---------------------------------------------------------------------------
// Fishing is a real mechanic (see Sim.completeFishing): a 5s cast that yields a
// single catch. This file is the *declarative* catch content — the fish/junk it
// yields and the per-zone weighted tables the engine rolls against. No engine
// logic lives here; the Sim does the (deterministic, single-rng-draw) roll.
//
// Quality/foodHp ladder scales with zone difficulty, mirroring the vendor-food
// ladder in items.ts (bread 61 → boar 117). Raw fish heal a touch less than the
// cooked vendor equivalents — the price of catching your own.

export const FISHING_ITEMS: Record<string, ItemDef> = {
  // --- Eastbrook Vale (zone1) ---
  raw_brook_minnow: {
    id: 'raw_brook_minnow', name: 'Raw Brook Minnow', kind: 'food', quality: 'common',
    foodHp: 39, sellValue: 2,
  },
  raw_silver_perch: {
    id: 'raw_silver_perch', name: 'Raw Silver Perch', kind: 'food', quality: 'common',
    foodHp: 61, sellValue: 3,
  },
  raw_mossgill_snapper: {
    id: 'raw_mossgill_snapper', name: 'Raw Mossgill Snapper', kind: 'food', quality: 'common',
    foodHp: 81, sellValue: 5,
  },
  waterlogged_boot: {
    id: 'waterlogged_boot', name: 'Waterlogged Boot', kind: 'junk', quality: 'poor',
    sellValue: 4,
  },

  // --- Mirefen Marsh (zone2) ---
  raw_mire_eel: {
    id: 'raw_mire_eel', name: 'Raw Mire Eel', kind: 'food', quality: 'common',
    foodHp: 81, sellValue: 5,
  },
  raw_bogfin_catfish: {
    id: 'raw_bogfin_catfish', name: 'Raw Bogfin Catfish', kind: 'food', quality: 'common',
    foodHp: 117, sellValue: 8,
  },
  murky_tangleweed: {
    id: 'murky_tangleweed', name: 'Murky Tangleweed', kind: 'junk', quality: 'poor',
    sellValue: 2,
  },
  rusted_lockbox: {
    id: 'rusted_lockbox', name: 'Rusted Lockbox', kind: 'junk', quality: 'common',
    sellValue: 25,
  },

  // --- Thornpeak Heights (zone3) ---
  raw_thornpeak_grayling: {
    id: 'raw_thornpeak_grayling', name: 'Raw Thornpeak Grayling', kind: 'food', quality: 'common',
    foodHp: 117, sellValue: 8,
  },
  raw_stormcrag_pike: {
    id: 'raw_stormcrag_pike', name: 'Raw Stormcrag Pike', kind: 'food', quality: 'common',
    foodHp: 150, sellValue: 12,
  },
  glacial_char: {
    id: 'glacial_char', name: 'Glacial Char', kind: 'food', quality: 'uncommon',
    foodHp: 175, sellValue: 18,
  },
  anglers_lucky_coin: {
    id: 'anglers_lucky_coin', name: "Angler's Lucky Coin", kind: 'junk', quality: 'uncommon',
    sellValue: 40,
  },
};

// A weighted catch entry. An empty itemId means "no fish are biting" (a miss).
export interface FishingCatch {
  itemId: string;
  weight: number;
}

// Per-zone catch tables, keyed by ZoneDef.id. The Sim picks the table for the
// zone the angler stands in and falls back to DEFAULT_FISHING_ZONE elsewhere.
// Weights are relative within a table; they need not sum to any total.
export const FISHING_CATCHES: Record<string, FishingCatch[]> = {
  eastbrook_vale: [
    { itemId: 'raw_mirror_trout', weight: 32 },
    { itemId: 'raw_brook_minnow', weight: 22 },
    { itemId: 'raw_silver_perch', weight: 16 },
    { itemId: 'raw_mossgill_snapper', weight: 8 },
    { itemId: 'tangled_weed', weight: 8 },
    { itemId: 'waterlogged_boot', weight: 4 },
    { itemId: '', weight: 10 },
  ],
  mirefen_marsh: [
    { itemId: 'raw_mire_eel', weight: 28 },
    { itemId: 'raw_bogfin_catfish', weight: 18 },
    { itemId: 'raw_silver_perch', weight: 12 },
    { itemId: 'murky_tangleweed', weight: 14 },
    { itemId: 'rusted_lockbox', weight: 4 },
    { itemId: '', weight: 10 },
  ],
  thornpeak_heights: [
    { itemId: 'raw_thornpeak_grayling', weight: 26 },
    { itemId: 'raw_stormcrag_pike', weight: 16 },
    { itemId: 'glacial_char', weight: 6 },
    { itemId: 'murky_tangleweed', weight: 12 },
    { itemId: 'anglers_lucky_coin', weight: 3 },
    { itemId: '', weight: 12 },
  ],
};

export const DEFAULT_FISHING_ZONE = 'eastbrook_vale';
