// The honed-gear world-space identity: the wire-field tier predicate and the
// reused regalia shed (src/render/honing_glow_core.ts), the pooled emitter
// (vfx.ts honingGlow), and the renderer's cached wiring beside the regalia
// motes. The load-bearing claims mirror tests/legendary_regalia.test.ts:
//   - the predicate reads ONLY the `honing` record, which rides the eqi peer
//     allowlist, so self, peer, offline, and online compute the same tier;
//   - the emit decision is the regalia shed verbatim (fixed anchor, floored,
//     reduced-motion suppressed), so the fairness contract is stated once;
//   - the emitter mints no light and writes no visibility;
//   - the renderer computes the tier under the regalia's identity gate and
//     emits only for a positive dt, behind the same static effects-tier gate.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  HONING_GLOW_COLORS,
  HONING_GLOW_RATES_PER_SEC,
  honingGlowEmitDt,
  honingGlowStyle,
  honingGlowTierOf,
} from '../src/render/honing_glow_core';
import { legendaryRegaliaEmitDt } from '../src/render/legendary_regalia_core';
import { HONING_GLOW_RANKS } from '../src/sim/progression/honing_policy';
import { stripComments } from './helpers/strip_comments';

const read = (rel: string): string =>
  stripComments(readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8'));

describe('honingGlowTierOf', () => {
  it('is the highest tier across worn slots and ignores every other field', () => {
    expect(honingGlowTierOf({})).toBe(0);
    expect(honingGlowTierOf({ mainhand: { rolled: { quality: 'legendary' } } })).toBe(0);
    expect(
      honingGlowTierOf({ mainhand: { honing: { rank: HONING_GLOW_RANKS[0] - 1, stats: {} } } }),
    ).toBe(0);
    expect(
      honingGlowTierOf({
        mainhand: { honing: { rank: HONING_GLOW_RANKS[0], stats: {} } },
        chest: { honing: { rank: HONING_GLOW_RANKS[1], stats: {} } },
        helmet: undefined,
      }),
    ).toBe(2);
    expect(honingGlowTierOf({ ring1: { honing: { rank: HONING_GLOW_RANKS[2], stats: {} } } })).toBe(
      3,
    );
    // a hostile wire value never throws or lights
    expect(honingGlowTierOf({ mainhand: { honing: { rank: Number.NaN, stats: {} } } })).toBe(0);
  });
});

describe('honingGlowEmitDt', () => {
  it('answers 0 for no tier, reduced motion, or a dead frame, and the regalia shed otherwise', () => {
    expect(honingGlowEmitDt(0, false, 1 / 60, 0)).toBe(0);
    expect(honingGlowEmitDt(undefined, false, 1 / 60, 0)).toBe(0);
    expect(honingGlowEmitDt(2, true, 1 / 60, 0)).toBe(0);
    expect(honingGlowEmitDt(2, false, 0, 0)).toBe(0);
    for (const d2 of [0, 400, 2500, 1e6]) {
      expect(honingGlowEmitDt(1, false, 1 / 60, d2)).toBe(
        legendaryRegaliaEmitDt(true, false, 1 / 60, d2),
      );
      expect(honingGlowEmitDt(3, false, 1 / 60, d2)).toBeGreaterThan(0);
    }
  });
});

describe('honingGlowStyle', () => {
  it('maps each tier to its own color and a climbing rate, clamped into the table', () => {
    expect(HONING_GLOW_COLORS).toHaveLength(HONING_GLOW_RANKS.length);
    expect(HONING_GLOW_RATES_PER_SEC).toHaveLength(HONING_GLOW_RANKS.length);
    for (let tier = 1; tier <= HONING_GLOW_RANKS.length; tier++) {
      expect(honingGlowStyle(tier)).toEqual({
        color: HONING_GLOW_COLORS[tier - 1],
        ratePerSec: HONING_GLOW_RATES_PER_SEC[tier - 1],
      });
      if (tier > 1)
        expect(honingGlowStyle(tier).ratePerSec).toBeGreaterThan(
          honingGlowStyle(tier - 1).ratePerSec,
        );
    }
    expect(honingGlowStyle(0)).toEqual(honingGlowStyle(1));
    expect(honingGlowStyle(99)).toEqual(honingGlowStyle(HONING_GLOW_RANKS.length));
    // sparse like the regalia drift: never a pillar of fire
    for (const rate of HONING_GLOW_RATES_PER_SEC) expect(rate).toBeLessThanOrEqual(4);
  });
});

describe('the renderer and emitter wiring', () => {
  it('computes the tier under the regalia identity gate and emits only for a positive dt', () => {
    const renderer = read('src/render/renderer.ts');
    const gateAt = renderer.indexOf('v.legendaryRegaliaRef = e.equippedInstances;');
    const tierAt = renderer.indexOf('v.honingGlowTier = honingGlowTierOf(e.equippedInstances);');
    const decisionAt = renderer.indexOf(
      'const honeDt = honingGlowEmitDt(v.honingGlowTier, this.reducedMotion(), dt, d2);',
    );
    const emitAt = renderer.indexOf(
      'if (honeDt > 0) this.vfx.honingGlow(e.id, honeDt, v.honingGlowTier ?? 0);',
    );
    expect(gateAt).toBeGreaterThan(-1);
    expect(tierAt).toBeGreaterThan(gateAt);
    expect(decisionAt).toBeGreaterThan(tierAt);
    expect(emitAt).toBeGreaterThan(decisionAt);
    expect(renderer.split('this.vfx.honingGlow(')).toHaveLength(2);
    // inside the same static effects-tier gate as the regalia motes
    const gateOpen = renderer.lastIndexOf("gfxTierAtLeast(GFX.effectsTier, 'medium')", tierAt);
    expect(gateOpen).toBeGreaterThan(-1);
    expect(renderer.slice(gateOpen, emitAt)).not.toContain('legendaryRegaliaRef !== undefined');
  });

  it('the emitter uses the pooled cloud only: no light, no visibility writes', () => {
    const vfx = read('src/render/vfx.ts');
    const start = vfx.indexOf('honingGlow(entityId: number, dt: number, tier: number): void {');
    expect(start, 'vfx.ts honingGlow emitter missing').toBeGreaterThan(-1);
    const body = vfx.slice(start, vfx.indexOf('mountSlimeTrail(', start));
    expect(body).not.toMatch(/\.visible\s*=/);
    expect(body).not.toMatch(/new THREE\.PointLight/);
    expect(body).toContain('honingGlowStyle(tier)');
    expect(body).toContain('this.emitCount(style.ratePerSec, dt)');
    expect(body).toContain('this.anchor(entityId');
    expect(body).toContain('this.spawn(');
  });

  it("pins the fairness doc's honing bullet to the shipped shape", () => {
    const doc = readFileSync(
      new URL('../docs/design/graphics-settings-fairness.md', import.meta.url),
      'utf8',
    );
    const bulletAt = doc.indexOf('- The honed-gear shimmer (');
    expect(bulletAt).toBeGreaterThan(-1);
    const bulletEnd = doc.indexOf('\n- ', bulletAt + 1);
    const bullet = doc.slice(bulletAt, bulletEnd === -1 ? undefined : bulletEnd);
    for (const claim of [
      'src/render/honing_glow_core.ts',
      'Vfx.honingGlow',
      'gfxTierAtLeast(GFX.effectsTier)',
      'never the FPS governor',
      'legendaryRegaliaEmitDt',
      'prefers-reduced-motion',
    ]) {
      expect(bullet, `fairness bullet lost the claim: ${claim}`).toContain(claim);
    }
  });
});
