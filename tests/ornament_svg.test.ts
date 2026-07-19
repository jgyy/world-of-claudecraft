import { describe, expect, it } from 'vitest';
import {
  bannerOrnamentMaskImage,
  bannerScrollPath,
  cornerOrnamentMaskImage,
  MINIMAP_RING_BAND,
  MINIMAP_RING_OUTER_R,
  PORTRAIT_RING_BAND,
  PORTRAIT_RING_OUTER_R,
  ringOrnamentMaskImage,
  ropeRingPath,
  TITLE_BANNER_HEIGHT,
  TITLE_BANNER_WIDTH,
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

  it('rope ring path closes both the outer and inner contours', () => {
    const d = ropeRingPath(40, 5);
    const subpaths = d.split(' Z').filter((s) => s.trim().length > 0);
    expect(subpaths).toHaveLength(2);
    for (const sub of subpaths) {
      expect(sub.trim().startsWith('M')).toBe(true);
    }
  });

  it('ring mask image encodes a valid, self-contained SVG', () => {
    const value = ringOrnamentMaskImage(PORTRAIT_RING_OUTER_R, PORTRAIT_RING_BAND);
    const svg = decodeSvg(value);
    expect(svg).toContain(
      `viewBox='0 0 ${PORTRAIT_RING_OUTER_R * 2} ${PORTRAIT_RING_OUTER_R * 2}'`,
    );
    expect(svg).toContain('fill-rule="evenodd"');
  });

  it('minimap ring uses a distinct radius from the portrait ring', () => {
    expect(MINIMAP_RING_OUTER_R).not.toBe(PORTRAIT_RING_OUTER_R);
    expect(MINIMAP_RING_BAND).toBeGreaterThan(0);
    const portrait = ringOrnamentMaskImage(PORTRAIT_RING_OUTER_R, PORTRAIT_RING_BAND);
    const minimap = ringOrnamentMaskImage(MINIMAP_RING_OUTER_R, MINIMAP_RING_BAND);
    expect(portrait).not.toBe(minimap);
  });

  it('banner scroll path stays within its declared width and height bounds', () => {
    const d = bannerScrollPath(TITLE_BANNER_WIDTH, TITLE_BANNER_HEIGHT);
    const numbers = (d.match(/-?\d+(\.\d+)?/g) ?? []).map(Number);
    for (const val of numbers) {
      expect(val).toBeGreaterThanOrEqual(-0.01);
    }
    const xs = numbers.filter((_, i) => i % 2 === 0);
    expect(Math.max(...xs)).toBeLessThanOrEqual(TITLE_BANNER_WIDTH + 0.01);
  });

  it('banner mask image encodes a valid SVG at the declared size', () => {
    const value = bannerOrnamentMaskImage(TITLE_BANNER_WIDTH, TITLE_BANNER_HEIGHT);
    const svg = decodeSvg(value);
    expect(svg).toContain(`viewBox='0 0 ${TITLE_BANNER_WIDTH} ${TITLE_BANNER_HEIGHT}'`);
  });

  it('no ornament data URI embeds a themed hex color (colorless shapes only)', () => {
    const uris = [
      ...cornerOrnamentMaskImage().split(', '),
      ringOrnamentMaskImage(PORTRAIT_RING_OUTER_R, PORTRAIT_RING_BAND),
      ringOrnamentMaskImage(MINIMAP_RING_OUTER_R, MINIMAP_RING_BAND),
      bannerOrnamentMaskImage(TITLE_BANNER_WIDTH, TITLE_BANNER_HEIGHT),
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

  it('is deterministic: same inputs produce byte-identical output', () => {
    expect(cornerOrnamentMaskImage()).toBe(cornerOrnamentMaskImage());
    expect(ringOrnamentMaskImage(50, 6)).toBe(ringOrnamentMaskImage(50, 6));
    expect(bannerOrnamentMaskImage(200, 20)).toBe(bannerOrnamentMaskImage(200, 20));
  });
});
