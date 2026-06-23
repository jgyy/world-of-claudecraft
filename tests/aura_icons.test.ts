import { describe, it, expect } from 'vitest';
import { ABILITIES } from '../src/sim/data';
import { iconDataUrl, hasExplicitAuraIcon } from '../src/ui/icons';

// Buff/debuff aura frames (the player buff bar and a mob's DoT debuffs, both via
// Hud.renderAuras) request their icon with kind 'aura'. When the aura carries a
// real ability id that ships an image-based skill icon (public/ui/skills/<class>/<id>.png),
// the aura must show that SAME image, not the older procedural recipe — otherwise a
// DoT/buff renders one art on the action bar and a different one as an aura.
//
// Note: this suite runs in the default `node` env (no canvas), so it only exercises
// the early-return image branch of iconDataUrl. Ids without an image fall through to
// the procedural canvas path, which needs a DOM and is covered by the renderer E2E.

// A representative DoT (debuff) per applicable class plus a few persistent buffs —
// every id below is in ABILITY_IMAGE_IDS, so it has a shipped PNG.
const IMAGE_AURA_IDS = [
  'corruption', 'curse_of_agony', 'immolate', // warlock DoTs
  'serpent_sting',                            // hunter DoT
  'rend',                                     // warrior DoT
  'moonfire', 'insect_swarm', 'rip',          // druid DoTs
  'flame_shock',                              // shaman DoT
  'shadow_word_pain',                         // priest DoT
  'rupture', 'garrote',                       // rogue DoTs
  'arcane_intellect', 'mark_of_the_wild',     // buffs
  'battle_shout', 'power_word_fortitude',     // buffs
];

describe('aura icons reuse image-based ability art', () => {
  it('every sampled aura id actually ships a PNG (guards the fixture)', () => {
    for (const id of IMAGE_AURA_IDS) {
      const url = iconDataUrl('ability', id);
      expect(url, `${id} should have an image-based ability icon`).toMatch(/^\/ui\/skills\//);
    }
  });

  it('an aura with an image-backed ability id renders that image, not a procedural data URL', () => {
    for (const id of IMAGE_AURA_IDS) {
      const cls = ABILITIES[id]?.class;
      expect(cls, `${id} must be a known ability`).toBeTruthy();
      const expected = `/ui/skills/${cls}/${id}.png`;
      expect(iconDataUrl('aura', id), `aura ${id}`).toBe(expected);
      // and it matches what the action bar shows for the same ability
      expect(iconDataUrl('aura', id)).toBe(iconDataUrl('ability', id));
    }
  });
});

// Most active buffs come from a class ability and reuse that ability's art (above).
// But a buff can also be applied with an id that is NOT an ability: an elixir
// (`elixir_<itemId>`), a scroll, a Fiesta power-up, or a stat drain from a mob. For
// those, Hud.renderAuras falls back to a generic `aura_<kind>` recipe (see the
// `ABILITIES[a.id] ? a.id : `aura_${a.kind}`` gate). If a buff_* kind has no entry
// in AURA_RECIPES it renders an arbitrary, meaningless medallion (the `abilityFallback`
// icon) — the "old skill icon" players see on the buff bar. Every stat-buff kind must
// therefore ship a deliberate aura recipe. Mirror of the AuraKind `buff_*` members in
// src/sim/types.ts: add a kind there ⇒ add its recipe + this entry in the same change.
const BUFF_AURA_KINDS = [
  'buff_ap', 'buff_armor', 'buff_int', 'buff_agi', 'buff_dodge', 'buff_speed',
  'buff_haste', 'buff_sta', 'buff_allstats', 'buff_spi', 'buff_scale', 'buff_jump',
] as const;

describe('every stat-buff aura kind has a deliberate buff-bar icon', () => {
  it('no buff_* kind falls back to the generic medallion', () => {
    for (const kind of BUFF_AURA_KINDS) {
      expect(
        hasExplicitAuraIcon(kind),
        `aura_${kind} needs a deliberate AURA_RECIPES entry (currently renders the generic fallback)`,
      ).toBe(true);
    }
  });
});
