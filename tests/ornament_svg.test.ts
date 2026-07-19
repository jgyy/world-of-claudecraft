import { describe, expect, it } from 'vitest';
import {
  cornerOrnamentMaskImage,
  giltDustBackground,
  giltGradientBackground,
  grainTextureBackgroundImage,
  MICRO_RING_OUTER_R,
  MINIMAP_RING_OUTER_R,
  noisyEdgeMaskImage,
  PORTRAIT_RING_OUTER_R,
  ringInner,
  ringOrnamentMaskImage,
  taperAccentMaskImage,
} from '../src/ui/ornament_svg';

// A mask-image data URI never bakes in color: the referencing CSS rule
// always supplies `background: var(--border)` (or similar) so the shape
// repaints per theme preset. Any raw hex/rgb inside the SVG markup itself
// (other than the SVG spec's own #000 default-fill boilerplate the mask
// mechanism relies on, which is intentional and colorless in effect) would
// silently defeat that and freeze the ornament to one preset.
function decodeSvg(dataUri: string): string {
  const match = dataUri.match(/^url\("data:image\/svg\+xml,(.*)"\)$/);
  expect(match).not.toBeNull();
  return decodeURIComponent(match?.[1] ?? '');
}

describe('ornament_svg', () => {
  it('corner mask image has four comma-separated data-URI layers', () => {
    const value = cornerOrnamentMaskImage();
    const layers = value.split(', ');
    expect(layers).toHaveLength(4);
    for (const layer of layers) {
      expect(layer).toMatch(/^url\("data:image\/svg\+xml,/);
      const svg = decodeSvg(layer);
      expect(svg).toContain('<svg');
      expect(svg).toContain('viewBox');
    }
  });

  it('corner motif mirrors are distinct (four different corners, not four copies)', () => {
    const layers = cornerOrnamentMaskImage().split(', ');
    const unique = new Set(layers);
    expect(unique.size).toBe(4);
  });

  it('the ring is a single noisy band: no second inner circle, no gem/dot accents', () => {
    // Round 5: "1 line is sufficient" for a circular component -- a second
    // concentric stroke plus cardinal/diagonal accents read as too many
    // border layers on a small badge, so the ring is exactly one shape.
    const svg = ringInner(40);
    expect(svg).toContain('fill-rule="evenodd"');
    expect(svg.match(/<circle/g)).toBeNull();
    expect((svg.match(/<path/g) ?? []).length).toBe(1);
  });

  it('ring mask image encodes a valid, self-contained SVG', () => {
    const value = ringOrnamentMaskImage(PORTRAIT_RING_OUTER_R);
    const svg = decodeSvg(value);
    expect(svg).toContain(
      `viewBox='0 0 ${PORTRAIT_RING_OUTER_R * 2} ${PORTRAIT_RING_OUTER_R * 2}'`,
    );
  });

  it('minimap ring uses a distinct radius from the portrait ring', () => {
    expect(MINIMAP_RING_OUTER_R).not.toBe(PORTRAIT_RING_OUTER_R);
    const portrait = ringOrnamentMaskImage(PORTRAIT_RING_OUTER_R);
    const minimap = ringOrnamentMaskImage(MINIMAP_RING_OUTER_R);
    expect(portrait).not.toBe(minimap);
  });

  it('the micro ring (small circular badges) is distinct from both larger rings', () => {
    expect(MICRO_RING_OUTER_R).not.toBe(PORTRAIT_RING_OUTER_R);
    expect(MICRO_RING_OUTER_R).not.toBe(MINIMAP_RING_OUTER_R);
    const micro = ringOrnamentMaskImage(MICRO_RING_OUTER_R);
    expect(micro).not.toBe(ringOrnamentMaskImage(PORTRAIT_RING_OUTER_R));
    const svg = decodeSvg(micro);
    expect(svg).toContain(`viewBox='0 0 ${MICRO_RING_OUTER_R * 2} ${MICRO_RING_OUTER_R * 2}'`);
  });

  it('taper accent mask image encodes a valid small SVG', () => {
    const svg = decodeSvg(taperAccentMaskImage());
    expect(svg).toContain('<svg');
    expect(svg).toContain('<circle');
    expect(svg).toContain('<path');
  });

  it('noisy edge tile is a single closed ribbon path', () => {
    const svg = decodeSvg(noisyEdgeMaskImage(1, false));
    expect(svg).toContain('<path');
    expect(svg).toMatch(/\bZ\b/);
  });

  it('the vertical edge tile transposes its viewBox from the horizontal one', () => {
    const h = decodeSvg(noisyEdgeMaskImage(5, false));
    const v = decodeSvg(noisyEdgeMaskImage(5, true));
    const hBox = h
      .match(/viewBox='([^']+)'/)?.[1]
      .split(' ')
      .map(Number);
    const vBox = v
      .match(/viewBox='([^']+)'/)?.[1]
      .split(' ')
      .map(Number);
    expect(hBox?.[2]).toBe(vBox?.[3]);
    expect(hBox?.[3]).toBe(vBox?.[2]);
  });

  it('different seeds produce different edge textures', () => {
    expect(noisyEdgeMaskImage(1, false)).not.toBe(noisyEdgeMaskImage(2, false));
  });

  it('the edge tile is seam-free: its start and end cross-section match exactly', () => {
    // The whole point of picking INTEGER-frequency noise harmonics is that the
    // wobble at t=0 and t=1 (one full period) is identical, so CSS mask-repeat
    // never shows a visible jump where one tile ends and the next begins. The
    // path is `M <top points> L <bottom points, reversed> Z`; the first and
    // the LAST top-edge sample are at t=0 and t=1 respectively, so they split
    // the point list exactly in half.
    const svg = decodeSvg(noisyEdgeMaskImage(9, false));
    const d = svg.match(/d="([^"]+)"/)?.[1] ?? '';
    const pairs = d
      .replace(/^M\s*/, '')
      .replace(/\s*Z\s*$/, '')
      .split(/\s*L\s*/)
      .map((pair) => pair.trim().split(/\s+/).map(Number));
    const topCount = pairs.length / 2;
    const firstTopY = pairs[0][1];
    const lastTopY = pairs[topCount - 1][1];
    expect(lastTopY).toBeCloseTo(firstTopY, 1);
  });

  it('the ring wobble is seam-free: the outer stroke closes at 0/360 degrees with no jump', () => {
    // Same seam-free contract as the edge tile, but around a circle instead
    // of a straight tile: RING_WOBBLE_SEED's harmonics use integer angular
    // frequencies, so the noised radius at angle 0 equals the radius at 360.
    const svg = ringInner(60);
    const outerPath = svg.match(/<path d="([^"]+)" fill-rule="evenodd"\/>/)?.[1] ?? '';
    const subpaths = outerPath.split(/\s*M\s*/).filter(Boolean);
    const topPoints = subpaths[0]
      .replace(/\s*Z\s*$/, '')
      .split(/\s*L\s*/)
      .map((pair) => pair.trim().split(/\s+/).map(Number));
    const first = topPoints[0];
    const last = topPoints[topPoints.length - 1];
    expect(last[0]).toBeCloseTo(first[0], 1);
    expect(last[1]).toBeCloseTo(first[1], 1);
  });

  it('no ornament data URI embeds a themed hex color (colorless shapes only)', () => {
    const uris = [
      ...cornerOrnamentMaskImage().split(', '),
      ringOrnamentMaskImage(PORTRAIT_RING_OUTER_R),
      ringOrnamentMaskImage(MINIMAP_RING_OUTER_R),
      taperAccentMaskImage(),
      noisyEdgeMaskImage(1, false),
      noisyEdgeMaskImage(2, true),
    ];
    for (const uri of uris) {
      const svg = decodeSvg(uri);
      // The only colors allowed inside a mask source are the SVG default fill
      // (black, alpha-only) and this module's explicit boilerplate `#000`
      // stroke (also alpha-only in mask usage). Any OTHER hex literal would
      // be a real color leaking into shape data.
      const hexes = svg.match(/#[0-9a-fA-F]{3,6}/g) ?? [];
      for (const hex of hexes) {
        expect(hex.toLowerCase()).toBe('#000');
      }
    }
  });

  it('the gilt gradient is a seamless repeating-conic-gradient over theme tokens only', () => {
    const value = giltGradientBackground();
    expect(value).toMatch(/^repeating-conic-gradient\(/);
    expect(value).toContain('var(--border)');
    expect(value).toContain('var(--gold)');
    expect(value).toContain('color-mix(');
    // No raw hex literal anywhere: every color term must be a token
    // reference or a color-mix() of tokens, so the gradient stays
    // theme-reactive instead of freezing to one preset's colors.
    expect(value.match(/#[0-9a-fA-F]{3,6}/g)).toBeNull();
  });

  it('the gilt gradient period divides 360 evenly (no seam where it wraps)', () => {
    const value = giltGradientBackground();
    const degs = (value.match(/(-?\d+(\.\d+)?)deg/g) ?? []).map((s) => Number.parseFloat(s));
    const period = Math.max(...degs);
    expect(360 % period).toBeCloseTo(0, 5);
  });

  it('the gilt dust is a set of gold-toned radial-gradients over theme tokens only', () => {
    const value = giltDustBackground();
    const layerCount = (value.match(/radial-gradient\(/g) ?? []).length;
    expect(layerCount).toBeGreaterThan(1);
    expect(value).toContain('color-mix(in srgb, var(--gold)');
    expect(value).toContain('transparent');
    // No raw hex literal: every color term is a token/color-mix, staying
    // theme-reactive (unlike the neutral grain, this layer carries real
    // gold color, so it must never freeze to one preset's literal hex).
    expect(value.match(/#[0-9a-fA-F]{3,6}/g)).toBeNull();
  });

  it('the grain texture is a colorless (black/white only) tileable speckle field', () => {
    const svg = decodeSvg(grainTextureBackgroundImage());
    expect(svg).toContain('<svg');
    expect(svg.match(/<circle/g)?.length).toBeGreaterThan(20);
    const fills = svg.match(/fill="([^"]+)"/g) ?? [];
    expect(fills.length).toBeGreaterThan(0);
    for (const fill of fills) {
      expect(fill).toMatch(/^fill="rgba\((255,255,255|0,0,0),[\d.]+\)"$/);
    }
  });

  it('is deterministic: same inputs produce byte-identical output', () => {
    expect(cornerOrnamentMaskImage()).toBe(cornerOrnamentMaskImage());
    expect(giltGradientBackground()).toBe(giltGradientBackground());
    expect(giltDustBackground()).toBe(giltDustBackground());
    expect(grainTextureBackgroundImage()).toBe(grainTextureBackgroundImage());
    expect(ringOrnamentMaskImage(50)).toBe(ringOrnamentMaskImage(50));
    expect(taperAccentMaskImage()).toBe(taperAccentMaskImage());
    expect(noisyEdgeMaskImage(3, false)).toBe(noisyEdgeMaskImage(3, false));
  });
});
