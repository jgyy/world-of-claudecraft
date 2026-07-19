// Pins the quest-log landscape relayout (game-window landscape relayout program,
// docs/superpowers/specs/2026-07-19-window-landscape-relayout-design.md): the window
// widened to give the detail pane real reading width, and the detail pane's own
// max-height cap was dropped so it flows with the window's single outer scroll instead
// of a second, nested scroll region.

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = readFileSync(new URL('../src/styles/components.css', import.meta.url), 'utf8');

describe('quest log: landscape window + single-scroll detail pane', () => {
  it('widens the live #quest-log-window rule to a landscape footprint without overriding the shared width clamp', () => {
    const start = css.indexOf('#quest-log-window {');
    expect(start).toBeGreaterThan(0);
    const block = css.slice(start, css.indexOf('}', start));
    expect(block).toContain('width: 880px;');
    // The shared `.window` clamp (layout.css) already bounds width against the
    // JS-synced app viewport, divided by --window-scale; a raw-100vw override here
    // would disagree with it and can overflow the viewport at higher ui-scale.
    expect(block).not.toMatch(/max-width\s*:/);
  });

  it('drops the detail pane max-height cap so it no longer nests a second scrollbar, and gives it a reading-measure cap', () => {
    const start = css.indexOf('.ql-detail {');
    expect(start).toBeGreaterThan(0);
    const block = css.slice(start, css.indexOf('}', start));
    expect(block).toContain('max-height: none;');
    expect(block).not.toContain('max-height: 380px;');
    expect(block).toContain('max-width: 70ch;');
  });

  it('widens the quest list column to match the wider window', () => {
    const start = css.indexOf('.ql-list {');
    expect(start).toBeGreaterThan(0);
    const block = css.slice(start, css.indexOf('}', start));
    expect(block).toContain('width: 220px;');
  });

  it('widens the later window-frame-phase #quest-log-window rule too (it cascades last and would otherwise win), without overriding the shared width clamp', () => {
    const occurrences = [...css.matchAll(/#quest-log-window \{/g)];
    // Pinning the exact count on purpose: both rules must move together. If a
    // legitimate third `#quest-log-window { ... }` block is ever added, widen it
    // to match the other two and bump this count rather than deleting the check.
    expect(occurrences.length).toBe(2);
    const start = occurrences[1].index ?? -1;
    expect(start).toBeGreaterThan(0);
    const block = css.slice(start, css.indexOf('}', start));
    expect(block).toContain('width: 880px;');
    expect(block).not.toMatch(/max-width\s*:/);
  });

  it('widens the window-frame-phase detail max-width cap along with the window', () => {
    const start = css.indexOf('#quest-log-window .window-body .ql-detail {');
    expect(start).toBeGreaterThan(0);
    const block = css.slice(start, css.indexOf('}', start));
    expect(block).toContain('max-width: 70ch;');
  });
});
