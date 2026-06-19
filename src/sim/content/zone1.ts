// Zone 1 — Eastbrook Vale (levels 1-7). The starter zone: town of Eastbrook,
// wolves and boars, the bandit camp, and Brother Aldric's Gravecaller chain
// leading to the Hollow Crypt.

import type { CampDef, GroundObjectDef, MobTemplate, NpcDef, QuestDef, ZoneDef, ZonePropsDef } from '../types';

export const TOWN_RADIUS = 26;
export const GRAVEYARD_POS = { x: -12, z: -14 };
// Basin carved into the heightfield. Pushed to the far northeast so its
// shoreline meets the fishing dock and the murloc camp instead of drowning them.
export const LAKE = { x: -92, z: 88, radius: 30 };

export const ZONE1_ZONE: ZoneDef = {
  id: 'eastbrook_vale',
  name: 'Eastbrook Vale',
  zMin: -180,
  zMax: 180,
  levelRange: [1, 7],
  biome: 'vale',
  hub: { x: 0, z: 0, radius: TOWN_RADIUS, name: 'Eastbrook' },
  graveyard: GRAVEYARD_POS,
  lakes: [LAKE],
  pois: [
    { x: 0, z: -3, label: 'Eastbrook' },
    { x: -2, z: 70, label: 'Wolf Run' },
    { x: 65, z: 0, label: 'Boar Meadow' },
    { x: -88, z: 82, label: 'Mirror Lake' },
    { x: -60, z: 4, label: 'Webwood' },
    { x: -84, z: -64, label: 'Copper Dig' },
    { x: 76, z: -76, label: 'Bandit Camp' },
    { x: 80, z: 80, label: 'Fallen Chapel' },
    { x: 40, z: 140, label: 'Brightwood Glade' },
  ],
  welcome: 'Find Marshal Redbrook in town — he has work for you.',
  welcomeQuestId: 'q_wolves',
};

// ---------------------------------------------------------------------------
// Mobs
// ---------------------------------------------------------------------------

export const ZONE1_MOBS: Record<string, MobTemplate> = {
  warlock_imp: {
    id: 'warlock_imp', name: 'Fire Demon', minLevel: 1, maxLevel: 20, family: 'demon',
    hpBase: 24, hpPerLevel: 11, dmgBase: 2, dmgPerLevel: 0.7, attackSpeed: 2.0,
    armorPerLevel: 5, moveSpeed: 8, aggroRadius: 0,
    loot: [],
    scale: 0.65, color: 0xff5a2e,
    petRole: 'ranged_dps',
    petSpell: { name: 'Firebolt', school: 'fire', min: 8, max: 11, range: 24, every: 2.0 },
  },
  warlock_voidwalker: {
    id: 'warlock_voidwalker', name: 'Void Demon', minLevel: 10, maxLevel: 20, family: 'demon',
    hpBase: 95, hpPerLevel: 24, dmgBase: 3, dmgPerLevel: 1.0, attackSpeed: 2.4,
    armorPerLevel: 28, moveSpeed: 7.2, aggroRadius: 0,
    loot: [],
    scale: 0.9, color: 0x6b4bb5,
    petRole: 'melee_tank',
  },
  forest_wolf: {
    id: 'forest_wolf', name: 'Forest Wolf', minLevel: 1, maxLevel: 2, family: 'beast',
    hpBase: 28, hpPerLevel: 14, dmgBase: 3, dmgPerLevel: 1.6, attackSpeed: 2.0,
    armorPerLevel: 10, moveSpeed: 8, aggroRadius: 10,
    loot: [
      { copper: 8, chance: 1 },
      { itemId: 'wolf_fang', chance: 0.45 },
      { itemId: 'milepost_boots', chance: 0.1 },
    ],
    scale: 0.9, color: 0x7f8c8d,
    packFrenzy: { radius: 12, hasteMult: 1.3, duration: 8 },
  },
  old_greyjaw: {
    id: 'old_greyjaw', name: 'Old Greyjaw', minLevel: 4, maxLevel: 4, family: 'beast', rare: true,
    hpBase: 110, hpPerLevel: 20, dmgBase: 5, dmgPerLevel: 2.0, attackSpeed: 1.8,
    armorPerLevel: 16, moveSpeed: 8.5, aggroRadius: 12,
    // The old wolf turns savage as the fight wears on: each wound it takes can
    // send it into a blood frenzy, swinging 30% faster for 8s.
    frenzyOnHit: { chance: 0.25, hasteMult: 1.3, duration: 8, name: 'Blood Frenzy' },
    loot: [
      { copper: 60, chance: 1 },
      { itemId: 'greyjaw_fang', chance: 1, questId: 'q_greyjaw' },
      { itemId: 'wolf_fang', chance: 1 },
    ],
    scale: 1.25, color: 0x566061,
  },
  wild_boar: {
    id: 'wild_boar', name: 'Wild Boar', minLevel: 2, maxLevel: 3, family: 'beast',
    hpBase: 34, hpPerLevel: 16, dmgBase: 4, dmgPerLevel: 1.8, attackSpeed: 2.2,
    armorPerLevel: 14, moveSpeed: 7.5, aggroRadius: 9,
    // Stiff bristles prick anyone who melees the boar.
    thorns: { value: 2, name: 'Bristled Hide' },
    loot: [
      { copper: 12, chance: 1 },
      { itemId: 'boar_hide', chance: 0.6, questId: 'q_boars' },
      { itemId: 'tough_jerky', chance: 0.3 },
      { itemId: 'trail_leggings', chance: 0.1 },
    ],
    scale: 0.85, color: 0x935116,
  },
  elder_bristleback: {
    id: 'elder_bristleback', name: 'Elder Bristleback', minLevel: 5, maxLevel: 5, family: 'beast', rare: true,
    elite: true, canSwim: true, ccImmune: true, respawnMult: 432,
    hpBase: 260, hpPerLevel: 52, dmgBase: 11, dmgPerLevel: 3.3, attackSpeed: 2.4,
    armorPerLevel: 30, moveSpeed: 7.2, aggroRadius: 12,
    aoePulse: { min: 12, max: 18, radius: 8, every: 9, name: 'Bristleback Stomp', school: 'physical' },
    enrage: { belowHpPct: 0.35, dmgMult: 1.4, hasteMult: 1.3 },
    // A full coat of iron-hard bristles — punishing to melee head-on.
    thorns: { value: 8, name: 'Bristled Hide' },
    loot: [
      { copper: 120, chance: 1 },
      { itemId: 'tough_jerky', chance: 1 },
      { itemId: 'bristleback_maul', chance: 0.25 },
      { itemId: 'bristlehide_spaulders', chance: 0.3 },
      { itemId: 'crossroads_saber', chance: 0.3 },
      { itemId: 'moggers_copper_cudgel', chance: 0.25, rollGroup: 'elder_bristleback_chase' },
      { itemId: 'hollowbone_hauberk', chance: 0.25, rollGroup: 'elder_bristleback_chase' },
      { itemId: 'hollowbound_legguards', chance: 0.25, rollGroup: 'elder_bristleback_chase' },
    ],
    scale: 1.2, color: 0x7b3f13,
  },
  webwood_spider: {
    id: 'webwood_spider', name: 'Webwood Lurker', minLevel: 2, maxLevel: 4, family: 'spider',
    hpBase: 30, hpPerLevel: 15, dmgBase: 4, dmgPerLevel: 1.7, attackSpeed: 1.8,
    armorPerLevel: 8, moveSpeed: 8, aggroRadius: 10,
    venom: { chance: 0.35, perTick: 2, interval: 2, duration: 10, name: 'Spider Venom', school: 'nature' },
    ensnare: { chance: 0.25, duration: 3, name: 'Sticky Web', school: 'nature' },
    loot: [
      { copper: 14, chance: 1 },
      { itemId: 'webwood_silk', chance: 0.55, questId: 'q_spiders' },
      { itemId: 'spider_leg', chance: 0.4 },
    ],
    scale: 0.9, color: 0x4a235a,
  },
  sableweb_matriarch: {
    id: 'sableweb_matriarch', name: 'Sableweb Matriarch', minLevel: 6, maxLevel: 6, family: 'spider', rare: true,
    elite: true, canSwim: true, ccImmune: true, respawnMult: 432,
    hpBase: 250, hpPerLevel: 50, dmgBase: 11, dmgPerLevel: 3.3, attackSpeed: 1.7,
    armorPerLevel: 20, moveSpeed: 8, aggroRadius: 12,
    aoePulse: { min: 10, max: 16, radius: 10, every: 8, name: 'Venom Spray', school: 'nature' },
    summonAdds: { mobId: 'sableweb_hatchling', count: 2, atHpPct: [0.60, 0.30] },
    loot: [
      { copper: 130, chance: 1 },
      { itemId: 'spider_leg', chance: 1 },
      { itemId: 'sableweb_slippers', chance: 0.25 },
      { itemId: 'sableweb_cord', chance: 0.3 },
      { itemId: 'wanderers_chestguard', chance: 0.3 },
      { itemId: 'valeborn_spellblade', chance: 0.25, rollGroup: 'sableweb_matriarch_chase' },
      { itemId: 'gravewoven_raiment', chance: 0.25, rollGroup: 'sableweb_matriarch_chase' },
      { itemId: 'gravepath_treads', chance: 0.25, rollGroup: 'sableweb_matriarch_chase' },
    ],
    scale: 1.15, color: 0x1b1025,
  },
  sableweb_hatchling: {
    id: 'sableweb_hatchling', name: 'Sableweb Hatchling', minLevel: 5, maxLevel: 5, family: 'spider',
    hpBase: 34, hpPerLevel: 13, dmgBase: 5, dmgPerLevel: 1.8, attackSpeed: 1.6,
    armorPerLevel: 8, moveSpeed: 8.5, aggroRadius: 12,
    loot: [],
    scale: 0.65, color: 0x21112d,
  },
  mogger: {
    id: 'mogger', name: 'Mogger', minLevel: 6, maxLevel: 6, family: 'humanoid', rare: true,
    elite: true, canSwim: true, ccImmune: true, respawnMult: 4,
    hpBase: 300, hpPerLevel: 58, dmgBase: 12, dmgPerLevel: 3.5, attackSpeed: 2.2,
    armorPerLevel: 34, moveSpeed: 7.4, aggroRadius: 14,
    aoePulse: { min: 14, max: 20, radius: 8, every: 10, name: 'Ground Pound', school: 'physical' },
    summonAdds: { mobId: 'mogger_lackey', count: 2, atHpPct: [0.70] },
    enrage: { belowHpPct: 0.30, dmgMult: 1.6, hasteMult: 1.3 },
    wardAllies: { radius: 12, every: 12, amount: 70, duration: 8, name: 'Bracing Order', school: 'physical' },
    loot: [
      { copper: 180, chance: 1 },
      { itemId: 'linen_scrap', chance: 1 },
      { itemId: 'moggers_stomper_boots', chance: 0.3 },
      { itemId: 'moggers_shiv', chance: 0.25, rollGroup: 'mogger_chase' },
      { itemId: 'cryptstalker_jerkin', chance: 0.25, rollGroup: 'mogger_chase' },
    ],
    scale: 1.28, color: 0x8e5b33,
  },
  mogger_lackey: {
    id: 'mogger_lackey', name: 'Mogger Lackey', minLevel: 5, maxLevel: 6, family: 'humanoid',
    hpBase: 44, hpPerLevel: 18, dmgBase: 6, dmgPerLevel: 2.0, attackSpeed: 2.0,
    armorPerLevel: 18, moveSpeed: 7.5, aggroRadius: 12,
    stunOnHit: { chance: 0.12, duration: 1, name: 'Skullthump', school: 'physical' },
    loot: [],
    scale: 0.95, color: 0x7b4b2b,
  },
  mudfin_murloc: {
    id: 'mudfin_murloc', name: 'Mudfin Skulker', minLevel: 3, maxLevel: 5, family: 'murloc',
    hpBase: 36, hpPerLevel: 17, dmgBase: 5, dmgPerLevel: 1.9, attackSpeed: 1.9,
    armorPerLevel: 12, moveSpeed: 8, aggroRadius: 13, // murlocs aggro from far and bring friends
    loot: [
      { copper: 18, chance: 1 },
      { itemId: 'mudfin_scale', chance: 0.5 },
      { itemId: 'linen_scrap', chance: 0.2 },
    ],
    scale: 0.8, color: 0x52be80,
    // Mudfin Hex: the skulker's oracle-chant briefly turns a foe into a critter.
    // Low chance and it breaks the instant the victim takes damage (the murloc's
    // own next bite ends it), so it's a brief flavor incap — but a murloc pack
    // can chain it just long enough to make a careless pull dangerous.
    polymorphHex: { chance: 0.12, duration: 4, name: 'Mudfin Hex', school: 'nature' },
  },
  tunnel_rat: {
    id: 'tunnel_rat', name: 'Tunnel Rat Digger', minLevel: 4, maxLevel: 6, family: 'kobold',
    hpBase: 42, hpPerLevel: 18, dmgBase: 6, dmgPerLevel: 2.0, attackSpeed: 2.1,
    armorPerLevel: 16, moveSpeed: 7, aggroRadius: 10,
    loot: [
      { copper: 22, chance: 1 },
      { itemId: 'tallow_candle', chance: 0.6 },
      { itemId: 'blessed_wax', chance: 0.45, questId: 'q_rite' },
      { itemId: 'linen_scrap', chance: 0.25 },
      { itemId: 'mossy_handwraps', chance: 0.15 },
    ],
    scale: 0.85, color: 0x9c640c,
  },
  grix_the_tunnelking: {
    id: 'grix_the_tunnelking', name: 'Grix the Tunnelking', minLevel: 7, maxLevel: 7, family: 'kobold', rare: true,
    elite: true, canSwim: true, ccImmune: true, respawnMult: 432,
    hpBase: 280, hpPerLevel: 52, dmgBase: 11, dmgPerLevel: 3.3, attackSpeed: 2.0,
    armorPerLevel: 24, moveSpeed: 7, aggroRadius: 13,
    aoePulse: { min: 12, max: 18, radius: 8, every: 9, name: 'Cave-In', school: 'physical' },
    summonAdds: { mobId: 'tunnel_rat', count: 2, atHpPct: [0.55, 0.30] },
    enrage: { belowHpPct: 0.30, dmgMult: 1.4, hasteMult: 1.3 },
    loot: [
      { copper: 150, chance: 1 },
      { itemId: 'tallow_candle', chance: 1 },
      // The hoarder's stash — a guaranteed step up the potion ladder this early.
      { itemId: 'lesser_healing_potion', chance: 1 },
      { itemId: 'tunnelkings_spade', chance: 0.3 },
      { itemId: 'moggers_copper_cudgel', chance: 0.25, rollGroup: 'grix_tunnelking_chase' },
      { itemId: 'hollowbone_hauberk', chance: 0.25, rollGroup: 'grix_tunnelking_chase' },
    ],
    scale: 1.15, color: 0xb9770e,
  },
  vale_bandit: {
    id: 'vale_bandit', name: 'Vale Bandit', minLevel: 3, maxLevel: 5, family: 'humanoid',
    hpBase: 40, hpPerLevel: 18, dmgBase: 5, dmgPerLevel: 2.0, attackSpeed: 2.0,
    armorPerLevel: 20, moveSpeed: 7, aggroRadius: 11,
    loot: [
      { copper: 25, chance: 1 },
      { itemId: 'bandit_bandana', chance: 0.5 },
      { itemId: 'linen_scrap', chance: 0.3 },
    ],
    scale: 1.0, color: 0x943126,
    // A practiced thug flings a handful of road grit to foul your aim.
    blind: { chance: 0.25, miss: 0.3, duration: 5, name: 'Blinding Powder', school: 'physical' },
  },
  restless_bones: {
    id: 'restless_bones', name: 'Restless Bones', minLevel: 5, maxLevel: 7, family: 'undead',
    hpBase: 46, hpPerLevel: 19, dmgBase: 7, dmgPerLevel: 2.1, attackSpeed: 2.3,
    armorPerLevel: 14, moveSpeed: 6.5, aggroRadius: 11,
    loot: [
      { copper: 30, chance: 1 },
      { itemId: 'bone_fragments', chance: 0.6 },
      { itemId: 'ghostly_essence', chance: 0.55, questId: 'q_rite' },
    ],
    scale: 1.0, color: 0xd5dbdb,
    // A grave-cold wail saps the strength from the living it strikes.
    demoralize: { ap: 20, duration: 8, name: 'Withering Wail' },
    // Grave-touch: a clawing swing may fester a creeping necrotic rot (shadow DoT).
    soulrot: { chance: 0.25, perTick: 4, interval: 3, duration: 12, name: 'Soulrot' },
  },
  captain_verlan: {
    // A rare named undead champion risen among the ruins' Restless Bones —
    // the undead family's rare elite, filling the gap beside Old Greyjaw
    // (beast), Elder Bristleback (beast), Sableweb Matriarch (spider) and
    // Mogger (humanoid). A heavy, slow striker that erupts in a shadow nova
    // and goes berserk when low; loot mirrors the other rare elites.
    id: 'captain_verlan', name: 'Captain Verlan', minLevel: 7, maxLevel: 7, family: 'undead', rare: true,
    elite: true, ccImmune: true, respawnMult: 432,
    hpBase: 280, hpPerLevel: 56, dmgBase: 12, dmgPerLevel: 3.4, attackSpeed: 2.6,
    armorPerLevel: 32, moveSpeed: 7.4, aggroRadius: 13,
    aoePulse: { min: 13, max: 19, radius: 9, every: 9, name: 'Hollow Nova', school: 'shadow', fx: 'nova' },
    enrage: { belowHpPct: 0.30, dmgMult: 1.5, hasteMult: 1.3 },
    loot: [
      { copper: 160, chance: 1 },
      { itemId: 'bone_fragments', chance: 1 },
      { itemId: 'oathbound_greaves', chance: 0.3 },
      { itemId: 'verlans_oathblade', chance: 0.25, rollGroup: 'verlan_chase' },
      { itemId: 'hollow_vigil_staff', chance: 0.25, rollGroup: 'verlan_chase' },
      { itemId: 'gravewardens_shiv', chance: 0.25, rollGroup: 'verlan_chase' },
    ],
    scale: 1.26, color: 0x3b4a5a,
  },
  wraithbinder_maldrec: {
    id: 'wraithbinder_maldrec', name: 'Wraithbinder Maldrec', minLevel: 7, maxLevel: 7, family: 'undead', rare: true,
    elite: true, ccImmune: true, respawnMult: 432,
    hpBase: 320, hpPerLevel: 60, dmgBase: 12, dmgPerLevel: 3.4, attackSpeed: 2.3,
    armorPerLevel: 28, moveSpeed: 6.8, aggroRadius: 13,
    // A fallen Gravecaller who bound his own soul to the chapel dead. A pulse of
    // grave-cold shadow rolls off him, and he tears the restless bones from the
    // ground to fight at his side, growing frantic as he is unmade.
    aoePulse: { min: 13, max: 19, radius: 9, every: 9, name: 'Grave Chill', school: 'shadow' },
    summonAdds: { mobId: 'restless_bones', count: 2, atHpPct: [0.65, 0.35] },
    enrage: { belowHpPct: 0.30, dmgMult: 1.5, hasteMult: 1.3 },
    loot: [
      { copper: 160, chance: 1 },
      { itemId: 'bone_fragments', chance: 1 },
      { itemId: 'maldrecs_soulbinder', chance: 0.25 },
      { itemId: 'hollowbone_hauberk', chance: 0.25, rollGroup: 'maldrec_chase' },
      { itemId: 'gravewoven_raiment', chance: 0.25, rollGroup: 'maldrec_chase' },
      { itemId: 'cryptstalker_jerkin', chance: 0.25, rollGroup: 'maldrec_chase' },
    ],
    scale: 1.22, color: 0x6f7f8f,
  },
  // -------------------------------------------------------------------------
  // Brightwood Glade — a sunlit wildlife grove in the north of the Vale. Gentle
  // beasts for low-level hunters to tame and cull, watched over by a lone ranger,
  // and crowned by a rare great stag. All family:'beast' so hunters can tame them.
  // -------------------------------------------------------------------------
  brightwood_hare: {
    id: 'brightwood_hare', name: 'Brightwood Hare', minLevel: 1, maxLevel: 2, family: 'beast',
    hpBase: 18, hpPerLevel: 8, dmgBase: 2, dmgPerLevel: 1.2, attackSpeed: 1.8,
    armorPerLevel: 6, moveSpeed: 9.5, aggroRadius: 0,
    loot: [
      { copper: 4, chance: 1 },
      { itemId: 'soft_down', chance: 0.45 },
    ],
    scale: 0.45, color: 0xc8a972,
  },
  glade_fox: {
    id: 'glade_fox', name: 'Glade Fox', minLevel: 2, maxLevel: 3, family: 'beast',
    hpBase: 26, hpPerLevel: 12, dmgBase: 3, dmgPerLevel: 1.5, attackSpeed: 1.7,
    armorPerLevel: 8, moveSpeed: 9, aggroRadius: 8,
    loot: [
      { copper: 8, chance: 1 },
      { itemId: 'glade_pelt', chance: 0.5 },
    ],
    scale: 0.6, color: 0xd2691e,
  },
  spotted_fawn: {
    id: 'spotted_fawn', name: 'Spotted Fawn', minLevel: 2, maxLevel: 3, family: 'beast',
    hpBase: 24, hpPerLevel: 11, dmgBase: 2, dmgPerLevel: 1.3, attackSpeed: 2.0,
    armorPerLevel: 7, moveSpeed: 8.5, aggroRadius: 0,
    loot: [
      { copper: 6, chance: 1 },
      { itemId: 'glade_pelt', chance: 0.4 },
      { itemId: 'brightwood_venison', chance: 0.3 },
    ],
    scale: 0.65, color: 0xb5895f,
  },
  meadow_crane: {
    id: 'meadow_crane', name: 'Meadow Crane', minLevel: 3, maxLevel: 4, family: 'beast',
    hpBase: 34, hpPerLevel: 14, dmgBase: 4, dmgPerLevel: 1.6, attackSpeed: 1.9,
    armorPerLevel: 9, moveSpeed: 8.5, aggroRadius: 9,
    loot: [
      { copper: 10, chance: 1 },
      { itemId: 'soft_down', chance: 0.55 },
    ],
    scale: 0.8, color: 0xeaeaea,
  },
  thornpelt_badger: {
    id: 'thornpelt_badger', name: 'Thornpelt Badger', minLevel: 3, maxLevel: 4, family: 'beast',
    hpBase: 44, hpPerLevel: 16, dmgBase: 5, dmgPerLevel: 1.8, attackSpeed: 2.1,
    armorPerLevel: 14, moveSpeed: 7, aggroRadius: 10,
    // A stubborn digger — its coarse coat pricks anyone who melees it.
    thorns: { value: 3, name: 'Coarse Pelt' },
    loot: [
      { copper: 12, chance: 1 },
      { itemId: 'glade_pelt', chance: 0.5 },
    ],
    scale: 0.7, color: 0x5d5d5d,
  },
  dawnmane_doe: {
    id: 'dawnmane_doe', name: 'Dawnmane Doe', minLevel: 3, maxLevel: 4, family: 'beast',
    hpBase: 40, hpPerLevel: 16, dmgBase: 4, dmgPerLevel: 1.7, attackSpeed: 2.0,
    armorPerLevel: 10, moveSpeed: 8.5, aggroRadius: 8,
    loot: [
      { copper: 12, chance: 1 },
      { itemId: 'glade_pelt', chance: 0.5 },
      { itemId: 'brightwood_venison', chance: 0.4 },
    ],
    scale: 0.85, color: 0xa9763f,
  },
  bramble_lynx: {
    id: 'bramble_lynx', name: 'Bramble Lynx', minLevel: 4, maxLevel: 5, family: 'beast',
    hpBase: 50, hpPerLevel: 18, dmgBase: 6, dmgPerLevel: 2.0, attackSpeed: 1.7,
    armorPerLevel: 12, moveSpeed: 8.5, aggroRadius: 11,
    // Hunts in loose prides — a wounded lynx yowls and the pride goes savage.
    packFrenzy: { radius: 12, hasteMult: 1.3, duration: 8 },
    loot: [
      { copper: 16, chance: 1 },
      { itemId: 'glade_pelt', chance: 0.55 },
    ],
    scale: 0.8, color: 0x8a6d3b,
  },
  brightwood_stag: {
    id: 'brightwood_stag', name: 'Brightwood Stag', minLevel: 4, maxLevel: 5, family: 'beast',
    hpBase: 62, hpPerLevel: 20, dmgBase: 7, dmgPerLevel: 2.2, attackSpeed: 2.3,
    armorPerLevel: 14, moveSpeed: 8, aggroRadius: 9,
    // Lowers its antlers and bulls forward, swinging harder as the fight drags on.
    frenzyOnHit: { chance: 0.2, hasteMult: 1.25, duration: 6, name: 'Goring Charge' },
    loot: [
      { copper: 20, chance: 1 },
      { itemId: 'brightwood_venison', chance: 0.5 },
      { itemId: 'stag_antler', chance: 0.45 },
    ],
    scale: 1.0, color: 0x946638,
  },
  grovetusk_boar: {
    id: 'grovetusk_boar', name: 'Grovetusk Boar', minLevel: 5, maxLevel: 6, family: 'beast',
    hpBase: 74, hpPerLevel: 22, dmgBase: 8, dmgPerLevel: 2.4, attackSpeed: 2.2,
    armorPerLevel: 16, moveSpeed: 7.5, aggroRadius: 10,
    thorns: { value: 4, name: 'Bristled Hide' },
    loot: [
      { copper: 24, chance: 1 },
      { itemId: 'amber_hide', chance: 0.5 },
      { itemId: 'brightwood_venison', chance: 0.4 },
    ],
    scale: 1.05, color: 0x6b4423,
  },
  sunhide_bear: {
    id: 'sunhide_bear', name: 'Sunhide Bear', minLevel: 5, maxLevel: 6, family: 'beast',
    hpBase: 98, hpPerLevel: 24, dmgBase: 9, dmgPerLevel: 2.6, attackSpeed: 2.5,
    armorPerLevel: 20, moveSpeed: 7.2, aggroRadius: 11,
    // A heavy bruiser that turns furious when cornered.
    enrage: { belowHpPct: 0.35, dmgMult: 1.35, hasteMult: 1.2 },
    loot: [
      { copper: 30, chance: 1 },
      { itemId: 'amber_hide', chance: 0.6 },
      { itemId: 'brightwood_venison', chance: 0.3 },
    ],
    scale: 1.2, color: 0xc99a4b,
  },
  brightwood_monarch: {
    id: 'brightwood_monarch', name: 'The Brightwood Monarch', minLevel: 6, maxLevel: 6, family: 'beast', rare: true,
    elite: true, ccImmune: true, respawnMult: 432,
    hpBase: 240, hpPerLevel: 48, dmgBase: 11, dmgPerLevel: 3.2, attackSpeed: 2.4,
    armorPerLevel: 26, moveSpeed: 8, aggroRadius: 12,
    // The great stag of the glade. It sweeps a wide arc with its crown of antlers
    // and grows wild with fury as it is brought low.
    aoePulse: { min: 12, max: 18, radius: 8, every: 9, name: 'Antler Sweep', school: 'physical' },
    enrage: { belowHpPct: 0.30, dmgMult: 1.4, hasteMult: 1.3 },
    loot: [
      { copper: 140, chance: 1 },
      { itemId: 'brightwood_venison', chance: 1 },
      { itemId: 'monarch_heart', chance: 1, questId: 'q_brightwood_monarch' },
      { itemId: 'stag_antler', chance: 1 },
      { itemId: 'monarch_crown_helm', chance: 0.3 },
    ],
    scale: 1.3, color: 0xe0b84a,
  },
  gorrak: {
    id: 'gorrak', name: 'Gorrak the Ruthless', minLevel: 6, maxLevel: 6, family: 'humanoid',
    hpBase: 160, hpPerLevel: 30, dmgBase: 8, dmgPerLevel: 2.4, attackSpeed: 2.4,
    armorPerLevel: 30, moveSpeed: 7, aggroRadius: 13, boss: true,
    loot: [
      { copper: 250, chance: 1 },
      { itemId: 'bandit_bandana', chance: 1 },
      { itemId: 'oiled_boots', chance: 0.5 },
      { itemId: 'quilted_trousers', chance: 0.5 },
      { itemId: 'gorraks_cruel_chopper', chance: 0.25 },
      { itemId: 'gorraks_cleaver', chance: 0.3 },
    ],
    scale: 1.25, color: 0x6c3483,
  },
};

