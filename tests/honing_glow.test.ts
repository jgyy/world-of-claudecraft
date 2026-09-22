// The honed-gear world-space identity: the wire-field tier predicate and the
// reused regalia shed (src/render/honing_glow_core.ts), the pooled emitter
// (vfx.ts honingGlow), the renderer's cached wiring beside the regalia motes,
// and the fairness doc bullet. Mirrors tests/legendary_regalia.test.ts.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { honingGlowEmitDt, honingGlowTierOf } from '../src/render/honing_glow_core';
import { legendaryRegaliaEmitDt } from '../src/render/legendary_regalia_core';
import { HONING_GLOW_RANKS } from '../src/sim/progression/honing_policy';
import { stripComments } from './helpers/strip_comments';

const read = (rel: string): string =>
  stripComments(readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8'));

describe('the core', () => {
  it('reads the highest honing tier across worn slots and nothing else', () => {
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
    expect(honingGlowTierOf({ mainhand: { honing: { rank: Number.NaN, stats: {} } } })).toBe(0);
  });

  it('emits 0 for no tier, reduced motion, or a dead frame, and the regalia shed otherwise', () => {
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
    expect(
      renderer.lastIndexOf("gfxTierAtLeast(GFX.effectsTier, 'medium')", tierAt),
    ).toBeGreaterThan(-1);
  });

  it('the emitter uses the pooled cloud only and caches its HDR colors per composer', () => {
    const vfx = read('src/render/vfx.ts');
    const start = vfx.indexOf('honingGlow(entityId: number, dt: number, tier: number): void {');
    expect(start, 'vfx.ts honingGlow emitter missing').toBeGreaterThan(-1);
    const body = vfx.slice(start, vfx.indexOf('mountSlimeTrail(', start));
    expect(body).not.toMatch(/\.visible\s*=/);
    expect(body).not.toMatch(/new THREE\./);
    expect(body).toContain('honingGlowColor(tier)');
    expect(body).toContain('this.emitCount(style.ratePerSec, dt)');
    expect(body).toContain('this.anchor(entityId');
    expect(body).toContain('this.spawn(');
    const cache = vfx.slice(vfx.indexOf('function honingGlowColor('), start);
    expect(cache).toContain('GFX.composer');
    expect(cache).toContain('multiplyScalar(hdr(');
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