// ---------------------------------------------------------------------------
// NPCs
// ---------------------------------------------------------------------------

export const ZONE1_NPCS: Record<string, NpcDef> = {
  the_merchant: {
    id: 'the_merchant', name: 'The Merchant', title: 'Keeper of the World Market',
    // centerpiece of the square, just north of the well, facing the approach
    pos: { x: 0, z: 9.5 }, facing: Math.PI, color: 0xd4af37,
    questIds: [],
    market: true,
    greeting: 'Welcome to the World Market, $C. Buy from every adventurer in the realm — or set out your own wares and let coin find you.',
  },
  marshal_redbrook: {
    id: 'marshal_redbrook', name: 'Marshal Redbrook', title: 'Town Marshal',
    pos: { x: 4, z: 6 }, facing: Math.PI, color: 0xb7950b,
    questIds: [
      'q_wolves', 'q_greyjaw', 'q_bandits', 'q_ringleader', 'q_mogger_tracks', 'q_mogger',
      'q_ledger_first_duty', 'q_ledger_teeth', 'q_ledger_toll', 'q_ledger_outlaw_captain',
    ],
    greeting: 'Keep your blade close, $C. The Vale is not what it was.',
  },
  trader_wilkes: {
    id: 'trader_wilkes', name: 'Trader Wilkes', title: 'Provisioner',
    pos: { x: -7, z: 3 }, facing: Math.PI / 2, color: 0x1e8449,
    questIds: ['q_boars', 'q_supplies', 'q_ledger_great_boar'],
    vendorItems: ['baked_bread', 'spring_water', 'roasted_boar', 'tough_jerky', 'minor_healing_potion', 'minor_mana_potion'],
    greeting: 'Fresh bread, clean water, fair prices. What can I get you?',
  },
  apothecary_lin: {
    id: 'apothecary_lin', name: 'Apothecary Lin', title: 'Herbalist',
    pos: { x: 11, z: -3 }, facing: -Math.PI / 2, color: 0x7d3c98,
    questIds: ['q_spiders', 'q_ledger_silk', 'q_ledger_brood'],
    greeting: 'Careful where you step in the eastern woods, friend.',
  },
  brother_aldric: {
    id: 'brother_aldric', name: 'Brother Aldric', title: 'Priest of the Vale',
    pos: { x: -14, z: -10 }, facing: 0.8, color: 0xf7f9f9,
    questIds: [
      'q_bones', 'q_whispers', 'q_names_of_the_dead', 'q_silence_the_call',
      'q_rite', 'q_sexton', 'q_hollow', 'q_gravecallers_trail', 'q_fenbridge_muster',
      'q_ledger_vigil',
    ],
    greeting: 'The Light keep you. Even the dead find no rest here of late.',
  },
  smith_haldren: {
    id: 'smith_haldren', name: 'Smith Haldren', title: 'Armorer & Weaponsmith',
    pos: { x: 7, z: 16.5 }, facing: -2.7, color: 0x707b7c,
    questIds: [],
    vendorItems: [
      'eastbrook_arming_sword', 'bronzework_mace', 'vale_carving_knife', 'hickory_shortstaff',
      'eastbrook_chain_vest', 'valespun_robe', 'tanned_leather_jerkin',
      'hobnail_boots', 'eastbrook_wool_trousers',
    ],
    greeting: 'Mind the sparks, $C. Good steel is the difference between a scar and a grave.',
  },
  fisherman_brandt: {
    id: 'fisherman_brandt', name: 'Fisherman Brandt', title: 'Old Salt',
    // in town (east edge, glaring out at Mirror Lake) — his old spot by the
    // dock sat inside the Mudfin spawn radius and new players got ambushed
    // walking up to a quest giver
    pos: { x: -16, z: 6 }, facing: -0.75, color: 0x2471a3,
    questIds: ['q_murlocs', 'q_ledger_reedwater'],
    vendorItems: ['simple_fishing_pole'],
    greeting: 'Grlmurlgrl— sorry, been listening to those fish-men too long.',
  },
  foreman_odell: {
    id: 'foreman_odell', name: 'Foreman Odell', title: 'Mine Foreman',
    // in town (south edge, scowling toward his overrun dig) — his old spot
    // sat inside the Tunnel Rat spawn radius
    pos: { x: -4, z: -14 }, facing: -2.14, color: 0xa04000,
    questIds: ['q_mine', 'q_ledger_deepvermin'],
    greeting: "Whole dig's crawling with those candle-headed vermin!",
  },
  ranger_elwyn: {
    id: 'ranger_elwyn', name: 'Ranger Elwyn', title: 'Glade Warden',
    // posted at the south edge of Brightwood Glade, watching the treeline
    pos: { x: 35, z: 118 }, facing: 0, color: 0x3a7d44,
    questIds: [
      'q_brightwood_thinning', 'q_brightwood_monarch',
      'q_glade_overbrowse', 'q_glade_foxes', 'q_glade_census', 'q_glade_diggers',
      'q_glade_amber', 'q_glade_rut', 'q_glade_treeline', 'q_glade_snares',
      'q_glade_apex', 'q_glade_long_watch',
    ],
    greeting: 'Quiet, $C — the glade is calm today, and I mean to keep it that way.',
  },
  bounty_master_corwin: {
    id: 'bounty_master_corwin', name: 'Bounty Master Corwin', title: 'Keeper of the Wanted Board',
    // beside the marshal's office, where the wanted board is nailed up
    pos: { x: 9, z: 9 }, facing: -2.2, color: 0x8b5a2b,
    questIds: [
      'q_bounty_wolves', 'q_bounty_boars', 'q_bounty_bristleback', 'q_bounty_webwood',
      'q_bounty_matriarch', 'q_bounty_mudfin', 'q_bounty_bandits', 'q_bounty_restless',
      'q_bounty_verlan', 'q_bounty_maldrec',
    ],
    greeting: 'New posters every week, $C, and the ink never dries. Read the board — the bold ones earn coin.',
  innkeeper_wenna: {
    id: 'innkeeper_wenna', name: 'Innkeeper Wenna', title: 'Keeper of the Brightwood Tap',
    // outside the tavern on the square's west side, sleeves rolled up
    pos: { x: -11, z: 16 }, facing: -2.4, color: 0xb9770e,
    questIds: [
      'q_tap_cellar_rats', 'q_tap_table_fowl', 'q_tap_spit_boar', 'q_tap_house_wolves',
      'q_tap_cellar_spiders', 'q_tap_prized_greyjaw', 'q_tap_unpaid_tab', 'q_tap_venison',
      'q_tap_gorrak_raid', 'q_harvest_feast',
    ],
    greeting: "The Brightwood Tap's been shuttered a season, $N, but I mean to throw a Harvest Feast that Eastbrook will talk about for years. Lend me a strong arm and there's coin — and a warm hearth — in it for you.",
  antiquarian_veska: {
    id: 'antiquarian_veska', name: 'Antiquarian Veska', title: 'Vale Antiquarian',
    // a cataloguer's table at the northeast edge of town, clear of every spawn camp
    pos: { x: 8, z: 8 }, facing: -0.6, color: 0x9c6b2f,
    questIds: [
      'q_relic_dust', 'q_relic_robbers', 'q_relic_tunnels', 'q_relic_web',
      'q_relic_matriarch', 'q_relic_drowned', 'q_relic_field', 'q_relic_custodian',
      'q_relic_gorrak', 'q_relic_looterking',
    ],
    greeting: 'Every spade-turn of this valley buries a story, $N — and something always crawls in to gnaw it.',
  beekeeper_orla: {
    id: 'beekeeper_orla', name: 'Beekeeper Orla', title: 'Brightwood Apiarist',
    // tends her hive-stands at the glade's western edge, smoker in hand
    pos: { x: 12, z: 124 }, facing: -0.6, color: 0xd9a441,
    questIds: [
      'q_apiary_clover', 'q_apiary_waxthieves', 'q_apiary_underminers',
      'q_apiary_forage_path', 'q_apiary_honey_raiders', 'q_apiary_blossom_blight',
      'q_apiary_trampled_meadow', 'q_apiary_north_road', 'q_apiary_clover_gluttons',
      'q_apiary_moth_monarch',
    ],
    greeting: 'Mind the smoker, $C — calm bees make sweet honey, and angry ones make for a long day.',
  lampwright_sefa: {
    id: 'lampwright_sefa', name: 'Lampwright Sefa', title: 'Keeper of the Road Lanterns',
    // by the great road-lantern on the north edge of town, oil-can in hand
    pos: { x: 6, z: 12 }, facing: 0.4, color: 0xe0a020,
    questIds: [
      'q_lamp_first_night', 'q_lamp_boars', 'q_lamp_foxes', 'q_lamp_webs',
      'q_lamp_badgers', 'q_lamp_snuffers', 'q_lamp_lakeroad', 'q_lamp_lynx',
      'q_lamp_bears', 'q_lamp_the_walking_lights',
    ],
    greeting: 'Every lantern on the Vale roads is mine to keep lit, $C — and the dark between them is full of teeth.',
  postmaster_calder: {
    id: 'postmaster_calder', name: 'Postmaster Calder', title: 'Keeper of the Vale Post',
    // at the north edge of the square by the road out of town, where the old
    // mail-cart used to stand before the roads went bad
    pos: { x: -9, z: 15 }, facing: -0.6, color: 0x9a6b2f,
    questIds: [
      'q_post_firstrun', 'q_post_meadow', 'q_post_reedwater', 'q_post_eastwood',
      'q_post_collapse', 'q_post_tollroad', 'q_post_greyjaw', 'q_post_chapelnight',
      'q_post_cache', 'q_post_burned_post',
    ],
    greeting: 'A letter is a promise, $N — and the Vale has broken too many lately. Every road out of Eastbrook has gone to teeth and thieves, and my riders will not carry the post through them. Clear me a road and you keep the whole Vale talking to itself.',
  },
};

// ---------------------------------------------------------------------------
// Quests
// ---------------------------------------------------------------------------

export const ZONE1_QUESTS: Record<string, QuestDef> = {
  q_wolves: {
    id: 'q_wolves', name: 'Wolves at the Door',
    giverNpcId: 'marshal_redbrook', turnInNpcId: 'marshal_redbrook',
    text: 'The forest wolves grow bold, snapping at travelers on the north road. Thin their numbers, $N. Slay 8 Forest Wolves and Eastbrook will breathe easier.',
    completionText: 'Fine work. The road feels safer already.',
    objectives: [{ type: 'kill', targetMobId: 'forest_wolf', count: 8, label: 'Forest Wolf slain' }],
    xpReward: 250, copperReward: 75, itemRewards: {},
  },
  q_greyjaw: {
    id: 'q_greyjaw', name: 'The Old Wolf',
    giverNpcId: 'marshal_redbrook', turnInNpcId: 'marshal_redbrook',
    text: 'There is one wolf no trap has held: Old Greyjaw. He has taken three hounds and a stable boy\'s arm. He prowls the deep woods north of the wolf runs. Bring me his fang.',
    completionText: 'So the old devil is dead at last. The stable boy will sleep easier — and so will I.',
    objectives: [{ type: 'collect', itemId: 'greyjaw_fang', count: 1, label: "Old Greyjaw's Fang" }],
    xpReward: 450, copperReward: 150,
    itemRewards: { warrior: 'greyjaw_pelt_cloak', mage: 'greyjaw_pelt_cloak', rogue: 'greyjaw_pelt_cloak' },
    requiresQuest: 'q_wolves',
  },
  q_boars: {
    id: 'q_boars', name: 'Bristleback Hides',
    giverNpcId: 'trader_wilkes', turnInNpcId: 'trader_wilkes',
    text: 'Boar hide makes the finest travel packs, and the meadows west of town are crawling with the beasts. Bring me 5 Bristly Boar Hides and I will make it worth your time.',
    completionText: 'Ah, fine bristly hides! These will fetch a good price.',
    objectives: [{ type: 'collect', itemId: 'boar_hide', count: 5, label: 'Bristly Boar Hide' }],
    xpReward: 350, copperReward: 120, itemRewards: {},
  },
  q_spiders: {
    id: 'q_spiders', name: 'Webwood Menace',
    giverNpcId: 'apothecary_lin', turnInNpcId: 'apothecary_lin',
    text: 'The lurkers in the eastern woods spin a silk I need for my poultices — and they have grown far too numerous besides. Cull 6 Webwood Lurkers and cut 4 silk glands from their bellies.',
    completionText: 'Ugh, still twitching. Perfect. Here, you\'ve earned this.',
    objectives: [
      { type: 'kill', targetMobId: 'webwood_spider', count: 6, label: 'Webwood Lurker slain' },
      { type: 'collect', itemId: 'webwood_silk', count: 4, label: 'Webwood Silk Gland' },
    ],
    xpReward: 420, copperReward: 140, itemRewards: {},
    minLevel: 2,
  },
  q_murlocs: {
    id: 'q_murlocs', name: 'Trouble at the Lake',
    giverNpcId: 'fisherman_brandt', turnInNpcId: 'fisherman_brandt',
    text: 'Twenty years I have fished Mirror Lake, and never lost a net until those gurgling fish-men crawled out of the shallows. Drive the Mudfin back — slay 8 of them. And watch yourself: where there is one murloc, there are five.',
    completionText: 'Hah! That will teach them to mind their own mudholes.',
    objectives: [{ type: 'kill', targetMobId: 'mudfin_murloc', count: 8, label: 'Mudfin Skulker slain' }],
    xpReward: 520, copperReward: 180, itemRewards: {},
    minLevel: 3,
  },
  q_mine: {
    id: 'q_mine', name: 'Rats in the Mine',
    giverNpcId: 'foreman_odell', turnInNpcId: 'foreman_odell',
    text: 'We struck a fine copper vein and then those kobold vermin came boiling out of the hillside. My crew will not set foot in the dig until it is cleared. Put down 10 Tunnel Rat Diggers.',
    completionText: 'Ha! Back to work, lads! You have my thanks — and my coin.',
    objectives: [{ type: 'kill', targetMobId: 'tunnel_rat', count: 10, label: 'Tunnel Rat Digger slain' }],
    xpReward: 620, copperReward: 220, itemRewards: {},
    minLevel: 4,
  },
  q_bones: {
    id: 'q_bones', name: 'The Restless Dead',
    giverNpcId: 'brother_aldric', turnInNpcId: 'brother_aldric',
    text: 'The old ruin on the northwest hill was a chapel once, and its yard a resting place. Something has stirred the dead from their sleep. Grant them peace, $N — return 8 Restless Bones to the earth.',
    completionText: 'May they rest now, and may the Light forgive whatever woke them.',
    objectives: [{ type: 'kill', targetMobId: 'restless_bones', count: 8, label: 'Restless Bones laid to rest' }],
    xpReward: 700, copperReward: 260, itemRewards: {},
    minLevel: 5,
  },
  q_supplies: {
    id: 'q_supplies', name: 'Stolen Supplies',
    giverNpcId: 'trader_wilkes', turnInNpcId: 'trader_wilkes',
    text: 'Those bandits hit my last wagon and made off with four crates of goods — tools, salt, good Eastbrook linen. The crates are stacked around their camp in the southeast hills. Steal them back for me, would you?',
    completionText: 'My crates! Barely a scratch on them. You are a wonder.',
    objectives: [{ type: 'collect', itemId: 'supply_crate', count: 4, label: 'Stolen Supply Crate' }],
    xpReward: 550, copperReward: 250, itemRewards: {},
    minLevel: 3,
  },
  q_whispers: {
    id: 'q_whispers', name: 'Whispers Below',
    giverNpcId: 'brother_aldric', turnInNpcId: 'brother_aldric',
    text: 'You have laid the dead to rest, but they will not stay resting — something calls them back. Search the chapel ruin for any trace of the one doing the calling. If you find a sigil or seal, bring it to me untouched.',
    completionText: 'This sigil... it bears the mark of the Gravecallers, a sect I had prayed was extinct. This is worse than I feared, $N.',
    objectives: [{ type: 'collect', itemId: 'gravecaller_sigil', count: 1, label: "Gravecaller's Sigil" }],
    xpReward: 400, copperReward: 150, itemRewards: {},
    requiresQuest: 'q_bones',
  },
  q_names_of_the_dead: {
    id: 'q_names_of_the_dead', name: 'The Names of the Dead',
    giverNpcId: 'brother_aldric', turnInNpcId: 'brother_aldric',
    text: 'If the Gravecallers raised our dead, I must know whose graves they robbed. The chapel sexton kept a burial ledger, and the wind has scattered its pages across the chapel yard. Gather 3 of them for me, $N — the dead deserve to be called by their names.',
    completionText: 'These poor souls... and look here. Sexton Marrow — the chapel\'s own living caretaker — his grave the first disturbed. Morthen began with the very man who buried Eastbrook\'s dead.',
    objectives: [{ type: 'collect', itemId: 'weathered_ledger_page', count: 3, label: 'Weathered Ledger Page' }],
    xpReward: 600, copperReward: 250, itemRewards: {},
    requiresQuest: 'q_whispers',
  },
  q_silence_the_call: {
    id: 'q_silence_the_call', name: 'Silence the Call',
    giverNpcId: 'brother_aldric', turnInNpcId: 'brother_aldric',
    text: 'Every name in that ledger is a soul Morthen means to drag from the earth, and the chapel yard already crawls with those he has called. Return 12 Restless Bones to their graves, $N, before the Gravecaller\'s whisper swells into a chorus.',
    completionText: 'The yard grows quieter — but the calling has not stopped. It rises from below now, $N. From the crypt itself.',
    objectives: [{ type: 'kill', targetMobId: 'restless_bones', count: 12, label: 'Restless Bones silenced' }],
    xpReward: 750, copperReward: 300, itemRewards: {},
    requiresQuest: 'q_names_of_the_dead',
  },
  q_rite: {
    id: 'q_rite', name: 'The Binding Rite',
    giverNpcId: 'brother_aldric', turnInNpcId: 'brother_aldric',
    text: 'The crypt beneath the chapel must be unsealed if we are to stop the Gravecaller — but only a binding rite will let the living pass. I need 4 lumps of Blessed Tallow — the kobold diggers hoard candles by the crate — and 6 Ghostly Essences from the restless dead.',
    completionText: 'It is done. The way below stands open... and may the Light forgive me for opening it. Gather your strongest companions before you descend, $N. No one should face the Hollow alone.',
    objectives: [
      { type: 'collect', itemId: 'blessed_wax', count: 4, label: 'Blessed Tallow' },
      { type: 'collect', itemId: 'ghostly_essence', count: 6, label: 'Ghostly Essence' },
    ],
    xpReward: 700, copperReward: 500, itemRewards: {},
    requiresQuest: 'q_whispers',
  },
  q_hollow: {
    id: 'q_hollow', name: 'Into the Hollow',
    giverNpcId: 'brother_aldric', turnInNpcId: 'brother_aldric',
    text: 'Morthen the Gravecaller waits at the bottom of the Hollow Crypt, ringed by the elite dead he has raised. He is far beyond any one hero — take four companions, no fewer. End him, and the Vale\'s dead will finally sleep.',
    completionText: 'The whispering has stopped. You have done what the whole Vale could not, $N — the dead sleep, and Eastbrook owes you everything it has.',
    objectives: [{ type: 'kill', targetMobId: 'morthen', count: 1, label: 'Morthen the Gravecaller slain' }],
    xpReward: 1500, copperReward: 10000,
    itemRewards: { warrior: 'gravecaller_blade', rogue: 'widowfang_dirk', mage: 'gravecaller_staff' },
    requiresQuest: 'q_rite',
    suggestedPlayers: 5,
  },
  q_sexton: {
    id: 'q_sexton', name: "The Sexton's Bell",
    giverNpcId: 'brother_aldric', turnInNpcId: 'brother_aldric',
    text: 'The ledger named him and the crypt holds him: Sexton Marrow, the chapel\'s caretaker, the first man Morthen raised — guarding his master\'s door in death as faithfully as he kept the chapel in life. Take four companions into the Hollow Crypt and grant the old sexton the rest he was robbed of, $N.',
    completionText: 'So Marrow is free at last. Ring no bell for him — he heard enough of them in life.',
    objectives: [{ type: 'kill', targetMobId: 'sexton_marrow', count: 1, label: 'Sexton Marrow laid to rest' }],
    xpReward: 1000, copperReward: 600,
    itemRewards: { warrior: 'marrowtread_boots', mage: 'sextons_slippers', rogue: 'gravewalker_softboots' },
    requiresQuest: 'q_rite',
    suggestedPlayers: 5,
  },
  q_gravecallers_trail: {
    id: 'q_gravecallers_trail', name: "The Gravecaller's Trail",
    giverNpcId: 'brother_aldric', turnInNpcId: 'brother_aldric',
    text: 'Morthen is dead, yet a question gnaws at me: a sect that hid for a century does not spend itself on one village chapel. He kept a grimoire — his rites, his correspondence. If anything of it survives, it lies in the vestry of the ruined chapel above the crypt. Search the ruin and bring me whatever remains of his writings, $N.',
    completionText: 'Morthen wrote to a \'Mistcaller\' in the northern fen. The sect is not dead, $N — it has merely been patient.',
    objectives: [{ type: 'collect', itemId: 'morthen_grimoire', count: 1, label: "Morthen's Grimoire" }],
    xpReward: 900, copperReward: 400, itemRewards: {},
    requiresQuest: 'q_hollow',
  },
  q_bandits: {
    id: 'q_bandits', name: 'Bandits of the Vale',
    giverNpcId: 'marshal_redbrook', turnInNpcId: 'marshal_redbrook',
    text: 'A pack of cutthroats has made camp in the southwest hills. They have robbed three wagons this week. Drive them out — slay 10 Vale Bandits.',
    completionText: 'Ten fewer knives in the dark. Take this — you have earned it.',
    objectives: [{ type: 'kill', targetMobId: 'vale_bandit', count: 10, label: 'Vale Bandit slain' }],
    xpReward: 550, copperReward: 200,
    itemRewards: { warrior: 'redbrook_blade', mage: 'apprentice_staff', rogue: 'keen_dirk' },
    requiresQuest: 'q_wolves',
  },
  q_ringleader: {
    id: 'q_ringleader', name: 'The Ringleader',
    giverNpcId: 'marshal_redbrook', turnInNpcId: 'marshal_redbrook',
    text: 'The bandits answer to one man: Gorrak the Ruthless. Cut off the head and the body will scatter. He skulks at the heart of their camp. End him, $N.',
    completionText: 'Gorrak is dead? Then the Vale is free of his shadow. You have done Eastbrook a great service.',
    objectives: [{ type: 'kill', targetMobId: 'gorrak', count: 1, label: 'Gorrak the Ruthless slain' }],
    xpReward: 800, copperReward: 500,
    itemRewards: { warrior: 'militia_vest', mage: 'woven_robe', rogue: 'shadow_jerkin' },
    requiresQuest: 'q_bandits',
  },
  q_mogger_tracks: {
    id: 'q_mogger_tracks', name: "Mogger's Trail",
    giverNpcId: 'marshal_redbrook', turnInNpcId: 'marshal_redbrook',
    text: "Before you take the road north, Eastbrook has one last thorn in its side: Mogger. The brute has been trampling the lower meadow and driving the boars mad. Clear the meadow around his trail so we can see where he lairs.",
    completionText: "Those tracks are fresh and deep enough to hold rain. Mogger is no camp tale, $N — and he is close.",
    objectives: [{ type: 'kill', targetMobId: 'wild_boar', count: 8, label: 'Wild Boar driven from the trail' }],
    xpReward: 650, copperReward: 350, itemRewards: {},
    requiresQuest: 'q_gravecallers_trail',
    minLevel: 6,
  },
  q_mogger: {
    id: 'q_mogger', name: 'Mogger Must Fall',
    giverNpcId: 'marshal_redbrook', turnInNpcId: 'marshal_redbrook',
    text: 'Mogger has split carts, flattened fences, and killed enough livestock to empty half the Vale. Do not face him alone. Take two strong companions into the eastern meadow and put the brute down for good.',
    completionText: "Mogger dead at last. Eastbrook's fields are safer, and you leave the Vale with one more tale worth retelling.",
    objectives: [{ type: 'kill', targetMobId: 'mogger', count: 1, label: 'Mogger slain' }],
    xpReward: 1200, copperReward: 900,
    itemRewards: { warrior: 'bristleback_maul', mage: 'sableweb_slippers', rogue: 'moggers_stomper_boots' },
    requiresQuest: 'q_mogger_tracks',
    minLevel: 6,
    suggestedPlayers: 3,
  },
  q_brightwood_thinning: {
    id: 'q_brightwood_thinning', name: 'Thinning the Glade',
    giverNpcId: 'ranger_elwyn', turnInNpcId: 'ranger_elwyn',
    text: 'Brightwood Glade is overrun, $N. The bramble lynx breed faster than I can cull them, and the herds trample what little grazing is left. Slay 8 Bramble Lynx and bring me 6 Glade Pelts so I can judge the health of the rest.',
    completionText: 'Good. The pride is thinned and these pelts are sound — the glade will hold another season.',
    objectives: [
      { type: 'kill', targetMobId: 'bramble_lynx', count: 8, label: 'Bramble Lynx slain' },
      { type: 'collect', itemId: 'glade_pelt', count: 6, label: 'Glade Pelt' },
    ],
    xpReward: 480, copperReward: 160,
    itemRewards: { warrior: 'bramblehide_jerkin', mage: 'bramblehide_jerkin', rogue: 'bramblehide_jerkin' },
    minLevel: 4,
  },
  q_brightwood_monarch: {
    id: 'q_brightwood_monarch', name: 'The Brightwood Monarch',
    giverNpcId: 'ranger_elwyn', turnInNpcId: 'ranger_elwyn',
    text: 'There is one beast I will not loose an arrow at alone: the Brightwood Monarch, the great stag that rules the deep glade. He has grown old and savage, goring any who near his hollow. He is more than a match for one hunter — bring a friend or two. Lay him to rest and bring me his heart, $N.',
    completionText: 'So the old king has fallen. A heavy thing, this — but a kinder end than the wolves would have given him. Wear this crown of his antlers with respect, $N.',
    objectives: [{ type: 'collect', itemId: 'monarch_heart', count: 1, label: "The Monarch's Heart" }],
    xpReward: 900, copperReward: 450,
    itemRewards: { warrior: 'monarch_crown_helm', mage: 'monarch_crown_helm', rogue: 'monarch_crown_helm' },
    requiresQuest: 'q_brightwood_thinning',
    minLevel: 5,
    suggestedPlayers: 2,
  },

  // -------------------------------------------------------------------------
  // The Warden's Ledger — a 10-step bounty chain Marshal Redbrook and the
  // Vale's standing folk hand out alongside the main story. Every objective
  // targets mobs that already roam Eastbrook, so the chain adds pacing and
  // reward without touching spawns or determinism.
  // -------------------------------------------------------------------------
  q_ledger_first_duty: {
    id: 'q_ledger_first_duty', name: "A Warden's First Duty",
    giverNpcId: 'marshal_redbrook', turnInNpcId: 'marshal_redbrook',
    text: 'You want to earn your keep in Eastbrook, $N? Then start where every warden starts. The boars in the west meadow have grown fat and fearless, rooting up the spring planting. Cull 8 Wild Boar and the ledger will remember your name.',
    completionText: 'Eight boars and the planting saved. Good. Every name in this ledger started just where you are standing.',
    objectives: [{ type: 'kill', targetMobId: 'wild_boar', count: 8, label: 'Wild Boar culled' }],
    xpReward: 240, copperReward: 70, itemRewards: {},
    minLevel: 1,
  },
  q_ledger_teeth: {
    id: 'q_ledger_teeth', name: 'Teeth in the Dark',
    giverNpcId: 'marshal_redbrook', turnInNpcId: 'marshal_redbrook',
    text: 'The wolf packs have learned the patrol routes — they hit at dusk, when the light is thin and a lone traveler is easy meat. Break them, $N. Slay 10 Forest Wolves and let the packs learn a new lesson.',
    completionText: 'Ten wolves, and the dusk road is ours again. The ledger grows kinder to you.',
    objectives: [{ type: 'kill', targetMobId: 'forest_wolf', count: 10, label: 'Forest Wolf slain' }],
    xpReward: 320, copperReward: 110, itemRewards: {},
    requiresQuest: 'q_ledger_first_duty',
    minLevel: 2,
  },
  q_ledger_reedwater: {
    id: 'q_ledger_reedwater', name: 'Reedwater Patrol',
    giverNpcId: 'fisherman_brandt', turnInNpcId: 'fisherman_brandt',
    text: 'Redbrook sent you? Good — these old bones cannot wade the shallows anymore. The Mudfin have crept back to the reedwater and they are bolder than ever. Thin them: 8 Mudfin Skulkers, and mind the deep water.',
    completionText: 'That will keep the gurgling devils off my nets for a season. Tell the Marshal the lake is quiet again.',
    objectives: [{ type: 'kill', targetMobId: 'mudfin_murloc', count: 8, label: 'Mudfin Skulker slain' }],
    xpReward: 430, copperReward: 150, itemRewards: {},
    requiresQuest: 'q_ledger_teeth',
    minLevel: 3,
  },
  q_ledger_silk: {
    id: 'q_ledger_silk', name: 'Silk and Venom',
    giverNpcId: 'apothecary_lin', turnInNpcId: 'apothecary_lin',
    text: 'The ledger marks the eastern woods as warden ground too. The Webwood lurkers spin thicker every week — a child wandered too close last market day and we cut her free barely breathing. Kill 8 Webwood Lurkers before they take the wood entirely.',
    completionText: 'Eight fewer spinners in the dark. The wood breathes easier, and so do I.',
    objectives: [{ type: 'kill', targetMobId: 'webwood_spider', count: 8, label: 'Webwood Lurker slain' }],
    xpReward: 450, copperReward: 160, itemRewards: {},
    requiresQuest: 'q_ledger_teeth',
    minLevel: 3,
  },
  q_ledger_brood: {
    id: 'q_ledger_brood', name: 'The Spawning Dark',
    giverNpcId: 'apothecary_lin', turnInNpcId: 'apothecary_lin',
    text: 'Killing the lurkers only made room for the brood. The Sableweb hatchlings are pouring out of the deep nest, and a hundred small fangs kill a traveler as surely as one great one. Crush 8 Sableweb Hatchlings before they grow.',
    completionText: 'A grim work, drowning a nest. But mercy now is a hundred funerals spared later. The ledger is square.',
    objectives: [{ type: 'kill', targetMobId: 'sableweb_hatchling', count: 8, label: 'Sableweb Hatchling crushed' }],
    xpReward: 500, copperReward: 175, itemRewards: {},
    requiresQuest: 'q_ledger_silk',
    minLevel: 4,
  },
  q_ledger_deepvermin: {
    id: 'q_ledger_deepvermin', name: 'Vermin in the Deep',
    giverNpcId: 'foreman_odell', turnInNpcId: 'foreman_odell',
    text: "The Marshal's ledger says you clear pests. Well, my dig has the worst of them. The tunnel rats breed faster than my crew can swing a pick — put down 12 Tunnel Rat Diggers and maybe we strike copper before winter.",
    completionText: 'Twelve of the candle-headed vermin, gone! Right, lads — back down the shaft. You have earned the Marshal a good word, $N.',
    objectives: [{ type: 'kill', targetMobId: 'tunnel_rat', count: 12, label: 'Tunnel Rat Digger slain' }],
    xpReward: 540, copperReward: 200, itemRewards: {},
    requiresQuest: 'q_ledger_reedwater',
    minLevel: 4,
  },
  q_ledger_toll: {
    id: 'q_ledger_toll', name: "The Highwaymen's Toll",
    giverNpcId: 'marshal_redbrook', turnInNpcId: 'marshal_redbrook',
    text: "The southeast hills have become a bandit's toll road — they rob anyone fool enough to travel light. The ledger has a price on every one of them. Bring Eastbrook justice to 8 Vale Bandits.",
    completionText: 'Eight bandits answered for. Word is already spreading that the toll road has a new keeper — and he does not take coin, he takes heads.',
    objectives: [{ type: 'kill', targetMobId: 'vale_bandit', count: 8, label: 'Vale Bandit brought to justice' }],
    xpReward: 560, copperReward: 220, itemRewards: {},
    requiresQuest: 'q_ledger_deepvermin',
    minLevel: 4,
  },
  q_ledger_vigil: {
    id: 'q_ledger_vigil', name: 'Vigil at the Chapel',
    giverNpcId: 'brother_aldric', turnInNpcId: 'brother_aldric',
    text: 'The Marshal sends his wardens to me when the trouble is past the reach of swords alone. The chapel dead will not lie still, and I am too old to stand the night vigil. Keep it for me, $N — lay 10 Restless Bones back to their rest.',
    completionText: 'Ten souls returned to the earth, and a night of peace bought for the chapel. The Light remembers such vigils, even when the ledger forgets.',
    objectives: [{ type: 'kill', targetMobId: 'restless_bones', count: 10, label: 'Restless Bones laid to rest' }],
    xpReward: 640, copperReward: 240, itemRewards: {},
    requiresQuest: 'q_ledger_toll',
    minLevel: 5,
  },
  q_ledger_great_boar: {
    id: 'q_ledger_great_boar', name: 'The Great Bristleback',
    giverNpcId: 'trader_wilkes', turnInNpcId: 'trader_wilkes',
    text: 'There is an old bull boar in the western thickets — the Elder Bristleback, hide like bark and a temper to match. He has gored two of my hide-runners. Bring him down and clear 6 of the lesser Wild Boar that shelter behind him, and I will see your name set high in the ledger.',
    completionText: 'The Elder Bristleback, dead by your hand! That hide alone is worth a season of trade. You have made the ledger proud, $N.',
    objectives: [
      { type: 'kill', targetMobId: 'elder_bristleback', count: 1, label: 'Elder Bristleback slain' },
      { type: 'kill', targetMobId: 'wild_boar', count: 6, label: 'Wild Boar of the herd slain' },
    ],
    xpReward: 760, copperReward: 280, itemRewards: {},
    requiresQuest: 'q_ledger_vigil',
    minLevel: 5,
  },
  q_ledger_outlaw_captain: {
    id: 'q_ledger_outlaw_captain', name: 'The Outlaw Captain',
    giverNpcId: 'marshal_redbrook', turnInNpcId: 'marshal_redbrook',
    text: 'The last name in the ledger is the one I have wanted crossed out for a year: Captain Verlan, who turned half the Vale to banditry. He shelters behind his lieutenants in the southeast camp. Cut down 6 Vale Bandits to reach him, then end Verlan himself. Do not go alone.',
    completionText: 'Captain Verlan, dead, and his coat brought to my door. The ledger is closed, $N — and the Vale will tell wardens-to-come the name of the one who closed it.',
    objectives: [
      { type: 'kill', targetMobId: 'vale_bandit', count: 6, label: 'Vale Bandit cut down' },
      { type: 'kill', targetMobId: 'captain_verlan', count: 1, label: 'Captain Verlan slain' },
    ],
    xpReward: 1000, copperReward: 400, itemRewards: {},
    requiresQuest: 'q_ledger_great_boar',
    minLevel: 6,
    suggestedPlayers: 2,
  },

  // -------------------------------------------------------------------------
  // The Glade Warden's Long Watch — a 10-step chain Ranger Elwyn hands out
  // once the glade is first thinned. It follows a single season's work keeping
  // Brightwood in balance: cull the overgrown herds, answer the predators they
  // draw, and break the poachers who follow the blood. Every objective targets
  // beasts and bandits that already roam Brightwood Glade, so the chain adds
  // pacing and reward without touching spawns, loot tables, or determinism.
  // -------------------------------------------------------------------------
  q_glade_overbrowse: {
    id: 'q_glade_overbrowse', name: 'The Overbrowsing Herds',
    giverNpcId: 'ranger_elwyn', turnInNpcId: 'ranger_elwyn',
    text: "Thinning the lynx was only half the work, $N. With the prides cut back, the deer have bred unchecked — the dawnmane does strip a glade to bare dirt in a week and move on. Cull 8 Dawnmane Does, and bring me 6 cuts of venison so the watch eats while we work.",
    completionText: 'Eight does and the larder filled. Cruel arithmetic, but a starved glade kills more deer than any arrow. Well done.',
    objectives: [
      { type: 'kill', targetMobId: 'dawnmane_doe', count: 8, label: 'Dawnmane Doe culled' },
      { type: 'collect', itemId: 'brightwood_venison', count: 6, label: 'Brightwood Venison' },
    ],
    xpReward: 500, copperReward: 170, itemRewards: {},
    requiresQuest: 'q_brightwood_thinning',
    minLevel: 4,
  },
  q_glade_foxes: {
    id: 'q_glade_foxes', name: 'Foxes at the Fawning Ground',
    giverNpcId: 'ranger_elwyn', turnInNpcId: 'ranger_elwyn',
    text: "Every spring the glade foxes den in the fawning ground and take the newborn spotted fawns before they can stand. I have lost three litters already this season. Drive the raiders off, $N — slay 10 Glade Foxes and the fawns may yet survive.",
    completionText: 'Ten foxes, and the fawning ground quiet at last. The does will thank you in their wordless way come summer.',
    objectives: [{ type: 'kill', targetMobId: 'glade_fox', count: 10, label: 'Glade Fox slain' }],
    xpReward: 520, copperReward: 180, itemRewards: {},
    requiresQuest: 'q_glade_overbrowse',
    minLevel: 4,
  },
  q_glade_census: {
    id: 'q_glade_census', name: 'A Census of Down',
    giverNpcId: 'ranger_elwyn', turnInNpcId: 'ranger_elwyn',
    text: "A warden who does not count cannot keep, $N. I judge the meadow crane flock by the down they shed — too much and the nesting has failed, too little and the marsh is creeping in. Gather me 8 tufts of Soft Down from the cranes and hares of the lower glade, and I will read the season in them.",
    completionText: 'Good down, clean and dry — the flock is sound. The glade speaks plainly to those who learn to listen. My thanks.',
    objectives: [{ type: 'collect', itemId: 'soft_down', count: 8, label: 'Soft Down' }],
    xpReward: 540, copperReward: 185, itemRewards: {},
    requiresQuest: 'q_glade_foxes',
    minLevel: 4,
  },
  q_glade_diggers: {
    id: 'q_glade_diggers', name: 'Diggers Among the Roots',
    giverNpcId: 'ranger_elwyn', turnInNpcId: 'ranger_elwyn',
    text: "The thornpelt badgers have turned the old oak stand into a warren — and a tree whose roots are tunnelled hollow falls in the first hard wind. I have marked three giants already leaning. Put down 8 Thornpelt Badgers before the canopy comes down with them.",
    completionText: 'Eight setts cleared. The oaks will stand another hundred years now, long after you and I are forgotten by everything but the glade.',
    objectives: [{ type: 'kill', targetMobId: 'thornpelt_badger', count: 8, label: 'Thornpelt Badger slain' }],
    xpReward: 560, copperReward: 195, itemRewards: {},
    requiresQuest: 'q_glade_census',
    minLevel: 4,
  },
  q_glade_amber: {
    id: 'q_glade_amber', name: 'Against the Long Cold',
    giverNpcId: 'ranger_elwyn', turnInNpcId: 'ranger_elwyn',
    text: "Winter is the warden's hardest watch, and the watch needs hides to outlast it. The grovetusk boars wear the thickest amber hide in the glade — and they are rooting up the seedbeds besides, so culling them serves twice. Slay 6 Grovetusk Boar and bring me 6 Amber Hides.",
    completionText: 'Six fine amber hides — enough to line the watch-hut against the worst of it. You think like a warden now, $N: every kill made to count twice.',
    objectives: [
      { type: 'kill', targetMobId: 'grovetusk_boar', count: 6, label: 'Grovetusk Boar slain' },
      { type: 'collect', itemId: 'amber_hide', count: 6, label: 'Amber Hide' },
    ],
    xpReward: 620, copperReward: 220, itemRewards: {},
    requiresQuest: 'q_glade_diggers',
    minLevel: 5,
  },
  q_glade_rut: {
    id: 'q_glade_rut', name: 'The Maddened Rut',
    giverNpcId: 'ranger_elwyn', turnInNpcId: 'ranger_elwyn',
    text: "The stag rut has turned to madness this year — the bucks gore anything that moves, and a woodcutter is laid up in Eastbrook with a hole through his thigh to prove it. Thin the rage from the herd: fell 8 Brightwood Stags, and cut me 5 antlers so I may judge their health by the bone.",
    completionText: 'Five sound antlers, and the rut broken before it cost a life. The bucks will settle now. A hard mercy, well delivered.',
    objectives: [
      { type: 'kill', targetMobId: 'brightwood_stag', count: 8, label: 'Brightwood Stag felled' },
      { type: 'collect', itemId: 'stag_antler', count: 5, label: 'Stag Antler' },
    ],
    xpReward: 660, copperReward: 235, itemRewards: {},
    requiresQuest: 'q_glade_amber',
    minLevel: 5,
  },
  q_glade_treeline: {
    id: 'q_glade_treeline', name: 'Wolves at the Treeline',
    giverNpcId: 'ranger_elwyn', turnInNpcId: 'ranger_elwyn',
    text: "The cull leaves carrion, and carrion draws wolves from the Vale beyond the glade. They are massing at the southern treeline now, bolder each dusk — soon they will not wait for the dead. Push them back, $N. Slay 12 Forest Wolves before they learn the glade is an open larder.",
    completionText: "Twelve wolves turned back into the Vale. The treeline holds. This is the warden's endless arithmetic — every answer raises a new question with teeth.",
    objectives: [{ type: 'kill', targetMobId: 'forest_wolf', count: 12, label: 'Forest Wolf driven off' }],
    xpReward: 700, copperReward: 250, itemRewards: {},
    requiresQuest: 'q_glade_rut',
    minLevel: 5,
  },
  q_glade_snares: {
    id: 'q_glade_snares', name: 'Snares in the Green',
    giverNpcId: 'ranger_elwyn', turnInNpcId: 'ranger_elwyn',
    text: "I have found wire snares strung through the deer-runs — cruel, indiscriminate things that leave a beast to die slow for a pelt. These are no hunter's tools; they are a poacher's. The Vale bandits have crept up into my glade. Find them and answer them: 8 Vale Bandits, $N.",
    completionText: 'Eight poachers down, and a sack of their filthy wire on my fire. But snares mean a snare-master, and that one I have not yet found...',
    objectives: [{ type: 'kill', targetMobId: 'vale_bandit', count: 8, label: 'Poaching Vale Bandit slain' }],
    xpReward: 740, copperReward: 270, itemRewards: {},
    requiresQuest: 'q_glade_treeline',
    minLevel: 6,
  },
  q_glade_apex: {
    id: 'q_glade_apex', name: 'The Apex Roused',
    giverNpcId: 'ranger_elwyn', turnInNpcId: 'ranger_elwyn',
    text: "The poachers' snares maddened the sunhide bears worst of all — a snared bear is a furious bear, and three of them now hold the eastern slope, killing for rage rather than meat. They are the glade's apex and I would not loose this work on you if I had another blade. Put down 8 Sunhide Bears and end their suffering.",
    completionText: 'Eight, and the slope gone quiet. To kill the very thing a warden swears to keep — that is the weight of this work, $N. Bear it well. The glade is nearly whole again.',
    objectives: [{ type: 'kill', targetMobId: 'sunhide_bear', count: 8, label: 'Maddened Sunhide Bear slain' }],
    xpReward: 820, copperReward: 320, itemRewards: {},
    requiresQuest: 'q_glade_snares',
    minLevel: 6,
  },
  q_glade_long_watch: {
    id: 'q_glade_long_watch', name: "The Warden's Long Watch",
    giverNpcId: 'ranger_elwyn', turnInNpcId: 'ranger_elwyn',
    text: "One task remains before the season turns, and it is the heaviest. The snare-master rallies the last of his poachers behind the lynx prides we first thinned — using my own glade's predators as a wall. Break that wall and break his band: cut down 10 Bramble Lynx he has driven before him, and bring me 8 Amber Hides as proof the eastern slope is reclaimed. Do not go alone.",
    completionText: "It is done. A full season's watch, start to finish, and the glade handed back to itself whole. I have wardened Brightwood twenty years, $N, and never with a better hand beside me. The glade will remember you — and so will I.",
    objectives: [
      { type: 'kill', targetMobId: 'bramble_lynx', count: 10, label: 'Bramble Lynx slain' },
      { type: 'collect', itemId: 'amber_hide', count: 8, label: 'Amber Hide reclaimed' },
    ],
    xpReward: 1000, copperReward: 420, itemRewards: {},
    requiresQuest: 'q_glade_apex',
    minLevel: 6,
    suggestedPlayers: 2,
  },
  // ---- The Eastbrook Bounty Board (Bounty Master Corwin) -------------------
  // An escalating wanted-poster chain. Every objective is a bounty on a
  // creature that already roams the Vale, so the board adds no new spawns —
  // just coin for clearing threats players already meet.
  q_bounty_wolves: {
    id: 'q_bounty_wolves', name: 'Bounty: The North Road Pack',
    giverNpcId: 'bounty_master_corwin', turnInNpcId: 'bounty_master_corwin',
    text: 'First poster on the board, $N: the wolf pack on the north road has chewed through two mail riders this month. The town has set a bounty on the pack — slay 10 Forest Wolves and the coin is yours.',
    completionText: 'Ten tails, ten coppers a tail, and a safer road. The board likes you already.',
    objectives: [{ type: 'kill', targetMobId: 'forest_wolf', count: 10, label: 'Forest Wolf claimed' }],
    xpReward: 300, copperReward: 90, itemRewards: {},
  },
  q_bounty_boars: {
    id: 'q_bounty_boars', name: 'Bounty: Tuskers in the Meadow',
    giverNpcId: 'bounty_master_corwin', turnInNpcId: 'bounty_master_corwin',
    text: 'The east meadow boars have turned mean — gored a herdsman and trampled his fence. There is a standing bounty on the brutes. Put down 8 Wild Boars and bring word back.',
    completionText: 'Eight fewer tuskers in the barley. The herdsmen chipped in extra for this one.',
    objectives: [{ type: 'kill', targetMobId: 'wild_boar', count: 8, label: 'Wild Boar claimed' }],
    xpReward: 340, copperReward: 110, itemRewards: {},
    requiresQuest: 'q_bounty_wolves',
  },
  q_bounty_bristleback: {
    id: 'q_bounty_bristleback', name: 'Wanted: Elder Bristleback',
    giverNpcId: 'bounty_master_corwin', turnInNpcId: 'bounty_master_corwin',
    text: 'Here is a named poster, $N. Elder Bristleback is the old grey-tusked boar that leads the meadow herd — twice the size of the rest and three times as cruel. He keeps to the far east edge of the meadow. The bounty is doubled for his head alone.',
    completionText: 'The old grey terror, dead. I will nail his poster up crossed-through where the others can see it.',
    objectives: [{ type: 'kill', targetMobId: 'elder_bristleback', count: 1, label: 'Elder Bristleback slain' }],
    xpReward: 450, copperReward: 180, itemRewards: {},
    requiresQuest: 'q_bounty_boars',
    minLevel: 4,
  },
  q_bounty_webwood: {
    id: 'q_bounty_webwood', name: 'Bounty: Clear the Webwood',
    giverNpcId: 'bounty_master_corwin', turnInNpcId: 'bounty_master_corwin',
    text: 'The lurkers in the western Webwood have strung the old logging trail shut. Foresters will not work it until the silk-spinners are thinned. Cull 10 Webwood Lurkers for the standing bounty.',
    completionText: 'The foresters can swing an axe again instead of cutting webs. Good coin earned.',
    objectives: [{ type: 'kill', targetMobId: 'webwood_spider', count: 10, label: 'Webwood Lurker claimed' }],
    xpReward: 420, copperReward: 150, itemRewards: {},
    requiresQuest: 'q_bounty_bristleback',
    minLevel: 4,
  },
  q_bounty_matriarch: {
    id: 'q_bounty_matriarch', name: 'Wanted: The Sableweb Matriarch',
    giverNpcId: 'bounty_master_corwin', turnInNpcId: 'bounty_master_corwin',
    text: 'The lurkers all answer to one bloated queen, $N — the Sableweb Matriarch, deep in the Webwood where the silk hangs thickest. While she lives the brood never ends. The board pays a hunter\'s bounty for her.',
    completionText: 'The queen is dead and the brood will scatter. That is a poster I am glad to tear down.',
    objectives: [{ type: 'kill', targetMobId: 'sableweb_matriarch', count: 1, label: 'Sableweb Matriarch slain' }],
    xpReward: 560, copperReward: 230, itemRewards: {},
    requiresQuest: 'q_bounty_webwood',
    minLevel: 5,
  },
  q_bounty_mudfin: {
    id: 'q_bounty_mudfin', name: 'Bounty: Mudfin Raiders',
    giverNpcId: 'bounty_master_corwin', turnInNpcId: 'bounty_master_corwin',
    text: 'The Mudfin murlocs have crawled up from the lake shallows and started raiding the western nets and creels. Fishermen want them gone and have pooled a bounty. Drive off 10 Mudfin Skulkers.',
    completionText: 'Ten murlocs sent back to the mud. The nets are the fishers\' own problem now.',
    objectives: [{ type: 'kill', targetMobId: 'mudfin_murloc', count: 10, label: 'Mudfin Skulker claimed' }],
    xpReward: 520, copperReward: 200, itemRewards: {},
    requiresQuest: 'q_bounty_matriarch',
    minLevel: 5,
  },
  q_bounty_bandits: {
    id: 'q_bounty_bandits', name: 'Bounty: Toll the Vale Road',
    giverNpcId: 'bounty_master_corwin', turnInNpcId: 'bounty_master_corwin',
    text: 'The Vale Bandits in the southeast hills have set up an unlawful toll and rob every wagon that passes. The Marshal wants them broken and the board carries his price. Cut down 12 Vale Bandits.',
    completionText: 'A dozen bandits off the road and the toll-rope cut down. Caravans will pass free again.',
    objectives: [{ type: 'kill', targetMobId: 'vale_bandit', count: 12, label: 'Vale Bandit claimed' }],
    xpReward: 600, copperReward: 240, itemRewards: {},
    requiresQuest: 'q_bounty_mudfin',
    minLevel: 5,
  },
  q_bounty_restless: {
    id: 'q_bounty_restless', name: 'Bounty: The Restless Dead',
    giverNpcId: 'bounty_master_corwin', turnInNpcId: 'bounty_master_corwin',
    text: 'Something walks the old chapel yard on the northeast hill — bones that should be sleeping. Brother Aldric blesses the bounty himself. Lay 10 Restless Bones back into the earth.',
    completionText: 'Ten of the walking dead put down. Brother Aldric will rest easier, and so will they.',
    objectives: [{ type: 'kill', targetMobId: 'restless_bones', count: 10, label: 'Restless Bones laid to rest' }],
    xpReward: 700, copperReward: 280, itemRewards: {},
    requiresQuest: 'q_bounty_bandits',
    minLevel: 6,
  },
  q_bounty_verlan: {
    id: 'q_bounty_verlan', name: 'Wanted: Captain Verlan',
    giverNpcId: 'bounty_master_corwin', turnInNpcId: 'bounty_master_corwin',
    text: 'The deadliest poster on my board, $N. Captain Verlan rose from his own grave to command the dead in the northeast yard — a warlord in death as he was in life. The bounty on him is the richest the town has ever posted. Do not face him alone.',
    completionText: 'Verlan, cut down a second time, and for good this time. That poster has hung on my board for a year. Tear it down yourself — you earned it.',
    objectives: [{ type: 'kill', targetMobId: 'captain_verlan', count: 1, label: 'Captain Verlan slain' }],
    xpReward: 900, copperReward: 360, itemRewards: {},
    requiresQuest: 'q_bounty_restless',
    minLevel: 6,
    suggestedPlayers: 2,
  },
  q_bounty_maldrec: {
    id: 'q_bounty_maldrec', name: 'Wanted: Wraithbinder Maldrec',
    giverNpcId: 'bounty_master_corwin', turnInNpcId: 'bounty_master_corwin',
    text: 'One name is left, and it is the worst of them: Wraithbinder Maldrec, the necromancer whose chants raise the chapel dead night after night. Kill him and the others stay buried. This is the last poster, $N — and the whole board has been leading you to it.',
    completionText: 'Maldrec is dead and the chapel yard has gone quiet at last. The board is bare for the first time in a year, $N. Whatever the Vale calls you, it will say it with respect.',
    objectives: [{ type: 'kill', targetMobId: 'wraithbinder_maldrec', count: 1, label: 'Wraithbinder Maldrec slain' }],
    xpReward: 1100, copperReward: 450, itemRewards: {},
    requiresQuest: 'q_bounty_verlan',
    minLevel: 7,
    suggestedPlayers: 2,
  // --- The Brightwood Tap: Innkeeper Wenna's Harvest Feast chain ---
  q_tap_cellar_rats: {
    id: 'q_tap_cellar_rats', name: 'Cellar Cleaning',
    giverNpcId: 'innkeeper_wenna', turnInNpcId: 'innkeeper_wenna',
    text: "A season shuttered and the tap-cellar has become a warren, $N. Tunnel rats have chewed through half my ale-barrels and nest in the old mine-cut beneath the floor. I cannot serve a soul until they are gone — clear out 10 Tunnel Rat Diggers and I can roll fresh casks in.",
    completionText: 'Listen to that — not a squeak. The cellar is mine again. Have a seat by the hearth while I draw you something.',
    objectives: [{ type: 'kill', targetMobId: 'tunnel_rat', count: 10, label: 'Tunnel Rat Digger cleared' }],
    xpReward: 320, copperReward: 90, itemRewards: {},
    minLevel: 4,
  },
  q_tap_table_fowl: {
    id: 'q_tap_table_fowl', name: 'Fowl for the Table',
    giverNpcId: 'innkeeper_wenna', turnInNpcId: 'innkeeper_wenna',
    text: 'A feast needs a roast, and nothing roasts sweeter than the long-legged cranes that wade the glade meadows. Bring me 8 Meadow Cranes, $N, and I will have the spits turning by week\'s end.',
    completionText: 'Eight fat cranes — the smell alone will pull half the Vale to my door. Well hunted.',
    objectives: [{ type: 'kill', targetMobId: 'meadow_crane', count: 8, label: 'Meadow Crane taken' }],
    xpReward: 380, copperReward: 110, itemRewards: {},
    requiresQuest: 'q_tap_cellar_rats', minLevel: 4,
  },
  q_tap_spit_boar: {
    id: 'q_tap_spit_boar', name: 'A Boar for the Spit',
    giverNpcId: 'innkeeper_wenna', turnInNpcId: 'innkeeper_wenna',
    text: 'Cranes for the gentry, but the farmhands want pork, and plenty of it. The wild boars root the fields east of town gone to ruin anyway — do the farmers a kindness and bring my larder 8 Wild Boar, $N.',
    completionText: 'That is pork enough to feed a barn-raising. The farmers will thank you near as loud as I do.',
    objectives: [{ type: 'kill', targetMobId: 'wild_boar', count: 8, label: 'Wild Boar felled' }],
    xpReward: 420, copperReward: 130, itemRewards: {},
    requiresQuest: 'q_tap_table_fowl', minLevel: 5,
  },
  q_tap_house_wolves: {
    id: 'q_tap_house_wolves', name: 'Wolves Off the Doorstep',
    giverNpcId: 'innkeeper_wenna', turnInNpcId: 'innkeeper_wenna',
    text: 'Word of a feast travels, and not only to honest folk — the forest wolves have grown bold enough to slink the north road after my supply carts. I\'ll not have guests savaged on their way to my door. Thin the pack, $N: 10 Forest Wolves.',
    completionText: 'The road feels safe enough for a carter to whistle on now. My drovers can roll in without an escort. Good.',
    objectives: [{ type: 'kill', targetMobId: 'forest_wolf', count: 10, label: 'Forest Wolf slain' }],
    xpReward: 460, copperReward: 150, itemRewards: {},
    requiresQuest: 'q_tap_spit_boar', minLevel: 5,
  },
  q_tap_cellar_spiders: {
    id: 'q_tap_cellar_spiders', name: 'Webs in the Stores',
    giverNpcId: 'innkeeper_wenna', turnInNpcId: 'innkeeper_wenna',
    text: 'No sooner do I stock the back stores than webwood lurkers spin them shut from the eastern woods. My maids will not set foot in there, and I cannot blame them. Burn them out for me, $N — 8 Webwood Lurkers — so I can hang the larder properly.',
    completionText: 'Every web swept and the stores dry and clean. I can finally hang the smoked meat where it belongs. My thanks.',
    objectives: [{ type: 'kill', targetMobId: 'webwood_spider', count: 8, label: 'Webwood Lurker burned out' }],
    xpReward: 500, copperReward: 170, itemRewards: {},
    requiresQuest: 'q_tap_house_wolves', minLevel: 5,
  },
  q_tap_prized_greyjaw: {
    id: 'q_tap_prized_greyjaw', name: 'The Prized Tusker',
    giverNpcId: 'innkeeper_wenna', turnInNpcId: 'innkeeper_wenna',
    text: 'Every Harvest Feast wants a centerpiece, $N, and there is none finer than Old Greyjaw — the grey-tusked terror that has outrun every hunter in the Vale for a decade. Bring me that beast and it will turn on my grandest spit. Take a friend; he has earned his name.',
    completionText: 'Old Greyjaw himself, on my table! There is not a tavern from here to the capital that will boast a centerpiece to match it. You have made this feast, $N.',
    objectives: [{ type: 'kill', targetMobId: 'old_greyjaw', count: 1, label: 'Old Greyjaw slain' }],
    xpReward: 700, copperReward: 280, itemRewards: {},
    requiresQuest: 'q_tap_cellar_spiders', minLevel: 5, suggestedPlayers: 2,
  },
  q_tap_unpaid_tab: {
    id: 'q_tap_unpaid_tab', name: 'The Unpaid Tab',
    giverNpcId: 'innkeeper_wenna', turnInNpcId: 'innkeeper_wenna',
    text: 'The vale bandits have a long tab at my tap and no intention of paying it — last night they waylaid the cart carrying my feast-day casks. I want my ale back and a message sent. Cut down 10 Vale Bandits, $N, and let the rest learn the Brightwood Tap is not an easy mark.',
    completionText: 'Word\'s already spread — the bandits give my carts a wide berth now. Consider their tab paid in full, in the only coin they understand.',
    objectives: [{ type: 'kill', targetMobId: 'vale_bandit', count: 10, label: 'Vale Bandit cut down' }],
    xpReward: 560, copperReward: 200, itemRewards: {},
    requiresQuest: 'q_tap_prized_greyjaw', minLevel: 5,
  },
  q_tap_venison: {
    id: 'q_tap_venison', name: 'Venison for the Hall',
    giverNpcId: 'innkeeper_wenna', turnInNpcId: 'innkeeper_wenna',
    text: 'A grand hall wants grand venison, and the brightwood stags of the glade are the proudest deer in the realm. Take 8 of them, $N — clean kills, mind, I want the cuts unspoiled — and the Feast will want for no meat at all.',
    completionText: 'Eight stags, every cut clean as a butcher\'s. The hall will smell of roast venison for a week. You hunt like a poacher and I mean that kindly.',
    objectives: [{ type: 'kill', targetMobId: 'brightwood_stag', count: 8, label: 'Brightwood Stag taken' }],
    xpReward: 620, copperReward: 230, itemRewards: {},
    requiresQuest: 'q_tap_unpaid_tab', minLevel: 6,
  },
  q_tap_gorrak_raid: {
    id: 'q_tap_gorrak_raid', name: 'Gorrak\'s Greed',
    giverNpcId: 'innkeeper_wenna', turnInNpcId: 'innkeeper_wenna',
    text: 'Disaster, $N — Gorrak the Ruthless and his brutes have sniffed out my feast-stores and mean to plunder the lot before the first guest arrives. He camps in the southeast with his ill-gotten haul. End him and take back what is mine, or there will be no Feast at all. He is no common cutthroat; do not face him alone.',
    completionText: 'Gorrak, dead, and my stores hauled back to the cellar where they belong. You saved the Feast outright, $N — I\'ll not forget it.',
    objectives: [{ type: 'kill', targetMobId: 'gorrak', count: 1, label: 'Gorrak the Ruthless slain' }],
    xpReward: 760, copperReward: 320, itemRewards: {},
    requiresQuest: 'q_tap_venison', minLevel: 6, suggestedPlayers: 2,
  },
  q_harvest_feast: {
    id: 'q_harvest_feast', name: 'The Harvest Feast',
    giverNpcId: 'innkeeper_wenna', turnInNpcId: 'innkeeper_wenna',
    text: 'One last gather and the Brightwood Tap opens its doors, $N. The grand board still wants its finest fare: 5 Grovetusk Boar for the crackling, and 5 Sunhide Bear so I can lay on bear-stew the old way. Bring them in and the Harvest Feast is yours to open beside me.',
    completionText: 'Listen to that hall, $N — fiddles, full cups, and not an empty plate in the house. The Brightwood Tap stands open because you made it stand, and your seat at the head of the board is kept warm for as long as you care to claim it.',
    objectives: [
      { type: 'kill', targetMobId: 'grovetusk_boar', count: 5, label: 'Grovetusk Boar taken' },
      { type: 'kill', targetMobId: 'sunhide_bear', count: 5, label: 'Sunhide Bear taken' },
    ],
    xpReward: 1100, copperReward: 460, itemRewards: {},
    requiresQuest: 'q_tap_gorrak_raid', minLevel: 6,
  // The Eastbrook Reliquary — Antiquarian Veska's relic-recovery chain.
  // Every dig site is overrun by scavengers, looters and the restless dead
  // who hoard the Vale's buried history; clear them to reclaim the antiquities.
  q_relic_dust: {
    id: 'q_relic_dust', name: 'Dust of Ages',
    giverNpcId: 'antiquarian_veska', turnInNpcId: 'antiquarian_veska',
    text: "I have come to Eastbrook to catalogue what the soil keeps, $N, but I cannot dig with the dead pawing at my pegs. The barrow on the northeast ruins has spilled its sleepers, and they clutch grave-goods I would very much like to study intact. Lay 8 Restless Bones back down — gently as you can, though I expect it will not be gentle.",
    completionText: "Eight, and the trench is quiet at last. Look — a beadwork clasp, older than the chapel above it. The Vale was burying its dead long before anyone thought to name it. We have only begun.",
    objectives: [{ type: 'kill', targetMobId: 'restless_bones', count: 8, label: 'Restless Bones laid to rest' }],
    xpReward: 480, copperReward: 190, itemRewards: {},
    minLevel: 5,
  },
  q_relic_robbers: {
    id: 'q_relic_robbers', name: 'Grave-Robbers of the Vale',
    giverNpcId: 'antiquarian_veska', turnInNpcId: 'antiquarian_veska',
    text: "Half of what I dig for has already been dug — by thieves. The Vale Bandits in the southeast hills have been selling antiquities to anyone with coin and no conscience, and every piece they fence is a page torn from the record. Thin them out, $N. Ten of them, and perhaps the rest will find an honest trade.",
    completionText: "Ten fewer hands turning my history into pocket-money. They had a satchel of seal-stones on them — provenance lost, of course, but better in my ledger than a smuggler's.",
    objectives: [{ type: 'kill', targetMobId: 'vale_bandit', count: 10, label: 'Vale Bandit grave-robber slain' }],
    xpReward: 560, copperReward: 230, itemRewards: {},
    requiresQuest: 'q_relic_dust',
  },
  q_relic_tunnels: {
    id: 'q_relic_tunnels', name: 'Below the Old Dig',
    giverNpcId: 'antiquarian_veska', turnInNpcId: 'antiquarian_veska',
    text: "The kobolds in the southwest mine have tunnelled straight through a buried vault I had marked for excavation — candle-headed vandals, gnawing past masonry they cannot even see. Drive 12 of the Tunnel Rats out before they collapse the whole chamber on what is left of it.",
    completionText: "Twelve, and the shaft holds. They had been using a carved lintel-stone as a doorstop, $N. A doorstop! The things I rescue from ruin are mostly rescued from the people standing in it.",
    objectives: [{ type: 'kill', targetMobId: 'tunnel_rat', count: 12, label: 'Tunnel Rat Digger driven off' }],
    xpReward: 640, copperReward: 260, itemRewards: {},
    requiresQuest: 'q_relic_robbers',
  },
  q_relic_web: {
    id: 'q_relic_web', name: 'The Cobwebbed Reliquary',
    giverNpcId: 'antiquarian_veska', turnInNpcId: 'antiquarian_veska',
    text: "There is a shrine in the western woods I have wanted to enter for a month, and a month is how long the webwood spiders have held it. The whole reliquary is spun shut. Clear 10 of the Webwood Lurkers, $N, and I can finally read the altar-stone beneath their silk.",
    completionText: "Ten, and the silk comes away in sheets. The altar names a rite older than any chapel record I hold. Wonderful. Terrifying. Mostly wonderful.",
    objectives: [{ type: 'kill', targetMobId: 'webwood_spider', count: 10, label: 'Webwood Lurker cleared' }],
    xpReward: 700, copperReward: 280, itemRewards: {},
    requiresQuest: 'q_relic_tunnels',
  },
  q_relic_matriarch: {
    id: 'q_relic_matriarch', name: 'Keeper of the Web',
    giverNpcId: 'antiquarian_veska', turnInNpcId: 'antiquarian_veska',
    text: "The lurkers were only the household. Their matriarch — the Sableweb — has wrapped the reliquary's inner vault in a cocoon the size of a cart, and I will not lose what is inside it to a spider's larder. End her, $N. Bring me the run of the vault.",
    completionText: "The Sableweb Matriarch, dead, and the inner vault open at last. Reliquary-bronze, untouched since it was sealed. This single piece justifies the whole expedition.",
    objectives: [{ type: 'kill', targetMobId: 'sableweb_matriarch', count: 1, label: 'Sableweb Matriarch slain' }],
    xpReward: 820, copperReward: 320, itemRewards: {},
    requiresQuest: 'q_relic_web',
    minLevel: 6,
  },
  q_relic_drowned: {
    id: 'q_relic_drowned', name: 'Drowned Antiquities',
    giverNpcId: 'antiquarian_veska', turnInNpcId: 'antiquarian_veska',
    text: "The northwest lake shore was a landing once — there are footings under the waterline, and the Mudfin murlocs have been dredging votive offerings from the silt and hoarding them in their nests. They do not know what they hold, only that it shines. Take back 10 of the skulkers, $N, before the lake claims the rest.",
    completionText: "Ten skulkers, and a netful of votives recovered from the muck. Lake-offerings, every one — the Vale's old folk gave their valley back to the water. I am only borrowing it.",
    objectives: [{ type: 'kill', targetMobId: 'mudfin_murloc', count: 10, label: 'Mudfin Skulker slain' }],
    xpReward: 760, copperReward: 300, itemRewards: {},
    requiresQuest: 'q_relic_matriarch',
  },
  q_relic_field: {
    id: 'q_relic_field', name: 'The Rooted Field',
    giverNpcId: 'antiquarian_veska', turnInNpcId: 'antiquarian_veska',
    text: "My most promising trench is the east meadow — a buried floor, mosaic by the feel of the shards. And the wild boar root through it nightly, churning a thousand years of order into mud and tusk-marks. Cull 10 of the herd, $N, before they plough my mosaic into gravel.",
    completionText: "Ten, and the meadow lies still tonight. What they left of the mosaic I can piece together; what they smashed is gone for good. Such is the work — we save what the world has not yet finished destroying.",
    objectives: [{ type: 'kill', targetMobId: 'wild_boar', count: 10, label: 'Wild Boar culled from the dig' }],
    xpReward: 800, copperReward: 320, itemRewards: {},
    requiresQuest: 'q_relic_drowned',
  },
  q_relic_custodian: {
    id: 'q_relic_custodian', name: 'The Hollow Custodian',
    giverNpcId: 'antiquarian_veska', turnInNpcId: 'antiquarian_veska',
    text: "The northeast ruin has a guardian, $N — Captain Verlan, they call the thing, an officer dead so long he has forgotten he is dead, still standing watch over a war-relic he will let no living hand touch. I want that relic, and it will not come quietly. Do not face the Hollow Custodian alone.",
    completionText: "Verlan down, and his charge laid bare: a campaign standard, furled and rotting, from a war no chronicle of mine records. He guarded it past death itself. Whatever it meant to him, it means a new chapter to me.",
    objectives: [{ type: 'kill', targetMobId: 'captain_verlan', count: 1, label: 'Captain Verlan slain' }],
    xpReward: 940, copperReward: 380, itemRewards: {},
    requiresQuest: 'q_relic_field',
    minLevel: 6,
    suggestedPlayers: 2,
  },
  q_relic_gorrak: {
    id: 'q_relic_gorrak', name: "Gorrak's Plunder",
    giverNpcId: 'antiquarian_veska', turnInNpcId: 'antiquarian_veska',
    text: "Every relic the bandits fenced passed through one set of hands first: Gorrak the Ruthless, who keeps the richest of the haul for his own den in the far southeast camp. He has a chest of the Vale's stolen history under his cot, $N. Cut him down and it is ours again.",
    completionText: "Gorrak, finished, and his plunder-chest hauled into the light. Half the pieces here I had given up as lost forever. You have not just recovered relics — you have recovered the record itself.",
    objectives: [{ type: 'kill', targetMobId: 'gorrak', count: 1, label: 'Gorrak the Ruthless slain' }],
    xpReward: 1000, copperReward: 420, itemRewards: {},
    requiresQuest: 'q_relic_custodian',
    minLevel: 6,
    suggestedPlayers: 2,
  },
  q_relic_looterking: {
    id: 'q_relic_looterking', name: 'The Looter-King',
    giverNpcId: 'antiquarian_veska', turnInNpcId: 'antiquarian_veska',
    text: "One thief remains above all the others, $N — Mogger, the ogre who calls himself a king and treats the whole Vale as his hoard. Every relic that did not pass through Gorrak's hands ended in Mogger's. End his reign at the east-meadow rise, and the Eastbrook Reliquary will at last be whole.",
    completionText: "Mogger, dead, and the last of the Vale's scattered history carried home on your back. The Reliquary stands complete — every barrow, shrine, vault and landing accounted for. They will read this valley's story now because you fought to keep it readable. Go well, custodian.",
    objectives: [{ type: 'kill', targetMobId: 'mogger', count: 1, label: 'Mogger the Looter-King slain' }],
    xpReward: 1150, copperReward: 500, itemRewards: {},
    requiresQuest: 'q_relic_gorrak',
    minLevel: 6,
  // The Brightwood Apiary — Beekeeper Orla's pollinator-rounds chain.
  // Every objective targets an already-camped Brightwood Glade / Vale mob, so
  // the chain spawns nothing new and shifts no world-gen RNG. Copper + XP only,
  // so no new item entities and no item-name localization.
  // -------------------------------------------------------------------------
  q_apiary_clover: {
    id: 'q_apiary_clover', name: 'Sweet Clover',
    giverNpcId: 'beekeeper_orla', turnInNpcId: 'beekeeper_orla',
    text: 'My bees forage the clover meadows north of the glade, but the grovetusk boars root it all up before it can flower. No clover, no honey, $N. Drive off 6 Grovetusk Boars and let the blossoms come back.',
    completionText: 'Bless you. By midsummer that meadow will hum loud enough to hear from here.',
    objectives: [{ type: 'kill', targetMobId: 'grovetusk_boar', count: 6, label: 'Grovetusk Boar driven off' }],
    xpReward: 480, copperReward: 130, itemRewards: {},
  },
  q_apiary_waxthieves: {
    id: 'q_apiary_waxthieves', name: 'Wax Thieves',
    giverNpcId: 'beekeeper_orla', turnInNpcId: 'beekeeper_orla',
    text: 'The glade foxes have learned to tip my hive-stands and lick the comb clean — wax, brood and all. Thin 6 Glade Foxes before they teach the whole skulk that trick.',
    completionText: 'Clever things, foxes. A pity, but a beekeeper must choose her bees.',
    objectives: [{ type: 'kill', targetMobId: 'glade_fox', count: 6, label: 'Glade Fox thinned' }],
    xpReward: 500, copperReward: 140, itemRewards: {},
    requiresQuest: 'q_apiary_clover',
  },
  q_apiary_underminers: {
    id: 'q_apiary_underminers', name: 'The Underminers',
    giverNpcId: 'beekeeper_orla', turnInNpcId: 'beekeeper_orla',
    text: 'Thornpelt badgers dig their setts right under my hive-stands and the whole frame tips into the dirt come morning. Cull 6 Thornpelt Badgers so my stands sit level again.',
    completionText: 'Solid ground under every hive now. The bees thank you, in their way.',
    objectives: [{ type: 'kill', targetMobId: 'thornpelt_badger', count: 6, label: 'Thornpelt Badger culled' }],
    xpReward: 520, copperReward: 150, itemRewards: {},
    requiresQuest: 'q_apiary_waxthieves',
  },
  q_apiary_forage_path: {
    id: 'q_apiary_forage_path', name: 'The Forage Path',
    giverNpcId: 'beekeeper_orla', turnInNpcId: 'beekeeper_orla',
    text: 'I walk a circuit between the hives twice a day, and a bramble lynx has taken to stalking it. I cannot tend bees with one eye on the brush. Clear 6 Bramble Lynx from the forage path.',
    completionText: 'I can walk my rounds in peace now. That is worth more than coin — but take the coin too.',
    objectives: [{ type: 'kill', targetMobId: 'bramble_lynx', count: 6, label: 'Bramble Lynx cleared' }],
    xpReward: 540, copperReward: 160, itemRewards: {},
    requiresQuest: 'q_apiary_underminers',
  },
  q_apiary_honey_raiders: {
    id: 'q_apiary_honey_raiders', name: 'Honey Raiders',
    giverNpcId: 'beekeeper_orla', turnInNpcId: 'beekeeper_orla',
    text: 'A sunhide bear can smash a season of work to splinters in a single night, chasing the honey. Five of them range the upper glade now. Drive off 5 Sunhide Bears, $N, before they find my stands.',
    completionText: 'My hives still stand because of you. I will not forget it.',
    objectives: [{ type: 'kill', targetMobId: 'sunhide_bear', count: 5, label: 'Sunhide Bear driven off' }],
    xpReward: 620, copperReward: 190, itemRewards: {},
    requiresQuest: 'q_apiary_forage_path',
    suggestedPlayers: 2,
  },
  q_apiary_blossom_blight: {
    id: 'q_apiary_blossom_blight', name: 'Blossom Blight',
    giverNpcId: 'beekeeper_orla', turnInNpcId: 'beekeeper_orla',
    text: 'My bees range as far as the western woods for early blossom, but the webwood lurkers shroud every flowering branch in silk and the bees will not land. Cull 8 Webwood Lurkers and free the blossoms.',
    completionText: 'The western blooms are open to the air again. Good honey comes of distant flowers.',
    objectives: [{ type: 'kill', targetMobId: 'webwood_spider', count: 8, label: 'Webwood Lurker culled' }],
    xpReward: 560, copperReward: 170, itemRewards: {},
    requiresQuest: 'q_apiary_honey_raiders',
  },
  q_apiary_trampled_meadow: {
    id: 'q_apiary_trampled_meadow', name: 'The Trampled Meadow',
    giverNpcId: 'beekeeper_orla', turnInNpcId: 'beekeeper_orla',
    text: 'The east meadow was my richest forage until the wild boars made a wallow of it. Thin 8 Wild Boars and give the wildflowers a season to recover.',
    completionText: 'Wildflowers by spring, honey by summer. That is how it is meant to go.',
    objectives: [{ type: 'kill', targetMobId: 'wild_boar', count: 8, label: 'Wild Boar thinned' }],
    xpReward: 580, copperReward: 175, itemRewards: {},
    requiresQuest: 'q_apiary_blossom_blight',
  },
  q_apiary_north_road: {
    id: 'q_apiary_north_road', name: 'The Road North',
    giverNpcId: 'beekeeper_orla', turnInNpcId: 'beekeeper_orla',
    text: 'I send my filled combs to Eastbrook by the north road, but the forest wolves have made it a gauntlet and no carter will take the run. Thin 8 Forest Wolves so my honey reaches the market.',
    completionText: 'The carters will ride again, and Eastbrook will have its honey. My thanks, $N.',
    objectives: [{ type: 'kill', targetMobId: 'forest_wolf', count: 8, label: 'Forest Wolf thinned' }],
    xpReward: 600, copperReward: 185, itemRewards: {},
    requiresQuest: 'q_apiary_trampled_meadow',
  },
  q_apiary_clover_gluttons: {
    id: 'q_apiary_clover_gluttons', name: 'Clover Gluttons',
    giverNpcId: 'beekeeper_orla', turnInNpcId: 'beekeeper_orla',
    text: 'The brightwood hares have bred past all reason and they crop the clover to the root before it can flower — and a bee cannot forage a lawn. Thin 8 Brightwood Hares and leave some bloom for my bees.',
    completionText: 'A meadow shared is a meadow that flowers. The balance is kept, thanks to you.',
    objectives: [{ type: 'kill', targetMobId: 'brightwood_hare', count: 8, label: 'Brightwood Hare thinned' }],
    xpReward: 620, copperReward: 195, itemRewards: {},
    requiresQuest: 'q_apiary_north_road',
  },
  q_apiary_moth_monarch: {
    id: 'q_apiary_moth_monarch', name: 'The Monarch of the Glade',
    giverNpcId: 'beekeeper_orla', turnInNpcId: 'beekeeper_orla',
    text: 'There is one I have feared to name: the Brightwood Monarch, the great moth of the deep glade. Where it roosts the blossom withers and the bees fall silent for days. End it, $N, and the Brightwood will bloom as it has not in living memory. Do not go alone.',
    completionText: 'The glade is waking — you can smell the blossom from here. You have given my bees a future, $N, and Brightwood will taste it in every drop of honey.',
    objectives: [{ type: 'kill', targetMobId: 'brightwood_monarch', count: 1, label: 'Brightwood Monarch ended' }],
    xpReward: 1100, copperReward: 420, itemRewards: {},
    requiresQuest: 'q_apiary_clover_gluttons',
    suggestedPlayers: 2,
  },
  // The Eastbrook Lamplighters — Lampwright Sefa keeps the road-lanterns
  // burning. As the nights lengthen, the dark between the lights fills with
  // prowlers, and a snuffed lantern is an invitation. Every objective reuses
  // mobs that already roam the Vale, so the chain adds no new spawns.
  // -------------------------------------------------------------------------
  q_lamp_first_night: {
    id: 'q_lamp_first_night', name: 'First Night on the Lamp Road',
    giverNpcId: 'lampwright_sefa', turnInNpcId: 'lampwright_sefa',
    text: "I light the lanterns; you keep the road clear enough that I can reach them. The wolves come down off the north hills the moment the sun sets and worry at anyone with a torch. Thin them out — 8 Forest Wolves — so I can make my rounds, $N.",
    completionText: 'A whole circuit lit and not one wolf at my heels. You have the makings of a lamp-warden, $N.',
    objectives: [{ type: 'kill', targetMobId: 'forest_wolf', count: 8, label: 'Forest Wolf slain' }],
    xpReward: 240, copperReward: 70, itemRewards: {},
  },
  q_lamp_boars: {
    id: 'q_lamp_boars', name: 'Trampled Wicks',
    giverNpcId: 'lampwright_sefa', turnInNpcId: 'lampwright_sefa',
    text: 'The east-meadow boars root up my spare oil-jars and snap the low lantern posts clean off. I cannot keep a flame on that stretch while they rampage. Drive off 8 Wild Boars and the meadow road will stay lit.',
    completionText: 'No more splintered posts in the morning. Good. Here is your share of the oil-fund.',
    objectives: [{ type: 'kill', targetMobId: 'wild_boar', count: 8, label: 'Wild Boar driven off' }],
    xpReward: 320, copperReward: 110, itemRewards: {},
    requiresQuest: 'q_lamp_first_night',
    minLevel: 2,
  },
  q_lamp_foxes: {
    id: 'q_lamp_foxes', name: 'Lantern Thieves',
    giverNpcId: 'lampwright_sefa', turnInNpcId: 'lampwright_sefa',
    text: "Glade foxes have learned my oiled wicks make fine bedding, and they carry off a dozen a night. Charming little thieves — and ruinous to a lamplighter's stores. Cull 8 Glade Foxes up the glade road for me.",
    completionText: 'My wick-box stayed full a whole night through. Bless you, $N.',
    objectives: [{ type: 'kill', targetMobId: 'glade_fox', count: 8, label: 'Glade Fox culled' }],
    xpReward: 360, copperReward: 130, itemRewards: {},
    requiresQuest: 'q_lamp_boars',
    minLevel: 2,
  },
  q_lamp_webs: {
    id: 'q_lamp_webs', name: 'Webs Over the Wicks',
    giverNpcId: 'lampwright_sefa', turnInNpcId: 'lampwright_sefa',
    text: 'The western lanterns are smothered in spider-silk — a lit wick under all that web is a fire waiting to spread. I dare not relight them until the lurkers are dealt with. Burn out 8 Webwood Lurkers, $N.',
    completionText: 'Clean glass and open flame on the west road again. You have a steady hand.',
    objectives: [{ type: 'kill', targetMobId: 'webwood_spider', count: 8, label: 'Webwood Lurker slain' }],
    xpReward: 420, copperReward: 150, itemRewards: {},
    requiresQuest: 'q_lamp_foxes',
    minLevel: 3,
  },
  q_lamp_badgers: {
    id: 'q_lamp_badgers', name: 'Diggers at the Posts',
    giverNpcId: 'lampwright_sefa', turnInNpcId: 'lampwright_sefa',
    text: 'Thornpelt badgers den right at the base of my glade-road posts and the burrows topple them in the night. A leaning lantern throws no light where it is needed. See off 8 Thornpelt Badgers so my posts stand straight.',
    completionText: 'Every post upright at dawn. The glade road owes you its light, $N.',
    objectives: [{ type: 'kill', targetMobId: 'thornpelt_badger', count: 8, label: 'Thornpelt Badger driven off' }],
    xpReward: 480, copperReward: 170, itemRewards: {},
    requiresQuest: 'q_lamp_webs',
    minLevel: 3,
  },
  q_lamp_snuffers: {
    id: 'q_lamp_snuffers', name: 'The Snuffers',
    giverNpcId: 'lampwright_sefa', turnInNpcId: 'lampwright_sefa',
    text: 'There is a worse thief than any fox: the Vale bandits snuff my lanterns on purpose, then rob whoever stumbles blind in the dark they made. That is no accident — it is ambush. Bring 10 Vale Bandits to justice for me.',
    completionText: 'A lit road is a safe road, and you have made the southeast safe again. The marshal himself should hear of this.',
    objectives: [{ type: 'kill', targetMobId: 'vale_bandit', count: 10, label: 'Vale Bandit brought to justice' }],
    xpReward: 600, copperReward: 210, itemRewards: {},
    requiresQuest: 'q_lamp_badgers',
    minLevel: 4,
  },
  q_lamp_lakeroad: {
    id: 'q_lamp_lakeroad', name: 'Lights on the Lake Road',
    giverNpcId: 'lampwright_sefa', turnInNpcId: 'lampwright_sefa',
    text: 'The lake-shore lanterns are the hardest to keep — the Mudfin drag them off their posts and into the shallows for the shine. I will not lose another to the murk. Slay 8 Mudfin Skulkers and reclaim the shore for the light.',
    completionText: 'The lake road glows again, end to end. The fishermen will sleep easier, and so will I.',
    objectives: [{ type: 'kill', targetMobId: 'mudfin_murloc', count: 8, label: 'Mudfin Skulker slain' }],
    xpReward: 660, copperReward: 230, itemRewards: {},
    requiresQuest: 'q_lamp_snuffers',
    minLevel: 4,
  },
  q_lamp_lynx: {
    id: 'q_lamp_lynx', name: 'Eyes in the Lamplight',
    giverNpcId: 'lampwright_sefa', turnInNpcId: 'lampwright_sefa',
    text: 'Bramble lynx stalk the deep-glade road, and they have learned that lamplight means prey gathers near. Twice now I have found a circle of green eyes waiting just past the glow. Cull 8 Bramble Lynx before they take a traveler — or me.',
    completionText: 'No more eyes in the dark past the last lantern. You have steady nerve, $N.',
    objectives: [{ type: 'kill', targetMobId: 'bramble_lynx', count: 8, label: 'Bramble Lynx culled' }],
    xpReward: 720, copperReward: 260, itemRewards: {},
    requiresQuest: 'q_lamp_lakeroad',
    minLevel: 5,
  },
  q_lamp_bears: {
    id: 'q_lamp_bears', name: 'The Far Lanterns',
    giverNpcId: 'lampwright_sefa', turnInNpcId: 'lampwright_sefa',
    text: 'The last posts before the deep glade go untended — sunhide bears claim that ground, and no lamplighter has reached them in a season. I mean to change that. Clear 6 Sunhide Bears so I can carry the light to the far lanterns at last.',
    completionText: 'Lit, every one, for the first time in a season. The whole Vale road is unbroken now — save for one stretch I dread to speak of.',
    objectives: [{ type: 'kill', targetMobId: 'sunhide_bear', count: 6, label: 'Sunhide Bear cleared' }],
    xpReward: 800, copperReward: 290, itemRewards: {},
    requiresQuest: 'q_lamp_lynx',
    minLevel: 5,
  },
  q_lamp_the_walking_lights: {
    id: 'q_lamp_the_walking_lights', name: 'The Lights That Walk',
    giverNpcId: 'lampwright_sefa', turnInNpcId: 'lampwright_sefa',
    text: "By the old chapel hill, the dead carry their own pale lights now, drifting between my posts as if to mock them. The living will not walk a road the dead have claimed. Put 10 Restless Bones back into the dark for good, $N — and let my lanterns be the only lights on that hill.",
    completionText: 'The hill road is ours again, lit by honest flame and nothing else. From the lake to the deep glade, not a stretch goes dark. That is your doing, $N — every lamplighter after me will keep your name.',
    objectives: [{ type: 'kill', targetMobId: 'restless_bones', count: 10, label: 'Restless Bones laid to rest' }],
    xpReward: 950, copperReward: 360, itemRewards: {},
    requiresQuest: 'q_lamp_bears',
    minLevel: 6,
  // --- The Vale Post Road: Postmaster Calder reopens the Eastbrook mail relay ---
  q_post_firstrun: {
    id: 'q_post_firstrun', name: 'The Dusk Run',
    giverNpcId: 'postmaster_calder', turnInNpcId: 'postmaster_calder',
    text: 'My riders carry the post north at dusk — and at dusk the wolves own the north road. I have lost two mail-bags and nearly a rider this month to the packs. Thin them, $N. Slay 10 Forest Wolves and give my couriers their twilight back.',
    completionText: 'Ten wolves, and the dusk run went through tonight without a torch lit in fear. The north road is the spine of the Vale post — you have set it straight.',
    objectives: [{ type: 'kill', targetMobId: 'forest_wolf', count: 10, label: 'Forest Wolf slain' }],
    xpReward: 300, copperReward: 90, itemRewards: {},
    minLevel: 2,
  },
  q_post_meadow: {
    id: 'q_post_meadow', name: 'The Meadow Relay',
    giverNpcId: 'postmaster_calder', turnInNpcId: 'postmaster_calder',
    text: 'The west road cuts through the meadow where the boars root. A rider at a gallop and a charging bull boar make a broken leg and a scattered post-bag, every time. Cull 8 Wild Boar off the meadow relay, $N, and let my riders keep their seat.',
    completionText: 'Eight boars off the relay and not a letter spilled since. A rider can canter the meadow now instead of picking through it — that is an hour saved on every western run.',
    objectives: [{ type: 'kill', targetMobId: 'wild_boar', count: 8, label: 'Wild Boar culled' }],
    xpReward: 360, copperReward: 110, itemRewards: {},
    requiresQuest: 'q_post_firstrun',
    minLevel: 2,
  },
  q_post_reedwater: {
    id: 'q_post_reedwater', name: 'The Lakeside Post',
    giverNpcId: 'postmaster_calder', turnInNpcId: 'postmaster_calder',
    text: 'The shortest road to the fishing huts runs along the reedwater, and the Mudfin have made it a drowning-trap. They drag a rider into the shallows for the shine of a brass buckle. Drive off 8 Mudfin Skulkers, $N, so the lakeside post can run dry-shod again.',
    completionText: 'The reedwater road is clear and my rider came back with dry boots and a full bag for the first time all season. The huts will have their letters by morning.',
    objectives: [{ type: 'kill', targetMobId: 'mudfin_murloc', count: 8, label: 'Mudfin Skulker driven off' }],
    xpReward: 430, copperReward: 140, itemRewards: {},
    requiresQuest: 'q_post_meadow',
    minLevel: 3,
  },
  q_post_eastwood: {
    id: 'q_post_eastwood', name: 'Silk Across the Road',
    giverNpcId: 'postmaster_calder', turnInNpcId: 'postmaster_calder',
    text: 'The eastwood path is the only dry way to the outlying farms, and the Webwood lurkers have strung it shut. My last rider walked his horse home blind under a face full of web. Burn out 8 Webwood Lurkers, $N, and let the farm post move again.',
    completionText: 'The eastwood path is open to the sky once more. The farms have been a fortnight without word from town — you have just ended their silence.',
    objectives: [{ type: 'kill', targetMobId: 'webwood_spider', count: 8, label: 'Webwood Lurker burned out' }],
    xpReward: 470, copperReward: 160, itemRewards: {},
    requiresQuest: 'q_post_reedwater',
    minLevel: 3,
  },
  q_post_collapse: {
    id: 'q_post_collapse', name: 'The Tunnel Cut-Through',
    giverNpcId: 'postmaster_calder', turnInNpcId: 'postmaster_calder',
    text: "Foreman Odell let my riders use the old mine cut-through to save a half-day on the south runs — but his tunnel rats have bred into the passage and they swarm a lantern the moment it shows. Put down 12 Tunnel Rat Diggers, $N, and the shortcut is mine again.",
    completionText: 'Twelve of the candle-headed vermin cleared, and the cut-through carries the post once more. Half a day shaved off every southern run — Odell and I both owe you a drink.',
    objectives: [{ type: 'kill', targetMobId: 'tunnel_rat', count: 12, label: 'Tunnel Rat Digger slain' }],
    xpReward: 520, copperReward: 190, itemRewards: {},
    requiresQuest: 'q_post_eastwood',
    minLevel: 4,
  },
  q_post_tollroad: {
    id: 'q_post_tollroad', name: "The Robbers' Toll",
    giverNpcId: 'postmaster_calder', turnInNpcId: 'postmaster_calder',
    text: 'The southeast hills have turned to a robbers\' toll road, and the post is the richest prize on it — every bag holds coin-letters and bank-notes. The Vale Bandits have taken three runs straight. Bring them Eastbrook\'s answer, $N: cut down 8 Vale Bandits and break their toll.',
    completionText: 'Eight bandits down and the toll road quiet. My riders carry the coin-post through the hills again — and word is spreading that robbing the mail now costs a man his neck.',
    objectives: [{ type: 'kill', targetMobId: 'vale_bandit', count: 8, label: 'Vale Bandit cut down' }],
    xpReward: 560, copperReward: 220, itemRewards: {},
    requiresQuest: 'q_post_collapse',
    minLevel: 4,
  },
  q_post_greyjaw: {
    id: 'q_post_greyjaw', name: 'The Courier-Eater',
    giverNpcId: 'postmaster_calder', turnInNpcId: 'postmaster_calder',
    text: 'There is one wolf the north riders will not name aloud — Old Greyjaw, a grey devil that has killed more couriers than the cold. He shadows the dusk run and takes the last rider in the line. End him, $N, and you end the one nightmare my people still carry.',
    completionText: 'Old Greyjaw, dead by your hand. My riders will sleep tonight without listening for him on the north road. You have killed more than a wolf — you have killed a story that scared good people off the post.',
    objectives: [{ type: 'kill', targetMobId: 'old_greyjaw', count: 1, label: 'Old Greyjaw slain' }],
    xpReward: 720, copperReward: 260, itemRewards: {},
    requiresQuest: 'q_post_tollroad',
    minLevel: 5,
  },
  q_post_chapelnight: {
    id: 'q_post_chapelnight', name: 'The Night Mail',
    giverNpcId: 'postmaster_calder', turnInNpcId: 'postmaster_calder',
    text: 'The fastest road east passes the old chapel, and the dead there will not let a living rider by after dark. My night-mail has gone the long way round for a month, and the long way is a day late. Lay 10 Restless Bones to rest, $N, and give the night mail its road.',
    completionText: 'Ten of the restless laid down, and the night mail rode the chapel road for the first time since autumn. A day saved on every eastern run, and a haunted road made quiet — Brother Aldric will rest easier too.',
    objectives: [{ type: 'kill', targetMobId: 'restless_bones', count: 10, label: 'Restless Bones laid to rest' }],
    xpReward: 760, copperReward: 280, itemRewards: {},
    requiresQuest: 'q_post_greyjaw',
    minLevel: 5,
  },
  q_post_cache: {
    id: 'q_post_cache', name: 'The Stolen Mail-Cache',
    giverNpcId: 'postmaster_calder', turnInNpcId: 'postmaster_calder',
    text: 'The bandits did worse than rob a run — they sacked my southern relay-house and carried off a whole cache of post, and Gorrak the Ruthless sits on it now in his camp. Months of letters, $N. Carve through 6 Vale Bandits to reach him, kill Gorrak, and bring the Vale\'s mail home. Do not go alone.',
    completionText: 'The cache is recovered and Gorrak will rob no more riders. Wills, deeds, soldiers\' letters home — all of it back in the sorting-room where it belongs. You have given a hundred families news they had given up on.',
    objectives: [
      { type: 'kill', targetMobId: 'vale_bandit', count: 6, label: 'Vale Bandit carved through' },
      { type: 'kill', targetMobId: 'gorrak', count: 1, label: 'Gorrak the Ruthless slain' },
    ],
    xpReward: 920, copperReward: 360, itemRewards: {},
    requiresQuest: 'q_post_chapelnight',
    minLevel: 6,
    suggestedPlayers: 2,
  },
  q_post_burned_post: {
    id: 'q_post_burned_post', name: 'The Man Who Burned the Post',
    giverNpcId: 'postmaster_calder', turnInNpcId: 'postmaster_calder',
    text: 'One name is behind all of it, $N. Captain Verlan — the deserter who torched the old post-house and turned the Vale\'s roads to robbery so no warning could ride ahead of him. While he lives, no road in the Vale is ever truly open. End him at his camp, and the Vale post is whole again. Take a companion — he does not die easy.',
    completionText: 'Captain Verlan is dead, and with him the last hand strangling the Vale roads. Every relay open, every rider safe, every letter moving — because you would not let a road stay closed. The Vale Post will carry your name to every town it reaches, $N.',
    objectives: [{ type: 'kill', targetMobId: 'captain_verlan', count: 1, label: 'Captain Verlan slain' }],
    xpReward: 1100, copperReward: 440, itemRewards: {},
    requiresQuest: 'q_post_cache',
    minLevel: 6,
    suggestedPlayers: 2,
  },
};

export const ZONE1_QUEST_ORDER = [
  'q_wolves', 'q_boars', 'q_spiders', 'q_greyjaw', 'q_murlocs',
  'q_supplies', 'q_bandits', 'q_mine', 'q_bones', 'q_ringleader',
  'q_whispers', 'q_names_of_the_dead', 'q_silence_the_call',
  'q_rite', 'q_sexton', 'q_hollow', 'q_gravecallers_trail',
  'q_mogger_tracks', 'q_mogger',
  'q_brightwood_thinning', 'q_brightwood_monarch',
  // The Warden's Ledger bounty chain
  'q_ledger_first_duty', 'q_ledger_teeth', 'q_ledger_reedwater', 'q_ledger_silk',
  'q_ledger_brood', 'q_ledger_deepvermin', 'q_ledger_toll', 'q_ledger_vigil',
  'q_ledger_great_boar', 'q_ledger_outlaw_captain',
  // The Glade Warden's Long Watch chain (Ranger Elwyn)
  'q_glade_overbrowse', 'q_glade_foxes', 'q_glade_census', 'q_glade_diggers',
  'q_glade_amber', 'q_glade_rut', 'q_glade_treeline', 'q_glade_snares',
  'q_glade_apex', 'q_glade_long_watch',
  // The Eastbrook Bounty Board chain
  'q_bounty_wolves', 'q_bounty_boars', 'q_bounty_bristleback', 'q_bounty_webwood',
  'q_bounty_matriarch', 'q_bounty_mudfin', 'q_bounty_bandits', 'q_bounty_restless',
  'q_bounty_verlan', 'q_bounty_maldrec',
  // The Brightwood Tap Harvest Feast chain
  'q_tap_cellar_rats', 'q_tap_table_fowl', 'q_tap_spit_boar', 'q_tap_house_wolves',
  'q_tap_cellar_spiders', 'q_tap_prized_greyjaw', 'q_tap_unpaid_tab', 'q_tap_venison',
  'q_tap_gorrak_raid', 'q_harvest_feast',
  // The Eastbrook Reliquary chain
  'q_relic_dust', 'q_relic_robbers', 'q_relic_tunnels', 'q_relic_web',
  'q_relic_matriarch', 'q_relic_drowned', 'q_relic_field', 'q_relic_custodian',
  'q_relic_gorrak', 'q_relic_looterking',
  // The Brightwood Apiary chain
  'q_apiary_clover', 'q_apiary_waxthieves', 'q_apiary_underminers',
  'q_apiary_forage_path', 'q_apiary_honey_raiders', 'q_apiary_blossom_blight',
  'q_apiary_trampled_meadow', 'q_apiary_north_road', 'q_apiary_clover_gluttons',
  'q_apiary_moth_monarch',
  // The Eastbrook Lamplighters chain
  'q_lamp_first_night', 'q_lamp_boars', 'q_lamp_foxes', 'q_lamp_webs',
  'q_lamp_badgers', 'q_lamp_snuffers', 'q_lamp_lakeroad', 'q_lamp_lynx',
  'q_lamp_bears', 'q_lamp_the_walking_lights',
  // The Vale Post Road courier chain
  'q_post_firstrun', 'q_post_meadow', 'q_post_reedwater', 'q_post_eastwood',
  'q_post_collapse', 'q_post_tollroad', 'q_post_greyjaw', 'q_post_chapelnight',
  'q_post_cache', 'q_post_burned_post',
];

// ---------------------------------------------------------------------------
// World layout. Town sits at origin. +z north, +x WEST (east is -x:
// facing 0 looks along +z and turning right decreases facing, so the
// rendered world and the corrected map both put -x on your right).
// ---------------------------------------------------------------------------

export const ZONE1_CAMPS: CampDef[] = [
  // Wolves: north woods
  { mobId: 'forest_wolf', center: { x: -15, z: 55 }, radius: 22, count: 7 },
  { mobId: 'forest_wolf', center: { x: 20, z: 70 }, radius: 20, count: 6 },
  { mobId: 'old_greyjaw', center: { x: 0, z: 95 }, radius: 8, count: 1 },
  // Boars: east meadow
  { mobId: 'wild_boar', center: { x: 55, z: 12 }, radius: 22, count: 6 },
  { mobId: 'wild_boar', center: { x: 80, z: -15 }, radius: 18, count: 5 },
  { mobId: 'elder_bristleback', center: { x: 104, z: 24 }, radius: 4, count: 1 },
  { mobId: 'mogger', center: { x: 118, z: -26 }, radius: 5, count: 1 },
  // Spiders: western woods
  { mobId: 'webwood_spider', center: { x: -60, z: 5 }, radius: 22, count: 7 },
  { mobId: 'sableweb_matriarch', center: { x: -72, z: 28 }, radius: 5, count: 1 },
  // Murlocs: lake shore northwest — camp straddles the waterline
  { mobId: 'mudfin_murloc', center: { x: -75, z: 57 }, radius: 14, count: 8 },
  // Kobolds: mine southwest
  { mobId: 'tunnel_rat', center: { x: -82, z: -62 }, radius: 20, count: 9 },
  // Bandits: southeast camp
  { mobId: 'vale_bandit', center: { x: 65, z: -65 }, radius: 24, count: 7 },
  { mobId: 'vale_bandit', center: { x: 90, z: -90 }, radius: 16, count: 5 },
  { mobId: 'gorrak', center: { x: 92, z: -92 }, radius: 2, count: 1 },
  // Undead: ruins northeast
  { mobId: 'restless_bones', center: { x: 80, z: 78 }, radius: 18, count: 8 },
  { mobId: 'captain_verlan', center: { x: 92, z: 90 }, radius: 4, count: 1 },
  // Brightwood Glade: wildlife grove in the far north
  { mobId: 'brightwood_hare', center: { x: 20, z: 132 }, radius: 22, count: 6 },
  { mobId: 'glade_fox', center: { x: 48, z: 128 }, radius: 20, count: 5 },
  { mobId: 'spotted_fawn', center: { x: 30, z: 145 }, radius: 18, count: 5 },
  { mobId: 'meadow_crane', center: { x: 8, z: 150 }, radius: 16, count: 4 },
  { mobId: 'thornpelt_badger', center: { x: 58, z: 150 }, radius: 16, count: 4 },
  { mobId: 'dawnmane_doe', center: { x: 32, z: 138 }, radius: 20, count: 5 },
  { mobId: 'bramble_lynx', center: { x: 60, z: 132 }, radius: 18, count: 6 },
  { mobId: 'brightwood_stag', center: { x: 24, z: 156 }, radius: 16, count: 4 },
  { mobId: 'grovetusk_boar', center: { x: 52, z: 162 }, radius: 14, count: 4 },
  { mobId: 'sunhide_bear', center: { x: 36, z: 166 }, radius: 12, count: 3 },
  { mobId: 'brightwood_monarch', center: { x: 38, z: 170 }, radius: 4, count: 1 },
];

// Spawned LAST in the merged CAMPS array (see data.ts) so these appended draws
// fall after every other zone's camp spawns — and the camp loop is the final
// RNG consumer at construction (ground objects, dungeon doors and addPlayer draw
// none). Keeping the rare elite at the tail means adding it shifts no other
// content's deterministic spawn rolls, so fixed-seed tests stay stable.
export const ZONE1_CHAPEL_CAMPS: CampDef[] = [
  // A pair of bone guardians flank the chapel's broken altar; their binder lurks within.
  { mobId: 'restless_bones', center: { x: 88, z: 90 }, radius: 6, count: 2 },
  { mobId: 'wraithbinder_maldrec', center: { x: 88, z: 92 }, radius: 3, count: 1 },
];


export const ZONE1_OBJECTS: GroundObjectDef[] = [
  {
    itemId: 'supply_crate',
    name: 'Stolen Supply Crate',
    positions: [
      { x: 58, z: -58 }, { x: 73, z: -70 }, { x: 86, z: -82 }, { x: 95, z: -97 },
      { x: 64, z: -76 }, { x: 81, z: -94 },
    ],
  },
  {
    itemId: 'gravecaller_sigil',
    name: "Gravecaller's Sigil",
    positions: [{ x: 84, z: 88 }, { x: 76, z: 92 }],
  },
  {
    itemId: 'weathered_ledger_page',
    name: 'Weathered Ledger Page',
    positions: [{ x: 78, z: 84 }, { x: 83, z: 88 }, { x: 86, z: 92 }],
  },
  {
    itemId: 'morthen_grimoire',
    name: "Morthen's Grimoire",
    positions: [{ x: 78, z: 86 }],
  },
];

// Roads from town toward each hub — used for terrain painting and the map.
// Roads from town toward each hub — used for terrain painting and the map.
export const ZONE1_ROADS: { x: number; z: number }[][] = [
  [{ x: 0, z: 8 }, { x: -8, z: 30 }, { x: -15, z: 55 }, { x: -2, z: 78 }],          // north to wolves
  [{ x: 8, z: 2 }, { x: 30, z: 8 }, { x: 55, z: 12 }],                              // east to boars
  [{ x: 6, z: -6 }, { x: 30, z: -30 }, { x: 50, z: -50 }, { x: 65, z: -65 }],       // southeast to bandits
  [{ x: -8, z: 6 }, { x: -35, z: 25 }, { x: -58, z: 48 }, { x: -66, z: 58 }],       // northwest to lake
  [{ x: -6, z: -6 }, { x: -30, z: -28 }, { x: -55, z: -45 }, { x: -70, z: -55 }],   // southwest to mine
  [{ x: 6, z: 8 }, { x: 35, z: 35 }, { x: 60, z: 60 }, { x: 78, z: 74 }],           // northeast to ruins
];

// ---------------------------------------------------------------------------
// Static props (rendering + collision share this placement data)
// ---------------------------------------------------------------------------

export const ZONE1_PROPS: ZonePropsDef = {
  buildings: [
    { kind: 'house', x: 10, z: 12, w: 7, d: 6, rot: -0.4 },
    { kind: 'house', x: -10, z: 10, w: 6, d: 5, rot: 0.5 },
    { kind: 'inn', x: 12, z: -6, w: 6, d: 7, rot: 2.4 },
    { kind: 'chapel', x: -16, z: -8, w: 5, d: 7, rot: 0.9 },
  ],
  wells: [{ x: 0, z: 2, r: 1.5 }],
  stalls: [
    { x: -8.5, z: 3, rot: Math.PI / 2, r: 1.7 },
    { x: 9.5, z: 17.5, rot: -2.7, r: 1.7 }, // Smith Haldren's smithy stall
    { x: 0, z: 11.5, rot: Math.PI, r: 1.8 }, // The Merchant's World Market stall
  ],
  mines: [{ x: -88, z: -68, rot: 0.8 }],
  docks: [{ x: -64, z: 60, rot: -2.2, hutLocal: { x: 2.8, z: 2.4, hw: 1.7, hd: 1.5 } }],
  tents: [
    { x: 62, z: -61, rot: 0.4, scale: 1 },
    { x: 69, z: -69, rot: 2.1, scale: 1 },
    { x: 88, z: -86, rot: 1.2, scale: 1.3 },
    { x: 95, z: -94, rot: -0.6, scale: 1 },
  ],
  crates: [[60, -63], [66, -67], [87, -88], [93, -90], [70, -72]],
  campfires: [[3, -4], [65, -65], [90, -90], [-80, -60], [-61, 56]],
  mudHuts: [[-73, 59], [-78, 54], [-69, 55]],
  ruinRings: [{ x: 80, z: 78, ringR: 7, columns: 7 }],
  fences: [
    { x1: 16, z1: 16, x2: 22, z2: 4 },
    { x1: -16, z1: 14, x2: -20, z2: 2 },
  ],
  graveyards: [{ x: -14, z: -14 }],
};
